import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../database/client.js';
import { spendCoins } from './economyFunds.js';
import {
  BANK_MAX_PASSWORD_LENGTH,
  BANK_MAX_TRANSACTION,
  BANK_MIN_PASSWORD_LENGTH,
  BANK_SESSION_TTL,
  BANK_STOCKS,
  MIDAS_NAME,
  MIDAS_SYMBOL,
  formatMidas,
  formatSignedMidas,
  getStock,
  getStockPrice,
} from './bankData.js';

const BANK_CARD_PATH = fileURLToPath(new URL('../assets/banco-card.jpg', import.meta.url));
const BANK_COIN_PATH = fileURLToPath(new URL('../assets/banco-coin.png', import.meta.url));
const bankSessions = new Map();

class BankError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.code = code;
    Object.assign(this, data);
  }
}

function keyFor(userId, guildId) {
  return `${guildId}:${userId}`;
}

function accountWhere(userId, guildId) {
  return { userId_guildId: { userId, guildId } };
}

function holdingWhere(accountId, symbol) {
  return { accountId_symbol: { accountId, symbol } };
}

function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function passwordMatches(password, stored) {
  const [salt, expectedHex] = String(stored ?? '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function validatePassword(password) {
  return typeof password === 'string'
    && password.length >= BANK_MIN_PASSWORD_LENGTH
    && password.length <= BANK_MAX_PASSWORD_LENGTH
    && password.trim() === password;
}

function formatDate(date) {
  return date ? `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>` : 'agora';
}

function bankFiles() {
  return [
    new AttachmentBuilder(BANK_CARD_PATH, { name: 'midas-bank-card.jpg' }),
    new AttachmentBuilder(BANK_COIN_PATH, { name: 'midas-coin.png' }),
  ];
}

function bankBaseEmbed() {
  return new EmbedBuilder()
    .setColor(0xD79B2A)
    .setThumbnail('attachment://midas-coin.png')
    .setFooter({ text: 'Midas Bank · Sua fortuna, suas regras' });
}

function sessionIsActive(userId, guildId) {
  const session = bankSessions.get(keyFor(userId, guildId));
  if (!session || session.expiresAt <= Date.now()) {
    bankSessions.delete(keyFor(userId, guildId));
    return false;
  }
  session.expiresAt = Date.now() + BANK_SESSION_TTL;
  return true;
}

function openSession(userId, guildId) {
  bankSessions.set(keyFor(userId, guildId), { expiresAt: Date.now() + BANK_SESSION_TTL });
}

function closeSession(userId, guildId) {
  bankSessions.delete(keyFor(userId, guildId));
}

function button(customId, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

export async function sendBankPanel({ guildId, reply }) {
  if (!guildId) {
    return reply({ content: '❌ O Midas Bank só pode ser acessado dentro de um servidor.' });
  }

  const embed = bankBaseEmbed()
    .setTitle('🏦 MIDAS BANK')
    .setDescription(
      `Bem-vindo ao banco oficial do servidor.\n\n` +
      `Sua conta guarda **${MIDAS_NAME} (${MIDAS_SYMBOL})**, uma criptomoeda própria para investir em ações.\n` +
      `Deposite suas coins, compre ativos e acompanhe seu patrimônio com segurança.\n\n` +
      `🔐 Cada membro possui uma senha individual.\n` +
      `📈 O mercado tem cotações dinâmicas.\n` +
      `💳 A imagem do cartão representa sua conta Midas.`,
    )
    .setImage('attachment://midas-bank-card.jpg');

  const row = new ActionRowBuilder().addComponents(
    button('bank_setup', 'Abrir conta', ButtonStyle.Primary),
    button('bank_access', 'Acessar conta', ButtonStyle.Success),
    button('bank_market', 'Ver mercado', ButtonStyle.Secondary),
  );

  return reply({ embeds: [embed], files: bankFiles(), components: [row] });
}

function setupModal() {
  return new ModalBuilder()
    .setCustomId('bank_setup_modal')
    .setTitle('Abrir conta Midas Bank')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bank_password')
          .setLabel('Crie uma senha de 6 a 32 caracteres')
          .setPlaceholder('Não use sua senha do Discord')
          .setStyle(TextInputStyle.Short)
          .setMinLength(BANK_MIN_PASSWORD_LENGTH)
          .setMaxLength(BANK_MAX_PASSWORD_LENGTH)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bank_password_confirm')
          .setLabel('Confirme sua senha')
          .setStyle(TextInputStyle.Short)
          .setMinLength(BANK_MIN_PASSWORD_LENGTH)
          .setMaxLength(BANK_MAX_PASSWORD_LENGTH)
          .setRequired(true),
      ),
    );
}

function accessModal() {
  return new ModalBuilder()
    .setCustomId('bank_access_modal')
    .setTitle('Acessar conta Midas Bank')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bank_password')
          .setLabel('Senha da sua conta')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
}

function amountModal(customId, title, label) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bank_amount')
          .setLabel(label)
          .setPlaceholder('Ex: 1000')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(12)
          .setRequired(true),
      ),
    );
}

function tradeModal(action, symbol) {
  return new ModalBuilder()
    .setCustomId(`bank_trade_${action}_${symbol}`)
    .setTitle(`${action === 'buy' ? 'Comprar' : 'Vender'} ${symbol}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bank_quantity')
          .setLabel('Quantidade de ações')
          .setPlaceholder('Ex: 5')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(9)
          .setRequired(true),
      ),
    );
}

async function getAccount(userId, guildId, db = prisma) {
  return db.bankAccount.findUnique({ where: accountWhere(userId, guildId) });
}

async function requireAccount(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: '❌ O banco só pode ser usado em um servidor.', ephemeral: true });
    return null;
  }
  if (!sessionIsActive(interaction.user.id, interaction.guildId)) {
    await interaction.reply({ content: '🔐 Sua sessão expirou. Clique em **Acessar conta** e informe sua senha novamente.', ephemeral: true });
    return null;
  }
  const account = await getAccount(interaction.user.id, interaction.guildId);
  if (!account) {
    closeSession(interaction.user.id, interaction.guildId);
    await interaction.reply({ content: '❌ Sua conta Midas ainda não existe. Clique em **Abrir conta**.', ephemeral: true });
    return null;
  }
  return account;
}

function dashboardPayload(account, holdings) {
  const now = Date.now();
  let portfolioValue = 0;
  let invested = 0;
  const lines = holdings.map(holding => {
    const stock = getStock(holding.symbol);
    const price = getStockPrice(stock, now);
    const currentValue = holding.quantity * price;
    const costValue = holding.quantity * holding.averagePrice;
    portfolioValue += currentValue;
    invested += costValue;
    const profit = currentValue - costValue;
    return `${stock?.emoji ?? '📊'} **${holding.symbol}** · ${holding.quantity} ações · ${formatMidas(currentValue)}\n> Preço: ${formatMidas(price)} · Resultado: **${formatSignedMidas(profit)}**`;
  });

  const embed = bankBaseEmbed()
    .setTitle('💳 Sua conta Midas Bank')
    .setDescription(
      `Conta protegida por senha · sessão renovada a cada interação\n\n` +
      `💰 **Saldo disponível:** ${formatMidas(account.midasBalance)}\n` +
      `📈 **Carteira:** ${formatMidas(portfolioValue)}\n` +
      `🏦 **Patrimônio total:** ${formatMidas(account.midasBalance + portfolioValue)}\n\n` +
      (holdings.length
        ? `### Seus investimentos\n${lines.join('\n\n')}\n\n`
        : `Você ainda não possui ações. Abra o mercado para começar a investir.\n\n`) +
      `Último acesso: ${formatDate(account.lastAccessAt)}`,
    );

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(BANK_COIN_PATH, { name: 'midas-coin.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        button('bank_deposit', 'Depositar coins', ButtonStyle.Primary),
        button('bank_withdraw', 'Sacar MDS', ButtonStyle.Secondary),
        button('bank_stocks', 'Mercado de ações', ButtonStyle.Success),
        button('bank_logout', 'Sair', ButtonStyle.Danger),
      ),
    ],
    ephemeral: true,
  };
}

async function showDashboard(interaction, account = null) {
  const current = account ?? await requireAccount(interaction);
  if (!current) return true;
  const holdings = await prisma.bankHolding.findMany({
    where: { accountId: current.id },
    orderBy: { symbol: 'asc' },
  });
  return interaction.reply(dashboardPayload(current, holdings));
}

function marketPayload() {
  const now = Date.now();
  const rows = BANK_STOCKS.map(stock => {
    const price = getStockPrice(stock, now);
    return `${stock.emoji} **${stock.symbol} · ${stock.name}** — **${formatMidas(price)}**\n> ${stock.description}`;
  }).join('\n\n');
  const rowsOfButtons = BANK_STOCKS.map(stock => new ActionRowBuilder().addComponents(
    button(`bank_buy_${stock.symbol}`, `Comprar ${stock.symbol}`, ButtonStyle.Success),
    button(`bank_sell_${stock.symbol}`, `Vender ${stock.symbol}`, ButtonStyle.Danger),
  ));
  return {
    embeds: [
      bankBaseEmbed()
        .setTitle(`📈 Mercado Midas · ${MIDAS_SYMBOL}`)
        .setDescription(
          `Cotações atualizadas em janelas de 15 minutos.\n` +
          `Todas as operações usam **${MIDAS_NAME}**.\n\n${rows}`,
        ),
    ],
    files: [new AttachmentBuilder(BANK_COIN_PATH, { name: 'midas-coin.png' })],
    components: [
      ...rowsOfButtons,
      new ActionRowBuilder().addComponents(button('bank_account', 'Voltar para minha conta', ButtonStyle.Primary)),
    ],
    ephemeral: true,
  };
}

async function withTransaction(callback) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error('bank-transaction-retries-exhausted');
}

function positiveAmount(raw, label) {
  const amount = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > BANK_MAX_TRANSACTION) {
    throw new BankError('invalid-amount', { label });
  }
  return amount;
}

async function deposit(userId, guildId, amount) {
  return withTransaction(async tx => {
    const account = await getAccount(userId, guildId, tx);
    if (!account) throw new BankError('no-account');
    const spent = await spendCoins(tx, { userId, guildId, amount });
    if (!spent.ok) throw new BankError('funds', { available: spent.available, amount });
    return tx.bankAccount.update({
      where: { id: account.id },
      data: { midasBalance: { increment: amount }, lastAccessAt: new Date() },
    });
  });
}

async function withdraw(userId, guildId, amount) {
  return withTransaction(async tx => {
    const account = await getAccount(userId, guildId, tx);
    if (!account) throw new BankError('no-account');
    if (account.midasBalance < amount) {
      throw new BankError('midas-funds', { available: account.midasBalance, amount });
    }
    const updated = await tx.bankAccount.update({
      where: { id: account.id },
      data: { midasBalance: { decrement: amount }, lastAccessAt: new Date() },
    });
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: amount },
      update: { balance: { increment: amount } },
    });
    return updated;
  });
}

async function trade(userId, guildId, action, symbol, quantity) {
  const stock = getStock(symbol);
  if (!stock) throw new BankError('invalid-stock');
  const price = getStockPrice(stock);
  const total = price * quantity;

  return withTransaction(async tx => {
    const account = await getAccount(userId, guildId, tx);
    if (!account) throw new BankError('no-account');
    const existing = await tx.bankHolding.findUnique({
      where: holdingWhere(account.id, stock.symbol),
    });

    if (action === 'buy') {
      if (account.midasBalance < total) {
        throw new BankError('midas-funds', { available: account.midasBalance, amount: total });
      }
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      const nextAverage = Math.round(
        (((existing?.quantity ?? 0) * (existing?.averagePrice ?? 0)) + total) / nextQuantity,
      );
      await tx.bankAccount.update({
        where: { id: account.id },
        data: { midasBalance: { decrement: total }, lastAccessAt: new Date() },
      });
      await tx.bankHolding.upsert({
        where: holdingWhere(account.id, stock.symbol),
        create: {
          accountId: account.id,
          userId,
          guildId,
          symbol: stock.symbol,
          quantity,
          averagePrice: price,
        },
        update: { quantity: nextQuantity, averagePrice: nextAverage },
      });
    } else {
      if (!existing || existing.quantity < quantity) {
        throw new BankError('stock-funds', { available: existing?.quantity ?? 0, amount: quantity });
      }
      await tx.bankAccount.update({
        where: { id: account.id },
        data: { midasBalance: { increment: total }, lastAccessAt: new Date() },
      });
      if (existing.quantity === quantity) {
        await tx.bankHolding.delete({ where: { id: existing.id } });
      } else {
        await tx.bankHolding.update({
          where: { id: existing.id },
          data: { quantity: { decrement: quantity } },
        });
      }
    }

    return { action, stock, price, quantity, total };
  });
}

function errorText(error) {
  if (error instanceof BankError) {
    if (error.code === 'invalid-amount') return 'Informe uma quantidade inteira positiva, dentro do limite permitido.';
    if (error.code === 'funds') return `Você possui ${formatMidas(error.available)} em coins, mas precisa de ${formatMidas(error.amount)}.`;
    if (error.code === 'midas-funds') return `Saldo MDS insuficiente. Disponível: ${formatMidas(error.available)} · necessário: ${formatMidas(error.amount)}.`;
    if (error.code === 'stock-funds') return `Você possui apenas **${error.available}** ações desse ativo.`;
    if (error.code === 'invalid-stock') return 'Esse ativo não está disponível no mercado.';
    if (error.code === 'no-account') return 'Sua conta Midas não existe ou foi encerrada.';
  }
  console.error('[BANCO]', error);
  return 'O banco está temporariamente indisponível. Tente novamente em instantes.';
}

async function handleSetup(interaction) {
  const password = interaction.fields.getTextInputValue('bank_password');
  const confirmation = interaction.fields.getTextInputValue('bank_password_confirm');
  if (!validatePassword(password)) {
    return interaction.reply({ content: `❌ A senha deve ter entre ${BANK_MIN_PASSWORD_LENGTH} e ${BANK_MAX_PASSWORD_LENGTH} caracteres, sem espaços nas pontas.`, ephemeral: true });
  }
  if (password !== confirmation) {
    return interaction.reply({ content: '❌ As senhas não conferem.', ephemeral: true });
  }
  try {
    const account = await prisma.bankAccount.create({
      data: { userId: interaction.user.id, guildId: interaction.guildId, passwordHash: passwordHash(password) },
    });
    openSession(interaction.user.id, interaction.guildId);
    return interaction.reply({
      content: `✅ Conta Midas criada com sucesso.\n\nSeu saldo inicial é **${formatMidas(account.midasBalance)}**. Deposite coins para começar a investir.\nSua senha é protegida por hash e não pode ser recuperada pelo bot.`,
      ephemeral: true,
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return interaction.reply({ content: 'ℹ️ Você já possui uma conta Midas. Use **Acessar conta**.', ephemeral: true });
    }
    throw error;
  }
}

async function handleAccess(interaction) {
  const account = await getAccount(interaction.user.id, interaction.guildId);
  if (!account) {
    return interaction.reply({ content: '❌ Você ainda não possui uma conta. Clique em **Abrir conta** primeiro.', ephemeral: true });
  }
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    return interaction.reply({ content: `🔒 Conta temporariamente bloqueada por tentativas inválidas. Tente novamente ${formatDate(account.lockedUntil)}.`, ephemeral: true });
  }
  const password = interaction.fields.getTextInputValue('bank_password');
  if (!passwordMatches(password, account.passwordHash)) {
    const attempts = account.failedAttempts + 1;
    const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { failedAttempts: lock ? 0 : attempts, lockedUntil: lock },
    });
    return interaction.reply({
      content: lock
        ? '🔒 Muitas tentativas inválidas. Sua conta foi bloqueada por 15 minutos.'
        : `❌ Senha incorreta. Tentativas restantes: **${5 - attempts}**.`,
      ephemeral: true,
    });
  }
  await prisma.bankAccount.update({
    where: { id: account.id },
    data: { failedAttempts: 0, lockedUntil: null, lastAccessAt: new Date() },
  });
  openSession(interaction.user.id, interaction.guildId);
  return showDashboard(interaction);
}

export async function handleBankInteraction(interaction) {
  const { customId } = interaction;
  if (!customId?.startsWith('bank_')) return false;

  if (interaction.isButton()) {
    if (customId === 'bank_setup') return interaction.showModal(setupModal());
    if (customId === 'bank_access') return interaction.showModal(accessModal());
    if (customId === 'bank_market') return interaction.reply(marketPayload());
    if (customId === 'bank_logout') {
      closeSession(interaction.user.id, interaction.guildId);
      return interaction.reply({ content: '🔒 Você saiu da conta Midas.', ephemeral: true });
    }
    if (customId === 'bank_account') return showDashboard(interaction);
    if (customId === 'bank_deposit') {
      if (!await requireAccount(interaction)) return true;
      return interaction.showModal(amountModal('bank_deposit_modal', 'Depositar coins', 'Quantidade de coins'));
    }
    if (customId === 'bank_withdraw') {
      if (!await requireAccount(interaction)) return true;
      return interaction.showModal(amountModal('bank_withdraw_modal', 'Sacar Midas Coin', 'Quantidade de MDS'));
    }
    if (customId === 'bank_stocks') {
      if (!await requireAccount(interaction)) return true;
      return interaction.reply(marketPayload());
    }
    const tradeMatch = customId.match(/^bank_(buy|sell)_([A-Z0-9]+)$/);
    if (tradeMatch) {
      if (!await requireAccount(interaction)) return true;
      return interaction.showModal(tradeModal(tradeMatch[1], tradeMatch[2]));
    }
  }

  if (interaction.isModalSubmit()) {
    if (!interaction.guildId) {
      return interaction.reply({ content: '❌ O banco só pode ser usado em um servidor.', ephemeral: true });
    }
    if (customId === 'bank_setup_modal') return handleSetup(interaction);
    if (customId === 'bank_access_modal') return handleAccess(interaction);

    if (customId === 'bank_deposit_modal' || customId === 'bank_withdraw_modal') {
      if (!await requireAccount(interaction)) return true;
      try {
        const amount = positiveAmount(interaction.fields.getTextInputValue('bank_amount'), 'quantidade');
        const account = customId === 'bank_deposit_modal'
          ? await deposit(interaction.user.id, interaction.guildId, amount)
          : await withdraw(interaction.user.id, interaction.guildId, amount);
        return interaction.reply({
          content: customId === 'bank_deposit_modal'
            ? `✅ Depósito concluído. Você recebeu **${formatMidas(amount)}** na conta Midas.`
            : `✅ Saque concluído. **${formatMidas(amount)}** voltou para sua carteira de coins.`,
          ephemeral: true,
          embeds: [bankBaseEmbed().setDescription(`Saldo Midas atual: **${formatMidas(account.midasBalance)}**`)],
          files: [new AttachmentBuilder(BANK_COIN_PATH, { name: 'midas-coin.png' })],
        });
      } catch (error) {
        return interaction.reply({ content: `❌ ${errorText(error)}`, ephemeral: true });
      }
    }

    const tradeMatch = customId.match(/^bank_trade_(buy|sell)_([A-Z0-9]+)$/);
    if (tradeMatch) {
      if (!await requireAccount(interaction)) return true;
      try {
        const quantity = positiveAmount(interaction.fields.getTextInputValue('bank_quantity'), 'quantidade');
        const result = await trade(interaction.user.id, interaction.guildId, tradeMatch[1], tradeMatch[2], quantity);
        return interaction.reply({
          content: `✅ ${result.action === 'buy' ? 'Compra' : 'Venda'} realizada: **${quantity} ações ${result.stock.symbol}** por **${formatMidas(result.total)}** (${formatMidas(result.price)} cada).`,
          ephemeral: true,
          files: [new AttachmentBuilder(BANK_COIN_PATH, { name: 'midas-coin.png' })],
        });
      } catch (error) {
        return interaction.reply({ content: `❌ ${errorText(error)}`, ephemeral: true });
      }
    }
  }

  return true;
}
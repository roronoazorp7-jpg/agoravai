import { Prisma } from '@prisma/client';
import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { spendCoins, totalCoins } from '../../utils/economyFunds.js';
import {
  BUSINESS_DEFS,
  BUSINESS_MAX_LEVEL,
  BUSINESS_STORAGE_HOURS,
  businessIncomePerHour,
  businessRefund,
  businessUpgradeCost,
  calculateBusinessIncome,
  getBusiness,
} from '../../utils/businessData.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

const HOUR_MS = 60 * 60 * 1000;

class BusinessError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.code = code;
    Object.assign(this, data);
  }
}

function formatCoins(value) {
  return Number(value).toLocaleString('pt-BR');
}

function businessChoice(option) {
  return option
    .addChoices(...BUSINESS_DEFS.map(definition => ({
      name: `${definition.emoji} ${definition.name}`.slice(0, 100),
      value: definition.key,
    })));
}

function replyText(text, reply) {
  return reply(buildUtilityV2({ text }));
}

function storeText() {
  return (
    `## 🏢 Mercado de empresas\n\n` +
    `Compre negócios para gerar renda passiva. O lucro acumula por até **${BUSINESS_STORAGE_HOURS} horas**.\n\n` +
    BUSINESS_DEFS.map(definition =>
      `${definition.emoji} **${definition.name}** — investimento: **${formatCoins(definition.price)} coins**\n` +
      `> Renda inicial: **${formatCoins(definition.incomePerHour)} coins/h** · Upgrade: **${formatCoins(definition.upgradeBase)} coins**\n` +
      `> ${definition.description}`,
    ).join('\n\n') +
    `\n\nUse \`/empresa comprar\` para começar.`
  );
}

function businessLine(business, now = Date.now()) {
  const definition = getBusiness(business.businessKey);
  if (!definition) return null;
  const income = calculateBusinessIncome(business, now);
  const nextUpgrade = business.level < BUSINESS_MAX_LEVEL
    ? `Próximo upgrade: **${formatCoins(businessUpgradeCost(definition, business.level))}**`
    : 'Nível máximo atingido';
  return (
    `${definition.emoji} **${definition.name}** — nível **${business.level}/${BUSINESS_MAX_LEVEL}**\n` +
    `> Renda: **${formatCoins(income.incomePerHour)} coins/h** · Disponível: **${formatCoins(income.amount)} coins**\n` +
    `> ${nextUpgrade}`
  );
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
  throw new Error('transaction-retries-exhausted');
}

async function collectBusiness(tx, business, now = Date.now()) {
  const income = calculateBusinessIncome(business, now);
  if (income.amount <= 0) {
    return { ...income, business, collected: false };
  }

  const updated = await tx.business.update({
    where: { id: business.id },
    data: {
      lastCollectedAt: income.nextCollectedAt,
      totalEarned: { increment: income.amount },
    },
  });
  return { ...income, business: updated, collected: true };
}

async function buyBusiness(userId, guildId, businessKey) {
  const definition = getBusiness(businessKey);
  if (!definition) throw new BusinessError('invalid-business');

  return withTransaction(async tx => {
    const existing = await tx.business.findUnique({
      where: { userId_guildId_businessKey: { userId, guildId, businessKey } },
    });
    if (existing) throw new BusinessError('already-owned', { definition });

    const spent = await spendCoins(tx, {
      userId,
      guildId,
      amount: definition.price,
    });
    if (!spent.ok) throw new BusinessError('funds', { available: spent.available, definition });

    const business = await tx.business.create({
      data: { userId, guildId, businessKey },
    });
    return { business, definition };
  });
}

async function listBusinesses(userId, guildId) {
  return prisma.business.findMany({
    where: { userId, guildId },
    orderBy: { createdAt: 'asc' },
  });
}

async function collectBusinesses(userId, guildId, businessKey = null) {
  return withTransaction(async tx => {
    const businesses = await tx.business.findMany({
      where: {
        userId,
        guildId,
        ...(businessKey ? { businessKey } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!businesses.length) throw new BusinessError('not-owned');

    const now = Date.now();
    const collected = [];
    let total = 0;
    for (const business of businesses) {
      const result = await collectBusiness(tx, business, now);
      if (result.collected) {
        collected.push({ business, amount: result.amount });
        total += result.amount;
      }
    }
    if (total > 0) {
      await tx.economy.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId, balance: total },
        update: { balance: { increment: total } },
      });
    }
    return { businesses, collected, total };
  });
}

async function upgradeBusiness(userId, guildId, businessKey) {
  const definition = getBusiness(businessKey);
  if (!definition) throw new BusinessError('invalid-business');

  return withTransaction(async tx => {
    const business = await tx.business.findUnique({
      where: { userId_guildId_businessKey: { userId, guildId, businessKey } },
    });
    if (!business) throw new BusinessError('not-owned', { definition });
    if (business.level >= BUSINESS_MAX_LEVEL) throw new BusinessError('max-level', { business, definition });

    const collected = await collectBusiness(tx, business);
    const cost = businessUpgradeCost(definition, business.level);
    const spent = await spendCoins(tx, { userId, guildId, amount: cost });
    if (!spent.ok) throw new BusinessError('funds', { available: spent.available, definition, cost });

    const upgraded = await tx.business.update({
      where: { id: business.id },
      data: { level: { increment: 1 } },
    });
    if (collected.collected) {
      await tx.economy.update({
        where: { userId_guildId: { userId, guildId } },
        data: { balance: { increment: collected.amount } },
      });
    }
    return { business: upgraded, definition, cost, collected: collected.amount };
  });
}

async function sellBusiness(userId, guildId, businessKey) {
  const definition = getBusiness(businessKey);
  if (!definition) throw new BusinessError('invalid-business');

  return withTransaction(async tx => {
    const business = await tx.business.findUnique({
      where: { userId_guildId_businessKey: { userId, guildId, businessKey } },
    });
    if (!business) throw new BusinessError('not-owned', { definition });

    const collected = await collectBusiness(tx, business);
    const refund = businessRefund(definition, business.level);
    await tx.business.delete({ where: { id: business.id } });
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: refund + collected.amount },
      update: { balance: { increment: refund + collected.amount } },
    });
    return { business, definition, refund, collected: collected.amount };
  });
}

function errorMessage(error) {
  if (error instanceof BusinessError) {
    if (error.code === 'invalid-business') return 'Essa empresa não existe. Use `/empresa loja` para ver as opções.';
    if (error.code === 'already-owned') return `Você já possui a empresa **${error.definition.name}**.`;
    if (error.code === 'not-owned') return 'Você não possui essa empresa.';
    if (error.code === 'max-level') return `**${error.definition.name}** já está no nível máximo.`;
    if (error.code === 'funds') {
      return `Saldo insuficiente. Você possui **${formatCoins(error.available)} coins**, mas precisa de **${formatCoins(error.cost ?? error.definition.price)} coins**.`;
    }
  }
  console.error('[EMPRESA]', error);
  return 'Não foi possível concluir a operação da empresa agora.';
}

async function executeBusiness({ userId, guildId, action, businessKey, reply }) {
  if (!guildId) return replyText('❌ Este comando só pode ser usado dentro de um servidor.', reply);

  try {
    if (action === 'loja') return replyText(storeText(), reply);

    if (action === 'minhas') {
      const businesses = await listBusinesses(userId, guildId);
      if (!businesses.length) {
        return replyText(
          '## 🏢 Minhas empresas\n\nVocê ainda não possui empresas. Use `/empresa loja` para conhecer as opções.',
          reply,
        );
      }
      const totalPending = businesses.reduce(
        (sum, business) => sum + calculateBusinessIncome(business).amount,
        0,
      );
      return replyText(
        `## 🏢 Minhas empresas\n\n${businesses.map(businessLine).filter(Boolean).join('\n\n')}\n\n` +
        `💰 Total disponível para coletar: **${formatCoins(totalPending)} coins**\n` +
        `Use \`/empresa coletar\` para receber os lucros.`,
        reply,
      );
    }

    if (action === 'comprar') {
      const result = await buyBusiness(userId, guildId, businessKey);
      return replyText(
        `## ✅ Empresa adquirida\n\n` +
        `${result.definition.emoji} Você comprou a **${result.definition.name}** por **${formatCoins(result.definition.price)} coins**.\n` +
        `Ela começa a gerar **${formatCoins(result.definition.incomePerHour)} coins por hora**.\n\n` +
        `Use \`/empresa minhas\` para acompanhar seu negócio.`,
        reply,
      );
    }

    if (action === 'coletar') {
      const result = await collectBusinesses(userId, guildId, businessKey);
      if (!result.total) {
        return replyText(
          '## ⏳ Ainda não há lucro disponível\n\nSuas empresas ainda estão trabalhando. Volte depois para coletar.',
          reply,
        );
      }
      const lines = result.collected.map(item =>
        `${getBusiness(item.business.businessKey)?.emoji ?? '🏢'} **${getBusiness(item.business.businessKey)?.name ?? item.business.businessKey}**: +${formatCoins(item.amount)} coins`,
      );
      return replyText(
        `## 💰 Lucro coletado\n\n${lines.join('\n')}\n\n` +
        `Total recebido na carteira: **+${formatCoins(result.total)} coins**.`,
        reply,
      );
    }

    if (action === 'melhorar') {
      const result = await upgradeBusiness(userId, guildId, businessKey);
      return replyText(
        `## 📈 Empresa melhorada\n\n` +
        `${result.definition.emoji} **${result.definition.name}** agora está no nível **${result.business.level}/${BUSINESS_MAX_LEVEL}**.\n` +
        `Investimento: **${formatCoins(result.cost)} coins**\n` +
        `Nova renda: **${formatCoins(businessIncomePerHour(result.definition, result.business.level))} coins/h**` +
        (result.collected ? `\nLucro coletado antes do upgrade: **+${formatCoins(result.collected)} coins**` : ''),
        reply,
      );
    }

    if (action === 'vender') {
      const result = await sellBusiness(userId, guildId, businessKey);
      return replyText(
        `## 🧾 Empresa vendida\n\n` +
        `${result.definition.emoji} **${result.definition.name}** nível **${result.business.level}** foi vendida.\n` +
        `Reembolso: **+${formatCoins(result.refund)} coins**` +
        (result.collected ? `\nLucro pendente coletado: **+${formatCoins(result.collected)} coins**` : ''),
        reply,
      );
    }

    return replyText('Use `/empresa loja`, `/empresa comprar`, `/empresa minhas`, `/empresa coletar`, `/empresa melhorar` ou `/empresa vender`.', reply);
  } catch (error) {
    return replyText(`❌ ${errorMessage(error)}`, reply);
  }
}

const cmdEmpresa = {
  data: new SlashCommandBuilder()
    .setName('empresa')
    .setDescription('Compre empresas e gere renda passiva')
    .addSubcommand(sub => sub
      .setName('loja')
      .setDescription('Veja as empresas disponíveis'))
    .addSubcommand(sub => sub
      .setName('minhas')
      .setDescription('Veja suas empresas e lucros acumulados'))
    .addSubcommand(sub => sub
      .setName('comprar')
      .setDescription('Compre uma empresa')
      .addStringOption(option => businessChoice(option
        .setName('negocio')
        .setDescription('Empresa que deseja comprar')
        .setRequired(true))))
    .addSubcommand(sub => sub
      .setName('coletar')
      .setDescription('Colete os lucros das empresas')
      .addStringOption(option => businessChoice(option
        .setName('negocio')
        .setDescription('Deixe vazio para coletar todas')
        .setRequired(false))))
    .addSubcommand(sub => sub
      .setName('melhorar')
      .setDescription('Melhore uma empresa')
      .addStringOption(option => businessChoice(option
        .setName('negocio')
        .setDescription('Empresa que deseja melhorar')
        .setRequired(true))))
    .addSubcommand(sub => sub
      .setName('vender')
      .setDescription('Venda uma empresa por parte do investimento')
      .addStringOption(option => businessChoice(option
        .setName('negocio')
        .setDescription('Empresa que deseja vender')
        .setRequired(true)))),
  name: 'empresa',
  aliases: ['empresas', 'negocio', 'negocios'],

  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    return executeBusiness({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      action,
      businessKey: interaction.options.getString('negocio'),
      reply: payload => interaction.reply(payload),
    });
  },

  async executePrefix(message, args) {
    const aliases = {
      loja: 'loja',
      catalogo: 'loja',
      catálogo: 'loja',
      minhas: 'minhas',
      meus: 'minhas',
      status: 'minhas',
      comprar: 'comprar',
      compra: 'comprar',
      coletar: 'coletar',
      receber: 'coletar',
      melhorar: 'melhorar',
      upgrade: 'melhorar',
      vender: 'vender',
      venda: 'vender',
    };
    const action = aliases[args[0]?.toLowerCase()];
    return executeBusiness({
      userId: message.author.id,
      guildId: message.guildId,
      action,
      businessKey: args[1]?.toLowerCase() ?? null,
      reply: payload => message.reply(payload),
    });
  },
};

export default cmdEmpresa;
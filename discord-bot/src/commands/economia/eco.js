import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { fileURLToPath } from 'node:url';
import prisma from '../../database/client.js';
import { Prisma } from '@prisma/client';
import { getEmoji } from '../../utils/emojiManager.js';
import { generateBalanceCard, generateTopCard } from '../../utils/economyCards.js';
import { spendCoins, totalCoins } from '../../utils/economyFunds.js';
import { ROBBERY_WEAPONS, getRobberyWeapon } from '../../utils/robberyData.js';

// ─── Emojis — resolvidos como application emojis (sem dependência de boost) ──
const COIN = () => getEmoji('futecoins');
const CAL  = () => getEmoji('calendario');
const STAR = () => getEmoji('4branco_estrela');
const CLK  = () => getEmoji('relogio');
const KNIFE = '<:05_angels:1507575385074831441>';
const ROBBERY_BANNER_PATH = fileURLToPath(new URL('../../../assets/roubo-banner.jpg', import.meta.url));
const ARREST_BANNER_PATH = fileURLToPath(new URL('../../../assets/prisao-banner.gif', import.meta.url));

// ─── V2 helpers ───────────────────────────────────────────────────────────────

function v2Rich(text) {
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function v2Err(text) {
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`❌  ${text}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2, ephemeral: true };
}

function robberyPayload(text, arrested = false, ephemeral = false) {
  const filename = arrested ? 'prisao-banner.gif' : 'roubo-banner.jpg';
  const attachment = new AttachmentBuilder(
    arrested ? ARREST_BANNER_PATH : ROBBERY_BANNER_PATH,
    { name: filename },
  );
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${filename}`),
      ),
    );
  return {
    components: [c],
    files: [attachment],
    flags: MessageFlags.IsComponentsV2,
    ...(ephemeral ? { ephemeral: true } : {}),
  };
}

function trabalhoPayload(text) {
  const attachment = new AttachmentBuilder(
    fileURLToPath(new URL('../../assets/trabalho-banner.jpg', import.meta.url)),
    { name: 'trabalho-banner.jpg' },
  );
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://trabalho-banner.jpg'),
      ),
    );
  return {
    components: [c],
    files: [attachment],
    flags: MessageFlags.IsComponentsV2,
  };
}

// ─── Eco helpers ──────────────────────────────────────────────────────────────

const DAILY_AMOUNT  = () => Math.floor(Math.random() * 501) + 500;
const WEEKLY_AMOUNT = () => Math.floor(Math.random() * 3001) + 3000;
const MONTHLY_AMOUNT = () => Math.floor(Math.random() * 15001) + 15000;
const WORK_AMOUNT   = () => Math.floor(Math.random() * 401) + 100;
const DAILY_CD      = 24 * 60 * 60 * 1000;
const WEEKLY_CD     = 7 * 24 * 60 * 60 * 1000;
const MONTHLY_CD    = 30 * 24 * 60 * 60 * 1000;
const WORK_CD       = 60 * 60 * 1000;
const ROB_CD        = 60 * 60 * 1000;
const DEFAULT_ROBBERY_WEAPON = 'faca';
const ROBBERY_FINE_MIN = 1500;

const WORK_MSGS = [
  'Você programou um bot de Discord',
  'Você fez uma entrega de pizza',
  'Você vendeu itens no marketplace',
  'Você deu aulas particulares online',
  'Você fez design para um cliente',
  'Você trabalhou no mercado',
  'Você fez transmissão ao vivo',
  'Você vendeu fotos de stock',
  'Você fez um freela de edição de vídeo',
  'Você dirigiu para o aplicativo',
  'Você fez suporte técnico remoto',
  'Você vendeu doces na escola',
  'Você fez traduções de texto',
  'Você editou fotos para um cliente',
  'Você gravou um podcast patrocinado',
];

function msToHuman(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

async function getEco(userId, guildId, db = prisma) {
  return db.economy.upsert({
    where:  { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}

async function claimPeriodicReward({
  userId,
  guildId,
  isAdmin,
  reply,
  field,
  cooldown,
  amountFactory,
  label,
  nextLabel,
}) {
  const eco = await getEco(userId, guildId);
  const now = Date.now();
  const last = eco[field]?.getTime() ?? 0;
  const diff = now - last;

  if (!isAdmin && diff < cooldown) {
    return reply(v2Err(`${label} indisponível. Volte em **${msToHuman(cooldown - diff)}**!`));
  }

  const amount = amountFactory();
  await prisma.economy.update({
    where: { userId_guildId: { userId, guildId } },
    data: { balance: { increment: amount }, [field]: new Date(now) },
  });

  return reply(v2Rich(
    `## ✨ ${CAL()} ${label} resgatado\n` +
    `${COIN()} **+${amount.toLocaleString('pt-BR')}**\n\n` +
    `${CLK()} Próximo em **${nextLabel}**`,
  ));
}

class RobberyError extends Error {
  constructor(code, data = {}) {
    super(code);
    this.code = code;
    Object.assign(this, data);
  }
}

const ROBBERY_MSGS = [
  'Você distraiu a vítima com um “olha, um pombo!” e saiu correndo.',
  'Você vestiu o moletom mais suspeito do servidor e entrou em ação.',
  'A vítima estava olhando o saldo... você estava olhando a vítima.',
  'Você fez um curso intensivo de “mão leve” e acabou de se formar.',
  'Você chegou tão silenciosamente que até o saldo pediu desculpas.',
];

async function robUser(thiefId, victimId, guildId) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async tx => {
        const now = Date.now();
        const thief = await getEco(thiefId, guildId, tx);
        const victim = await getEco(victimId, guildId, tx);
        const criminal = await tx.criminalRecord.upsert({
          where: { userId_guildId: { userId: thiefId, guildId } },
          create: { userId: thiefId, guildId },
          update: {},
        });
        if (criminal.debt > 0) {
          throw new RobberyError('fine', { debt: criminal.debt });
        }
        const ownedWeapons = await tx.userPurchase.findMany({
          where: { userId: thiefId, itemType: 'weapon' },
        });
        const weaponKeys = new Set(ownedWeapons.map(item => item.itemRef));
        const weapon = ROBBERY_WEAPONS
          .filter(item => weaponKeys.has(item.key) || item.key === DEFAULT_ROBBERY_WEAPON)
          .sort((a, b) => b.stealMultiplier - a.stealMultiplier)[0] ?? getRobberyWeapon(DEFAULT_ROBBERY_WEAPON);
        const elapsed = now - (thief.lastRob?.getTime() ?? 0);

        if (elapsed < ROB_CD) {
          throw new RobberyError('cooldown', { remaining: ROB_CD - elapsed });
        }
        if (victim.balance <= 0) {
          throw new RobberyError('no-money');
        }

        const stolen = Math.min(victim.balance, Math.floor(victim.balance * 0.5 * weapon.stealMultiplier));
        if (stolen <= 0) {
          throw new RobberyError('too-little');
        }

        await tx.economy.update({
          where: { userId_guildId: { userId: victimId, guildId } },
          data: { balance: { decrement: stolen } },
        });
        const arrested = Math.random() < weapon.arrestChance;
        const fine = arrested
          ? Math.max(ROBBERY_FINE_MIN, Math.floor(stolen * (0.35 + weapon.arrestChance)))
          : 0;
        const updatedThief = await tx.economy.update({
          where: { userId_guildId: { userId: thiefId, guildId } },
          data: { balance: { increment: stolen }, lastRob: new Date(now) },
        });
        await tx.criminalRecord.update({
          where: { userId_guildId: { userId: thiefId, guildId } },
          data: {
            crimes: { increment: 1 },
            arrests: arrested ? { increment: 1 } : undefined,
            debt: fine ? { increment: fine } : undefined,
            lastCrime: new Date(now),
          },
        });

        return {
          stolen,
          victimRemaining: victim.balance - stolen,
          thiefBalance: updatedThief.balance,
          weapon,
          arrested,
          fine,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error?.code === 'P2034' && attempt < 2) continue;
      throw error;
    }
  }
}

function robberyError(error) {
  if (error instanceof RobberyError) {
    if (error.code === 'cooldown')
      return v2Err(`${KNIFE} Você já está sendo procurado pela polícia! Espere **${msToHuman(error.remaining)}** para tentar outro roubo.`);
    if (error.code === 'fine')
      return robberyPayload(
        `${KNIFE} Você está preso! Pague a multa de **${error.debt.toLocaleString('pt-BR')} ${COIN()}** com \`/ficha pagar\` antes de roubar novamente.`,
        true,
        true,
      );
    if (error.code === 'no-money')
      return v2Err(`${KNIFE} Essa pessoa está lisa: não há dinheiro em mãos para roubar.`);
    if (error.code === 'too-little')
      return v2Err(`${KNIFE} A carteira tinha tão pouco que até o roubo ficou sem troco.`);
  }
  console.error('[ROUBO]', error);
  return v2Err('O plano deu errado e a polícia apareceu. Tente novamente em instantes.');
}

// ─── /roubar ───────────────────────────────────────────────────────────────────
const cmdRoubar = {
  data: new SlashCommandBuilder()
    .setName('roubar')
    .setDescription('Roube 50% das coins na carteira de alguém (1h cooldown)')
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('A vítima do roubo')
        .setRequired(true),
    ),
  name: 'roubar',
  aliases: ['roubo', 'assaltar', 'assalto'],

  async execute(interaction) {
    const target = interaction.options.getUser('usuario');
    if (target.id === interaction.user.id) return interaction.reply(v2Err(`${KNIFE} Você não pode roubar a própria carteira. Isso é só transferir dinheiro com passos extras.`));
    if (target.bot) return interaction.reply(v2Err(`${KNIFE} Bots não carregam carteira. A tentativa foi vergonhosa.`));

    try {
      const result = await robUser(interaction.user.id, target.id, interaction.guildId);
      const scene = ROBBERY_MSGS[Math.floor(Math.random() * ROBBERY_MSGS.length)];
      return interaction.reply(robberyPayload(
        `## ${KNIFE} Roubo concluído!\n` +
        `${scene}\n\n` +
        `${interaction.user} surrupiou ${COIN()} **${result.stolen.toLocaleString('pt-BR')}** de ${target} usando **${result.weapon.name}**.\n` +
        `💸 A vítima ficou com ${COIN()} **${result.victimRemaining.toLocaleString('pt-BR')}**.\n\n` +
        `${result.arrested ? `🚔 A polícia chegou! Você foi preso e recebeu uma multa de **${result.fine.toLocaleString('pt-BR')} ${COIN()}**. Pague com \`/ficha pagar\` para voltar a roubar.\n\n` : ''}` +
        `${CLK()} ${result.weapon.name} descansa por **1 hora** antes do próximo golpe.`,
        result.arrested,
      ));
    } catch (error) {
      return interaction.reply(robberyError(error));
    }
  },

  async executePrefix(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply(v2Err(`${KNIFE} Mencione alguém. Ex: \`savage roubar @usuario\``));
    if (target.id === message.author.id) return message.reply(v2Err(`${KNIFE} Você não pode roubar a própria carteira. Isso é só transferir dinheiro com passos extras.`));
    if (target.bot) return message.reply(v2Err(`${KNIFE} Bots não carregam carteira. A tentativa foi vergonhosa.`));

    try {
      const result = await robUser(message.author.id, target.id, message.guildId);
      const scene = ROBBERY_MSGS[Math.floor(Math.random() * ROBBERY_MSGS.length)];
      return message.reply(robberyPayload(
        `## ${KNIFE} Roubo concluído!\n` +
        `${scene}\n\n` +
        `${message.author} surrupiou ${COIN()} **${result.stolen.toLocaleString('pt-BR')}** de ${target} usando **${result.weapon.name}**.\n` +
        `💸 A vítima ficou com ${COIN()} **${result.victimRemaining.toLocaleString('pt-BR')}**.\n\n` +
        `${result.arrested ? `🚔 A polícia chegou! Você foi preso e recebeu uma multa de **${result.fine.toLocaleString('pt-BR')} ${COIN()}**. Pague com \`savage ficha pagar\` para voltar a roubar.\n\n` : ''}` +
        `${CLK()} ${result.weapon.name} descansa por **1 hora** antes do próximo golpe.`,
        result.arrested,
      ));
    } catch (error) {
      return message.reply(robberyError(error));
    }
  },
};

// ─── /saldo ───────────────────────────────────────────────────────────────────
const cmdSaldo = {
  data: new SlashCommandBuilder()
    .setName('saldo')
    .setDescription('💰 Veja seu saldo de coins (ou de outro membro)')
    .addUserOption(o => o.setName('usuario').setDescription('Membro alvo (opcional)')),
  name: 'saldo',
  aliases: ['eco', 'economia', 'dinheiro', 'bal'],

  async execute(interaction) {
    const target    = interaction.options.getUser('usuario') ?? interaction.user;
    const eco       = await getEco(target.id, interaction.guildId);
    const member    = await interaction.guild.members.fetch(target.id).catch(() => null);
    const username  = member?.displayName ?? target.username;
    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
    const buf = await generateBalanceCard({ username, avatarUrl, balance: eco.balance, bank: eco.bank });
    return interaction.reply({ files: [new AttachmentBuilder(buf, { name: 'saldo.png' })] });
  },

  async executePrefix(message, args) {
    // Mantém `savage economia` como alias de saldo, mas permite usar o novo
    // subcomando administrativo sem alterar os aliases existentes.
    if (['operador', 'admin'].includes(args[0]?.toLowerCase())) {
      const { default: operatorCommand } = await import('./operador.js');
      return operatorCommand.executePrefix(message, args);
    }
    const target    = message.mentions.users.first() ?? message.author;
    const eco       = await getEco(target.id, message.guildId);
    const member    = await message.guild.members.fetch(target.id).catch(() => null);
    const username  = member?.displayName ?? target.username;
    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
    const buf = await generateBalanceCard({ username, avatarUrl, balance: eco.balance, bank: eco.bank });
    return message.reply({ files: [new AttachmentBuilder(buf, { name: 'saldo.png' })] });
  },
};

// ─── /daily ───────────────────────────────────────────────────────────────────
const cmdDaily = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('💰 Colete sua recompensa diária'),
  name: 'daily',
  aliases: ['diario', 'd'],

  async execute(interaction) {
    const eco     = await getEco(interaction.user.id, interaction.guildId);
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const now     = Date.now();
    const last    = eco.lastDaily?.getTime() ?? 0;
    const diff    = now - last;
    if (!isAdmin && diff < DAILY_CD)
      return interaction.reply({ ...v2Err(`Daily indisponível. Volte em **${msToHuman(DAILY_CD - diff)}**!`) });
    const streak = diff < 48 * 60 * 60 * 1000 ? (eco.dailyStreak ?? 0) + 1 : 1;
    const bonus  = Math.min(streak, 30) * 0.02;
    const base   = DAILY_AMOUNT();
    const amount = Math.floor(base * (1 + bonus));
    await prisma.economy.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data:  { balance: { increment: amount }, lastDaily: new Date(), dailyStreak: streak },
    });
    return interaction.reply(v2Rich(
      `## ✨ ${CAL()} Daily resgatado\n` +
      `${COIN()} **+${amount.toLocaleString('pt-BR')}**\n` +
      `${STAR()} Streak: **${streak}d** (+${Math.round(bonus * 100)}%)\n\n` +
      `${CLK()} Próximo em **24h base**`
    ));
  },

  async executePrefix(message) {
    const eco     = await getEco(message.author.id, message.guildId);
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const now     = Date.now();
    const last    = eco.lastDaily?.getTime() ?? 0;
    const diff    = now - last;
    if (!isAdmin && diff < DAILY_CD)
      return message.reply(v2Err(`Daily indisponível. Volte em **${msToHuman(DAILY_CD - diff)}**!`));
    const streak = diff < 48 * 60 * 60 * 1000 ? (eco.dailyStreak ?? 0) + 1 : 1;
    const bonus  = Math.min(streak, 30) * 0.02;
    const base   = DAILY_AMOUNT();
    const amount = Math.floor(base * (1 + bonus));
    await prisma.economy.update({
      where: { userId_guildId: { userId: message.author.id, guildId: message.guildId } },
      data:  { balance: { increment: amount }, lastDaily: new Date(), dailyStreak: streak },
    });
    return message.reply(v2Rich(
      `## ✨ ${CAL()} Daily resgatado\n` +
      `${COIN()} **+${amount.toLocaleString('pt-BR')}**\n` +
      `${STAR()} Streak: **${streak}d** (+${Math.round(bonus * 100)}%)\n\n` +
      `${CLK()} Próximo em **24h base**`
    ));
  },
};

// ─── /semanal e /mensal ───────────────────────────────────────────────────────
const cmdSemanal = {
  data: new SlashCommandBuilder()
    .setName('semanal')
    .setDescription('💰 Colete sua recompensa semanal'),
  name: 'semanal',
  aliases: ['weekly', 'week'],

  async execute(interaction) {
    return claimPeriodicReward({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      isAdmin: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
      reply: payload => interaction.reply(payload),
      field: 'lastWeekly',
      cooldown: WEEKLY_CD,
      amountFactory: WEEKLY_AMOUNT,
      label: 'Semanal',
      nextLabel: '7 dias',
    });
  },

  async executePrefix(message) {
    return claimPeriodicReward({
      userId: message.author.id,
      guildId: message.guildId,
      isAdmin: message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false,
      reply: payload => message.reply(payload),
      field: 'lastWeekly',
      cooldown: WEEKLY_CD,
      amountFactory: WEEKLY_AMOUNT,
      label: 'Semanal',
      nextLabel: '7 dias',
    });
  },
};

const cmdMensal = {
  data: new SlashCommandBuilder()
    .setName('mensal')
    .setDescription('💰 Colete sua recompensa mensal'),
  name: 'mensal',
  aliases: ['monthly', 'month'],

  async execute(interaction) {
    return claimPeriodicReward({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      isAdmin: interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false,
      reply: payload => interaction.reply(payload),
      field: 'lastMonthly',
      cooldown: MONTHLY_CD,
      amountFactory: MONTHLY_AMOUNT,
      label: 'Mensal',
      nextLabel: '30 dias',
    });
  },

  async executePrefix(message) {
    return claimPeriodicReward({
      userId: message.author.id,
      guildId: message.guildId,
      isAdmin: message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false,
      reply: payload => message.reply(payload),
      field: 'lastMonthly',
      cooldown: MONTHLY_CD,
      amountFactory: MONTHLY_AMOUNT,
      label: 'Mensal',
      nextLabel: '30 dias',
    });
  },
};

// ─── /trabalho ────────────────────────────────────────────────────────────────
const cmdTrabalho = {
  data: new SlashCommandBuilder()
    .setName('trabalho')
    .setDescription('💼 Trabalhe para ganhar coins (1h cooldown)'),
  name: 'trabalho',
  aliases: ['trab', 'work'],

  async execute(interaction) {
    const eco     = await getEco(interaction.user.id, interaction.guildId);
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const now     = Date.now();
    const last    = eco.lastWork?.getTime() ?? 0;
    const diff    = now - last;
    if (!isAdmin && diff < WORK_CD)
      return interaction.reply({ ...v2Err(`Você está cansado! Descanse mais **${msToHuman(WORK_CD - diff)}** antes de trabalhar novamente.`) });
    const amount = WORK_AMOUNT();
    const msg    = WORK_MSGS[Math.floor(Math.random() * WORK_MSGS.length)];
    await prisma.economy.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data:  { balance: { increment: amount }, lastWork: new Date() },
    });
    return interaction.reply(trabalhoPayload(
      `## 💼 Trabalho Concluído!\n` +
      `**${msg}** e ganhou ${COIN()} **${amount.toLocaleString('pt-BR')}**!\n\n` +
      `${CLK()} Volte em **1 hora** para trabalhar novamente.`
    ));
  },

  async executePrefix(message) {
    const eco     = await getEco(message.author.id, message.guildId);
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const now     = Date.now();
    const last    = eco.lastWork?.getTime() ?? 0;
    const diff    = now - last;
    if (!isAdmin && diff < WORK_CD)
      return message.reply(v2Err(`Você está cansado! Descanse mais **${msToHuman(WORK_CD - diff)}** antes de trabalhar novamente.`));
    const amount = WORK_AMOUNT();
    const msg    = WORK_MSGS[Math.floor(Math.random() * WORK_MSGS.length)];
    await prisma.economy.update({
      where: { userId_guildId: { userId: message.author.id, guildId: message.guildId } },
      data:  { balance: { increment: amount }, lastWork: new Date() },
    });
    return message.reply(trabalhoPayload(
      `## 💼 Trabalho Concluído!\n` +
      `**${msg}** e ganhou ${COIN()} **${amount.toLocaleString('pt-BR')}**!\n\n` +
      `${CLK()} Volte em **1 hora** para trabalhar novamente.`
    ));
  },
};

// ─── /pagar ───────────────────────────────────────────────────────────────────
const cmdPagar = {
  data: new SlashCommandBuilder()
    .setName('pagar')
    .setDescription('💸 Transfira coins para alguém')
    .addUserOption(o => o.setName('usuario').setDescription('Quem vai receber').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Quantidade').setRequired(true).setMinValue(1)),
  name: 'pagar',
  aliases: ['pay', 'transferir'],

  async execute(interaction) {
    const target = interaction.options.getUser('usuario');
    const valor  = interaction.options.getInteger('valor');
    if (target.id === interaction.user.id) return interaction.reply(v2Err('Você não pode pagar a si mesmo.'));
    if (target.bot) return interaction.reply(v2Err('Não é possível pagar bots.'));
    const eco = await getEco(interaction.user.id, interaction.guildId);
    if (totalCoins(eco) < valor) return interaction.reply(v2Err(`Saldo insuficiente. Você tem **${totalCoins(eco).toLocaleString('pt-BR')}** ${COIN()} disponíveis.`));
    const taxa   = Math.floor(valor * 0.03);
    const recebe = valor - taxa;
    await getEco(target.id, interaction.guildId);
    const spent = await spendCoins(prisma, { userId: interaction.user.id, guildId: interaction.guildId, amount: valor });
    if (!spent.ok) return interaction.reply(v2Err('Saldo insuficiente.'));
    await prisma.economy.update({ where: { userId_guildId: { userId: target.id,            guildId: interaction.guildId } }, data: { balance: { increment: recebe } } });
    return interaction.reply(v2Rich(
      `## ✅ Transferência concluída\n` +
      `${interaction.user} enviou ${COIN()} **${valor.toLocaleString('pt-BR')}** para ${target}.\n` +
      `${COIN()} Taxa de 3%: **${taxa.toLocaleString('pt-BR')}**\n` +
      `${COIN()} ${target.username} recebeu: **${recebe.toLocaleString('pt-BR')}**`
    ));
  },

  async executePrefix(message, args) {
    const target = message.mentions.users.first();
    const valor  = parseInt(args[2] ?? args[1]);
    if (!target) return message.reply(v2Err('Mencione o usuário. Ex: `savage pagar @user 500`'));
    if (target.id === message.author.id) return message.reply(v2Err('Você não pode pagar a si mesmo.'));
    if (target.bot) return message.reply(v2Err('Não é possível pagar bots.'));
    if (isNaN(valor) || valor <= 0) return message.reply(v2Err('Informe o valor. Ex: `savage pagar @user 500`'));
    const eco = await getEco(message.author.id, message.guildId);
    if (totalCoins(eco) < valor) return message.reply(v2Err(`Saldo insuficiente. Você tem **${totalCoins(eco).toLocaleString('pt-BR')}** ${COIN()} disponíveis.`));
    const taxa   = Math.floor(valor * 0.03);
    const recebe = valor - taxa;
    await getEco(target.id, message.guildId);
    const spent = await spendCoins(prisma, { userId: message.author.id, guildId: message.guildId, amount: valor });
    if (!spent.ok) return message.reply(v2Err('Saldo insuficiente.'));
    await prisma.economy.update({ where: { userId_guildId: { userId: target.id,           guildId: message.guildId } }, data: { balance: { increment: recebe } } });
    return message.reply(v2Rich(
      `## ✅ Transferência concluída\n` +
      `${message.author} enviou ${COIN()} **${valor.toLocaleString('pt-BR')}** para ${target}.\n` +
      `${COIN()} Taxa de 3%: **${taxa.toLocaleString('pt-BR')}**\n` +
      `${COIN()} ${target.username} recebeu: **${recebe.toLocaleString('pt-BR')}**`
    ));
  },
};

// ─── /top ─────────────────────────────────────────────────────────────────────
async function getTopEntries(guild, rows, valueKey) {
  return Promise.all(rows.map(async (row, index) => {
    const member = await guild.members.fetch(row.userId).catch(() => null);
    return {
      rank: index + 1,
      username: member?.displayName ?? 'User',
      avatarUrl: member?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null,
      eliteTotal: row.balance + row.bank,
      coins: row.balance,
      total: valueKey === 'eliteTotal' ? row.balance + row.bank : row.balance,
    };
  }));
}

async function getTopData(guildId, guild) {
  const allRows = await prisma.economy.findMany({ where: { guildId } });
  const eliteRows = allRows
    .sort((a, b) => (b.balance + b.bank) - (a.balance + a.bank))
    .slice(0, 6);
  const coinRows = [...allRows]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 6);
  return {
    eliteEntries: await getTopEntries(guild, eliteRows, 'eliteTotal'),
    coinEntries: await getTopEntries(guild, coinRows, 'coins'),
  };
}

const cmdTop = {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('🏆 Ranking de economia do servidor'),
  name: 'top',
  aliases: ['ranking', 'rank'],

  async execute(interaction) {
    await interaction.deferReply();
    const topData = await getTopData(interaction.guildId, interaction.guild);
    if (!topData.eliteEntries.length && !topData.coinEntries.length)
      return interaction.editReply(v2Err('Ninguém tem coins ainda!'));
    const buf = await generateTopCard(topData);
    return interaction.editReply({ files: [new AttachmentBuilder(buf, { name: 'top.png' })] });
  },

  async executePrefix(message) {
    const topData = await getTopData(message.guildId, message.guild);
    if (!topData.eliteEntries.length && !topData.coinEntries.length)
      return message.reply(v2Err('Ninguém tem coins ainda!'));
    const buf = await generateTopCard(topData);
    return message.reply({ files: [new AttachmentBuilder(buf, { name: 'top.png' })] });
  },
};

// ─── /depositar ───────────────────────────────────────────────────────────────
const cmdDepositar = {
  data: new SlashCommandBuilder()
    .setName('depositar')
    .setDescription('🏦 Depositar coins no banco')
    .addStringOption(o => o.setName('valor').setDescription('Valor ou "tudo"').setRequired(true)),
  name: 'depositar',
  aliases: ['dep', 'deposito'],

  async execute(interaction) {
    const eco   = await getEco(interaction.user.id, interaction.guildId);
    const input = interaction.options.getString('valor').toLowerCase();
    const valor = input === 'tudo' ? eco.balance : parseInt(input);
    if (isNaN(valor) || valor <= 0) return interaction.reply(v2Err('Valor inválido.'));
    if (eco.balance < valor) return interaction.reply(v2Err(`Saldo insuficiente. Você tem **${eco.balance.toLocaleString('pt-BR')}** ${COIN()} na carteira.`));
    await prisma.economy.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data:  { balance: { decrement: valor }, bank: { increment: valor } },
    });
    return interaction.reply(v2Rich(
      `## 🏦 Depósito Realizado!\n` +
      `${COIN()} **${valor.toLocaleString('pt-BR')}** depositados com segurança!\n\n` +
      `🔒 Coins no banco estão protegidos de roubos.`
    ));
  },

  async executePrefix(message, args) {
    const eco   = await getEco(message.author.id, message.guildId);
    const input = (args[0] ?? '').toLowerCase();
    const valor = input === 'tudo' ? eco.balance : parseInt(input);
    if (isNaN(valor) || valor <= 0) return message.reply(v2Err('Informe o valor ou "tudo". Ex: `savage depositar 1000`'));
    if (eco.balance < valor) return message.reply(v2Err(`Saldo insuficiente. Você tem **${eco.balance.toLocaleString('pt-BR')}** ${COIN()} na carteira.`));
    await prisma.economy.update({
      where: { userId_guildId: { userId: message.author.id, guildId: message.guildId } },
      data:  { balance: { decrement: valor }, bank: { increment: valor } },
    });
    return message.reply(v2Rich(
      `## 🏦 Depósito Realizado!\n` +
      `${COIN()} **${valor.toLocaleString('pt-BR')}** depositados com segurança!\n\n` +
      `🔒 Coins no banco estão protegidos de roubos.`
    ));
  },
};

// ─── /sacar ───────────────────────────────────────────────────────────────────
const cmdSacar = {
  data: new SlashCommandBuilder()
    .setName('sacar')
    .setDescription('🏧 Sacar coins do banco')
    .addStringOption(o => o.setName('valor').setDescription('Valor ou "tudo"').setRequired(true)),
  name: 'sacar',
  aliases: ['saque', 'withdraw'],

  async execute(interaction) {
    const eco   = await getEco(interaction.user.id, interaction.guildId);
    const input = interaction.options.getString('valor').toLowerCase();
    const valor = input === 'tudo' ? eco.bank : parseInt(input);
    if (isNaN(valor) || valor <= 0) return interaction.reply(v2Err('Valor inválido.'));
    if (eco.bank < valor) return interaction.reply(v2Err(`Banco insuficiente. Você tem **${eco.bank.toLocaleString('pt-BR')}** ${COIN()} no banco.`));
    await prisma.economy.update({
      where: { userId_guildId: { userId: interaction.user.id, guildId: interaction.guildId } },
      data:  { bank: { decrement: valor }, balance: { increment: valor } },
    });
    return interaction.reply(v2Rich(
      `## 🏧 Saque Realizado!\n` +
      `${COIN()} **${valor.toLocaleString('pt-BR')}** sacados para sua carteira!\n\n` +
      `🎰 Pronto para apostar nos jogos.`
    ));
  },

  async executePrefix(message, args) {
    const eco   = await getEco(message.author.id, message.guildId);
    const input = (args[0] ?? '').toLowerCase();
    const valor = input === 'tudo' ? eco.bank : parseInt(input);
    if (isNaN(valor) || valor <= 0) return message.reply(v2Err('Informe o valor ou "tudo". Ex: `savage sacar 1000`'));
    if (eco.bank < valor) return message.reply(v2Err(`Banco insuficiente. Você tem **${eco.bank.toLocaleString('pt-BR')}** ${COIN()} no banco.`));
    await prisma.economy.update({
      where: { userId_guildId: { userId: message.author.id, guildId: message.guildId } },
      data:  { bank: { decrement: valor }, balance: { increment: valor } },
    });
    return message.reply(v2Rich(
      `## 🏧 Saque Realizado!\n` +
      `${COIN()} **${valor.toLocaleString('pt-BR')}** sacados para sua carteira!\n\n` +
      `🎰 Pronto para apostar nos jogos.`
    ));
  },
};

export default [
  cmdSaldo,
  cmdDaily,
  cmdSemanal,
  cmdMensal,
  cmdTrabalho,
  cmdRoubar,
  cmdPagar,
  cmdTop,
  cmdDepositar,
  cmdSacar,
];

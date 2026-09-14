import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { getEmoji } from '../../utils/emojiManager.js';
import prisma from '../../database/client.js';

const MOD_HEART = () => getEmoji('mod_heart');
const pendingModeration = new Map();
const PENDING_TTL = 10 * 60 * 1000;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;

const ACTIONS = {
  ban: {
    title: 'Banir membro?',
    confirm: 'Confirmar ban',
    permission: PermissionFlagsBits.BanMembers,
    past: 'banido',
  },
  kick: {
    title: 'Expulsar membro?',
    confirm: 'Confirmar kick',
    permission: PermissionFlagsBits.KickMembers,
    past: 'expulso',
  },
  mute: {
    title: 'Silenciar membro?',
    confirm: 'Confirmar mute',
    permission: PermissionFlagsBits.ModerateMembers,
    past: 'silenciado',
  },
  warn: {
    title: 'Aplicar warn?',
    confirm: 'Confirmar warn',
    permission: PermissionFlagsBits.ModerateMembers,
    past: 'advertido',
  },
};

function panel(text, { ephemeral = true, rows = [] } = {}) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text),
  );
  return {
    components: [container, ...rows],
    flags: MessageFlags.IsComponentsV2,
    ...(ephemeral ? { ephemeral: true } : {}),
  };
}

function displayName(user, member) {
  return member?.displayName ?? user.globalName ?? user.username;
}

function reasonText(reason) {
  return reason?.trim() || '—';
}

function createPending(data) {
  const token = randomUUID().replaceAll('-', '');
  pendingModeration.set(token, { ...data, createdAt: Date.now() });
  const timer = setTimeout(() => pendingModeration.delete(token), PENDING_TTL);
  timer.unref?.();
  return token;
}

function confirmationPayload(
  { action, token, target, member, reason, deleteDays, durationMinutes },
  { ephemeral = true } = {},
) {
  const details = [
    `**${target}** — ${displayName(target, member)}`,
    `**Motivo:** ${reasonText(reason)}`,
  ];

  if (action === 'ban') {
    details.push(`**Mensagens:** apagar os últimos ${deleteDays} dias`);
  } else if (action === 'mute') {
    details.push(`**Duração:** ${durationMinutes} minutos`);
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mod_confirm:${token}`)
      .setLabel(ACTIONS[action].confirm)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`mod_cancel:${token}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );

  return panel(`## ${MOD_HEART()} ${ACTIONS[action].title}\n\n${details.join('\n')}`, {
    ephemeral,
    rows: [buttons],
  });
}

function actionError(text, options = {}) {
  return panel(`## ${MOD_HEART()} Moderação\n\n${text}`, options);
}

function contextUser(context) {
  return context.user ?? context.author;
}

function permissionDenied(context, action) {
  const permissions = context.memberPermissions ?? context.member?.permissions;
  return !permissions?.has(ACTIONS[action].permission);
}

function hierarchyError(context, member, action) {
  if (!member) {
    return action === 'ban'
      ? null
      : 'Esse membro não está no servidor.';
  }

  const user = contextUser(context);
  if (member.id === user.id) return 'Você não pode aplicar essa ação em si mesmo.';
  if (member.id === context.client.user.id) return 'Eu não posso aplicar essa ação em mim mesmo.';
  if (member.id === context.guild.ownerId) return 'O dono do servidor não pode ser moderado.';

  const actor = context.member;
  if (actor?.id !== context.guild.ownerId && actor?.roles?.highest?.comparePositionTo(member.roles.highest) <= 0) {
    return 'O cargo desse membro é igual ou superior ao seu.';
  }

  const manageable = {
    ban: member.bannable,
    kick: member.kickable,
    mute: member.moderatable,
  }[action];
  if (action === 'warn') return null;
  if (!manageable) return 'Meu cargo precisa estar acima do cargo desse membro.';
  return null;
}

async function findMember(context, user) {
  return context.guild.members.fetch(user.id).catch(() => null);
}

async function startModeration(interaction, action, options) {
  if (permissionDenied(interaction, action)) {
    return interaction.reply(actionError('Você não tem permissão para usar este comando.'));
  }

  const target = options.getUser('usuario');
  const member = await findMember(interaction, target);
  const hierarchy = hierarchyError(interaction, member, action);
  if (hierarchy) return interaction.reply(actionError(hierarchy));

  const reason = options.getString('motivo');
  const deleteDays = options.getInteger('mensagens') ?? 0;
  const durationMinutes = options.getInteger('duracao') ?? 10;
  const token = createPending({
    action,
    guildId: interaction.guildId,
    moderatorId: interaction.user.id,
    targetId: target.id,
    reason: reasonText(reason),
    deleteDays,
    durationMinutes,
  });

  return interaction.reply(confirmationPayload({
    action,
    token,
    target,
    member,
    reason,
    deleteDays,
    durationMinutes,
  }));
}

async function startPrefixModeration(message, action, {
  target,
  reason,
  deleteDays = 0,
  durationMinutes = 10,
}) {
  if (permissionDenied(message, action)) {
    return message.reply(actionError(
      'Você não tem permissão para usar este comando.',
      { ephemeral: false },
    ));
  }

  const member = await findMember(message, target);
  const hierarchy = hierarchyError(message, member, action);
  if (hierarchy) {
    return message.reply(actionError(hierarchy, { ephemeral: false }));
  }

  const token = createPending({
    action,
    guildId: message.guildId,
    moderatorId: message.author.id,
    targetId: target.id,
    reason: reasonText(reason),
    deleteDays,
    durationMinutes,
  });

  return message.reply(confirmationPayload({
      action,
      token,
      target,
      member,
      reason,
      deleteDays,
      durationMinutes,
    },
    { ephemeral: false },
  ));
}

function prefixUsage(action) {
  if (action === 'ban') return 'Uso: `savage ban @usuario [dias] [motivo]` ou `s ban @usuario [dias] [motivo]`';
  if (action === 'kick') return 'Uso: `savage kick @usuario [motivo]` ou `s kick @usuario [motivo]`';
  if (action === 'warn') return 'Uso: `savage warn @usuario [motivo]` ou `s warn @usuario [motivo]`';
  return 'Uso: `savage mute @usuario <minutos> [motivo]` ou `s mute @usuario <minutos> [motivo]`';
}

function parsePrefixModeration(message, action, args) {
  const target = message.mentions.users.first();
  if (!target) return { error: prefixUsage(action) };

  const remaining = args.filter(arg => !/^<@!?\d+>$/.test(arg));
  let deleteDays = 0;
  let durationMinutes = 10;

  if (action === 'ban' && /^\d+$/.test(remaining[0] ?? '')) {
    deleteDays = Number(remaining.shift());
    if (deleteDays > 7) return { error: 'Os dias de mensagens precisam estar entre 0 e 7.' };
  }

  if (action === 'mute') {
    if (!/^\d+$/.test(remaining[0] ?? '')) return { error: prefixUsage(action) };
    durationMinutes = Number(remaining.shift());
    if (durationMinutes < 1 || durationMinutes > MAX_TIMEOUT_MINUTES) {
      return { error: `A duração precisa estar entre 1 e ${MAX_TIMEOUT_MINUTES} minutos.` };
    }
  }

  return {
    target,
    reason: remaining.join(' ').trim() || null,
    deleteDays,
    durationMinutes,
  };
}

async function executeModeration(interaction, session) {
  const { action, targetId, reason, deleteDays, durationMinutes } = session;
  const target = await interaction.client.users.fetch(targetId).catch(() => null);
  const member = await findMember(interaction, target ?? { id: targetId });
  const hierarchy = hierarchyError(interaction, member, action);
  if (hierarchy) throw new Error(hierarchy);

  const auditReason = reason === '—' ? `Moderação por ${contextUser(interaction).tag}` : reason;
  if (action === 'warn') {
    const warning = await prisma.memberWarning.upsert({
      where: {
        guildId_userId: {
          guildId: session.guildId,
          userId: targetId,
        },
      },
      create: {
        guildId: session.guildId,
        userId: targetId,
        count: 1,
      },
      update: {
        count: { increment: 1 },
      },
    });

    if (warning.count < 3) {
      return { warningCount: warning.count, muted: false };
    }

    await member.timeout(24 * 60 * 60 * 1000, auditReason);
    await prisma.memberWarning.update({
      where: { id: warning.id },
      data: { count: 0 },
    });
    return { warningCount: warning.count, muted: true };
  }

  if (action === 'ban') {
    await interaction.guild.members.ban(targetId, {
      deleteMessageSeconds: deleteDays * 24 * 60 * 60,
      reason: auditReason,
    });
  } else if (action === 'kick') {
    await member.kick(auditReason);
  } else {
    await member.timeout(durationMinutes * 60 * 1000, auditReason);
  }
}

export async function handleModerationButton(interaction) {
  const [kind, token] = interaction.customId.split(':');
  const session = pendingModeration.get(token);

  if (!session) return interaction.reply(actionError('Essa confirmação expirou. Execute o comando novamente.'));
  if (session.guildId !== interaction.guildId || session.moderatorId !== interaction.user.id) {
    return interaction.reply(actionError('Apenas quem iniciou esta ação pode confirmá-la.'));
  }

  pendingModeration.delete(token);
  if (kind === 'mod_cancel') {
    return interaction.update(actionError('Ação cancelada.'));
  }

  await interaction.deferUpdate();
  try {
    const result = await executeModeration(interaction, session);
    if (session.action === 'warn') {
      const outcome = result.muted
        ? `<@${session.targetId}> recebeu o **3º warn** e foi silenciado por **1 dia**. A contagem foi reiniciada.`
        : `<@${session.targetId}> recebeu um warn. Total atual: **${result.warningCount}/3**.`;
      return interaction.editReply(panel(
        `## ${MOD_HEART()} Moderação concluída\n\n${outcome}`,
      ));
    }
    return interaction.editReply(panel(
      `## ${MOD_HEART()} Moderação concluída\n\n` +
      `<@${session.targetId}> foi **${ACTIONS[session.action].past}** com sucesso.`,
    ));
  } catch (error) {
    return interaction.editReply(actionError(`Não foi possível concluir a ação.\n\n> ${error.message}`));
  }
}

const banCommand = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Bane um membro do servidor após confirmação')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(option =>
      option.setName('usuario').setDescription('Membro que será banido').setRequired(true))
    .addStringOption(option =>
      option.setName('motivo').setDescription('Motivo da punição').setMaxLength(400))
    .addIntegerOption(option =>
      option.setName('mensagens').setDescription('Dias de mensagens para apagar (0 a 7)')
        .setMinValue(0).setMaxValue(7)),
  name: 'ban',
  async execute(interaction) {
    return startModeration(interaction, 'ban', interaction.options);
  },
  async executePrefix(message, args) {
    const parsed = parsePrefixModeration(message, 'ban', args);
    if (parsed.error) return message.reply(parsed.error);
    return startPrefixModeration(message, 'ban', parsed);
  },
};

const kickCommand = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa um membro do servidor após confirmação')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(option =>
      option.setName('usuario').setDescription('Membro que será expulso').setRequired(true))
    .addStringOption(option =>
      option.setName('motivo').setDescription('Motivo da punição').setMaxLength(400)),
  name: 'kick',
  async execute(interaction) {
    return startModeration(interaction, 'kick', interaction.options);
  },
  async executePrefix(message, args) {
    const parsed = parsePrefixModeration(message, 'kick', args);
    if (parsed.error) return message.reply(parsed.error);
    return startPrefixModeration(message, 'kick', parsed);
  },
};

const muteCommand = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Silencia um membro temporariamente após confirmação')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('usuario').setDescription('Membro que será silenciado').setRequired(true))
    .addIntegerOption(option =>
      option.setName('duracao').setDescription('Duração em minutos (1 a 40320)')
        .setRequired(true).setMinValue(1).setMaxValue(MAX_TIMEOUT_MINUTES))
    .addStringOption(option =>
      option.setName('motivo').setDescription('Motivo da punição').setMaxLength(400)),
  name: 'mute',
  async execute(interaction) {
    return startModeration(interaction, 'mute', interaction.options);
  },
  async executePrefix(message, args) {
    const parsed = parsePrefixModeration(message, 'mute', args);
    if (parsed.error) return message.reply(parsed.error);
    return startPrefixModeration(message, 'mute', parsed);
  },
};

const warnCommand = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Adverte um membro após confirmação')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(option =>
      option.setName('usuario').setDescription('Membro que será advertido').setRequired(true))
    .addStringOption(option =>
      option.setName('motivo').setDescription('Motivo da advertência').setMaxLength(400)),
  name: 'warn',
  async execute(interaction) {
    return startModeration(interaction, 'warn', interaction.options);
  },
  async executePrefix(message, args) {
    const parsed = parsePrefixModeration(message, 'warn', args);
    if (parsed.error) return message.reply(parsed.error);
    return startPrefixModeration(message, 'warn', parsed);
  },
};

export default [banCommand, kickCommand, muteCommand, warnCommand];
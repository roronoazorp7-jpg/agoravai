import {
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import prisma from '../../database/client.js';

const ROLE_OPTIONS = ['cargo1', 'cargo2', 'cargo3', 'cargo4', 'cargo5'];
const PUBLIC_LOCK_ROLE_NAMES = ['admin', 'coordenador', 'suporte', 'helper', 'owner'];
const LOCKABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
]);

function v2Panel(text) {
  return {
    components: [
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(text),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function contextUserId(context) {
  return context.user?.id ?? context.author?.id;
}

function contextMemberPermissions(context) {
  return context.memberPermissions ?? context.member?.permissions;
}

function isSlashContext(context) {
  return typeof context.isChatInputCommand === 'function' && context.isChatInputCommand();
}

async function prepareResponse(context) {
  if (isSlashContext(context) && !context.deferred && !context.replied) {
    await context.deferReply({ flags: MessageFlags.IsComponentsV2 });
  }
}

function respond(context, payload) {
  if (context.deferred || context.replied) return context.editReply(payload);
  return context.reply(payload);
}

function selectedRoles(interaction) {
  const unique = new Map();
  for (const optionName of ROLE_OPTIONS) {
    const role = interaction.options.getRole(optionName);
    if (role) unique.set(role.id, role);
  }
  return [...unique.values()];
}

function roleList(roles) {
  return roles.length
    ? roles.map(role => `<@&${role.id}>`).join(', ')
    : 'Nenhum cargo adicional (apenas administradores).';
}

function normalizeRoleName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function configuredRoles(guild) {
  const roles = [];
  const missing = [];

  for (const roleName of PUBLIC_LOCK_ROLE_NAMES) {
    const role = guild.roles.cache.find(candidate => (
      normalizeRoleName(candidate.name) === normalizeRoleName(roleName)
    ));
    if (role) roles.push(role);
    else missing.push(roleName);
  }

  return { roles, missing };
}

function rolesForLock(context) {
  const selected = context.options ? selectedRoles(context) : [];
  return selected.length ? { roles: selected, missing: [] } : configuredRoles(context.guild);
}

function lockRecordRoleIds(record) {
  return (record?.allowedRoleIds ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

async function getLock(guildId, channelId) {
  return prisma.chatLock.findUnique({
    where: {
      guildId_channelId: {
        guildId,
        channelId,
      },
    },
  });
}

async function ensureLockPermissions(interaction) {
  const channel = interaction.channel;
  if (!interaction.guildId || !channel || !LOCKABLE_CHANNEL_TYPES.has(channel.type)) {
    return { error: 'Use este comando dentro de um canal de texto ou de anúncios.' };
  }

  if (!contextMemberPermissions(interaction)?.has(PermissionFlagsBits.ManageChannels)) {
    return { error: 'Você precisa da permissão **Gerenciar Canais**.' };
  }

  const botMember = interaction.guild.members.me
    ?? await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
  if (!botMember?.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
    return { error: 'Eu preciso da permissão **Gerenciar Canais** neste canal.' };
  }

  return { channel, botMember };
}

function validateRoles(roles, guild) {
  const invalid = roles.find(role => (
    role.id === guild.id
    || role.managed
  ));
  if (invalid) {
    return invalid.id === guild.id
      ? 'O cargo @everyone não pode ser configurado como exceção.'
      : `O cargo ${invalid} é gerenciado por uma integração e não pode ser usado.`;
  }
  return null;
}

async function editSendMessages(channel, id, value) {
  await channel.permissionOverwrites.edit(id, { SendMessages: value });
}

async function saveLock(context, channel, roles) {
  return prisma.chatLock.upsert({
    where: {
      guildId_channelId: {
        guildId: context.guildId,
        channelId: channel.id,
      },
    },
    create: {
      guildId: context.guildId,
      channelId: channel.id,
      allowedRoleIds: roles.map(role => role.id).join(','),
      lockedById: contextUserId(context),
    },
    update: {
      allowedRoleIds: roles.map(role => role.id).join(','),
      lockedById: contextUserId(context),
      lockedAt: new Date(),
    },
  });
}

async function repairSendMessageOverwrites(channel, guild, botMember, roles) {
  const keepRoleIds = new Set([guild.id, ...roles.map(role => role.id)]);

  // Remove only SendMessages from old role/member exceptions. Other channel
  // permissions remain untouched, so this repairs the lock without resetting
  // visibility, moderation, or other custom settings.
  for (const overwrite of channel.permissionOverwrites.cache.values()) {
    if (overwrite.id === botMember.id || keepRoleIds.has(overwrite.id)) continue;
    await editSendMessages(channel, overwrite.id, null);
  }

  await editSendMessages(channel, guild.id, false);
  for (const role of roles) {
    await editSendMessages(channel, role.id, true);
  }
}

async function lockChannel(context, channel, botMember, roles, { repair = false } = {}) {
  const currentLock = await getLock(context.guildId, channel.id);
  const previousRoleIds = lockRecordRoleIds(currentLock);
  const nextRoleIds = new Set(roles.map(role => role.id));

  if (repair) {
    await repairSendMessageOverwrites(channel, context.guild, botMember, roles);
  } else {
    await editSendMessages(channel, context.guild.roles.everyone.id, false);

    for (const roleId of previousRoleIds) {
      if (!nextRoleIds.has(roleId)) await editSendMessages(channel, roleId, null);
    }
    for (const role of roles) {
      await editSendMessages(channel, role.id, true);
    }
  }

  // The bot must keep access to publish and update the lock panel.
  await channel.permissionOverwrites.edit(botMember.id, {
    ViewChannel: true,
    SendMessages: true,
    EmbedLinks: true,
    ReadMessageHistory: true,
  });

  await saveLock(context, channel, roles);
}

async function lockChat(interaction) {
  await prepareResponse(interaction);
  const checked = await ensureLockPermissions(interaction);
  if (checked.error) return respond(interaction, v2Panel(`## 🔒 Lock do chat\n\n${checked.error}`));

  const { channel, botMember } = checked;
  const { roles, missing } = rolesForLock(interaction);
  if (missing.length) {
    return respond(interaction, v2Panel(
      `## 🔒 Lock do chat\n\n` +
      `Não encontrei estes cargos: **${missing.join(', ')}**.\n` +
      'Crie ou renomeie os cargos, ou selecione cargos manualmente no slash command.',
    ));
  }
  const roleError = validateRoles(roles, interaction.guild);
  if (roleError) return respond(interaction, v2Panel(`## 🔒 Lock do chat\n\n${roleError}`));

  try {
    await lockChannel(interaction, channel, botMember, roles, { repair: true });
  } catch (error) {
    return respond(interaction, v2Panel(
      `## 🔒 Lock do chat\n\nNão consegui trancar este canal.\n\n> ${error.message}`,
    ));
  }

  return respond(interaction, {
    ...v2Panel(
      `## 🔒 Chat trancado\n\n` +
      `**Cargos que podem falar:** ${roleList(roles)}\n` +
      `**Trancado por:** <@${contextUserId(interaction)}>`,
    ),
  });
}

async function unlockChat(interaction) {
  await prepareResponse(interaction);
  const checked = await ensureLockPermissions(interaction);
  if (checked.error) return respond(interaction, v2Panel(`## 🔓 Unlock do chat\n\n${checked.error}`));

  const { channel, botMember } = checked;
  let currentLock;
  try {
    currentLock = await getLock(interaction.guildId, channel.id);
  } catch (error) {
    return respond(interaction, v2Panel(
      `## 🔓 Unlock do chat\n\nNão consegui consultar o estado deste canal.\n\n> ${error.message}`,
    ));
  }
  if (!currentLock) {
    return respond(interaction, v2Panel('## 🔓 Chat destrancado\n\nEste canal não possui um lock ativo.'));
  }

  try {
    await editSendMessages(channel, interaction.guild.roles.everyone.id, null);
    for (const roleId of lockRecordRoleIds(currentLock)) {
      await editSendMessages(channel, roleId, null);
    }
    await channel.permissionOverwrites.edit(botMember.id, {
      ViewChannel: null,
      SendMessages: null,
      EmbedLinks: null,
      ReadMessageHistory: null,
    });
    await prisma.chatLock.delete({ where: { id: currentLock.id } });
  } catch (error) {
    return respond(interaction, v2Panel(
      `## 🔓 Unlock do chat\n\nNão consegui destrancar este canal.\n\n> ${error.message}`,
    ));
  }

  return respond(interaction, {
    ...v2Panel(
      `## 🔓 Chat destrancado\n\n` +
      `**Destrancado por:** <@${contextUserId(interaction)}>`,
    ),
  });
}

function isPublicChannel(channel, guild) {
  if (!LOCKABLE_CHANNEL_TYPES.has(channel.type)) return false;
  const everyonePermissions = channel.permissionsFor?.(guild.roles.everyone);
  if (everyonePermissions) return everyonePermissions.has(PermissionFlagsBits.ViewChannel);
  const everyoneOverwrite = channel.permissionOverwrites?.cache.get(guild.id);
  return !everyoneOverwrite?.deny?.has(PermissionFlagsBits.ViewChannel);
}

async function ensureAllLockPermissions(context) {
  if (!context.guildId || !context.guild) {
    return { error: 'Use este comando dentro de um servidor.' };
  }

  if (!contextMemberPermissions(context)?.has(PermissionFlagsBits.ManageChannels)) {
    return { error: 'Você precisa da permissão **Gerenciar Canais**.' };
  }

  const clientUserId = context.client?.user?.id;
  const botMember = context.guild.members.me
    ?? await context.guild.members.fetch(clientUserId).catch(() => null);
  if (!botMember) {
    return { error: 'Não consegui localizar meu membro no servidor.' };
  }

  const fetchedChannels = await context.guild.channels.fetch().catch(() => null);
  const publicChannels = [...(fetchedChannels ?? context.guild.channels.cache).values()]
    .filter(channel => isPublicChannel(channel, context.guild));
  const channels = [];
  const skipped = [];

  for (const channel of publicChannels) {
    if (botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
      channels.push(channel);
    } else {
      skipped.push(channel);
    }
  }

  if (!publicChannels.length) {
    return { error: 'Não encontrei canais públicos de texto ou anúncios neste servidor.' };
  }

  return { botMember, channels, skipped };
}

function channelNames(channels) {
  return channels.slice(0, 8).map(channel => `#${channel.name}`).join(', ')
    + (channels.length > 8 ? ` e mais ${channels.length - 8}` : '');
}

async function lockAllChat(context) {
  await prepareResponse(context);
  const checked = await ensureAllLockPermissions(context);
  if (checked.error) return respond(context, v2Panel(`## 🔒 Lock dos canais públicos\n\n${checked.error}`));

  await context.guild.roles.fetch().catch(() => null);
  const { roles, missing } = configuredRoles(context.guild);
  if (missing.length) {
    return respond(context, v2Panel(
      `## 🔒 Lock dos canais públicos\n\n` +
      `Não encontrei estes cargos: **${missing.join(', ')}**.\n` +
      'Crie ou renomeie os cargos e tente novamente.',
    ));
  }

  const roleError = validateRoles(roles, context.guild);
  if (roleError) return respond(context, v2Panel(`## 🔒 Lock dos canais públicos\n\n${roleError}`));

  const failures = [];
  let lockedCount = 0;
  for (const channel of checked.channels) {
    try {
      await lockChannel(context, channel, checked.botMember, roles, { repair: true });
      lockedCount += 1;
    } catch (error) {
      failures.push(`#${channel.name}: ${error.message}`);
    }
  }

  let result = `## 🔒 Canais públicos trancados\n\n` +
    `**Cargos que podem falar:** ${roleList(roles)}\n` +
    `**Canais ajustados:** ${lockedCount}`;
  if (checked.skipped.length) {
    result += `\n\n⚠️ **Sem permissão para ajustar:** ${channelNames(checked.skipped)}`;
  }
  if (failures.length) {
    result += `\n\n❌ **Falhas:** ${failures.slice(0, 5).join(' | ')}`;
  }
  result += `\n\n**Executado por:** <@${contextUserId(context)}>`;

  return respond(context, v2Panel(result));
}

async function unlockAllChat(context) {
  await prepareResponse(context);
  const checked = await ensureAllLockPermissions(context);
  if (checked.error) return respond(context, v2Panel(`## 🔓 Unlock dos canais públicos\n\n${checked.error}`));

  let unlockedCount = 0;
  const failures = [];
  for (const channel of checked.channels) {
    let currentLock;
    try {
      currentLock = await getLock(context.guildId, channel.id);
      if (!currentLock) continue;

      await editSendMessages(channel, context.guild.roles.everyone.id, null);
      for (const roleId of lockRecordRoleIds(currentLock)) {
        await editSendMessages(channel, roleId, null);
      }
      await channel.permissionOverwrites.edit(checked.botMember.id, {
        ViewChannel: null,
        SendMessages: null,
        EmbedLinks: null,
        ReadMessageHistory: null,
      });
      await prisma.chatLock.delete({ where: { id: currentLock.id } });
      unlockedCount += 1;
    } catch (error) {
      failures.push(`#${channel.name}: ${error.message}`);
    }
  }

  let result = `## 🔓 Canais públicos destrancados\n\n**Canais ajustados:** ${unlockedCount}`;
  if (checked.skipped.length) {
    result += `\n\n⚠️ **Sem permissão para ajustar:** ${channelNames(checked.skipped)}`;
  }
  if (failures.length) {
    result += `\n\n❌ **Falhas:** ${failures.slice(0, 5).join(' | ')}`;
  }
  result += `\n\n**Executado por:** <@${contextUserId(context)}>`;

  return respond(context, v2Panel(result));
}

function addRoleOptions(subcommand) {
  return ROLE_OPTIONS.reduce((builder, optionName, index) => builder.addRoleOption(option =>
    option
      .setName(optionName)
      .setDescription(`Cargo ${index + 1} que poderá falar durante o lock`)
      .setRequired(false),
  ), subcommand);
}

export default {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Tranca ou destranca o canal atual')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(subcommand =>
      addRoleOptions(
        subcommand
          .setName('lock')
          .setDescription('Tranca o canal e define os cargos que poderão falar'),
      ))
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlock')
        .setDescription('Destranca o canal atual'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('lockall')
        .setDescription('Corrige e tranca todos os canais públicos'),
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('unlockall')
        .setDescription('Destranca todos os canais públicos com lock'),
    ),
  // Os comandos de texto têm nomes próprios; o slash continua agrupado em /chat.
  name: 'lock',
  aliases: ['unlock', 'chat'],

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'lock') return lockChat(interaction);
    if (subcommand === 'unlock') return unlockChat(interaction);
    if (subcommand === 'lockall') return lockAllChat(interaction);
    if (subcommand === 'unlockall') return unlockAllChat(interaction);
    return interaction.reply(v2Panel(
      'Use `/chat lock`, `/chat unlock`, `/chat lockall` ou `/chat unlockall`.',
    ));
  },

  async executePrefix(message, _args, _client, commandName) {
    const invokedCommand = commandName
      ?? message.content.trim().split(/\s+/)[1]?.toLowerCase();
    const requestedAction = invokedCommand === 'chat'
      ? _args[0]?.toLowerCase()
      : invokedCommand;
    const allRequested = invokedCommand === 'chat'
      ? _args[1]?.toLowerCase() === 'all'
      : _args[0]?.toLowerCase() === 'all';
    const action = allRequested ? `${requestedAction}all` : requestedAction;

    if (action === 'lock') return lockChat(message);
    if (action === 'unlock') return unlockChat(message);
    if (action === 'lockall') return lockAllChat(message);
    if (action === 'unlockall') return unlockAllChat(message);
    return message.reply(
      'Use `savage lock`, `savage unlock`, `savage lock all` ou `savage unlock all`.',
    );
  },
};
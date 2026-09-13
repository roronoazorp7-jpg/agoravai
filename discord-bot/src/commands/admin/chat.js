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

function lockRecordRoleIds(record) {
  return (record?.allowedRoleIds ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

async function getLock(interaction) {
  return prisma.chatLock.findUnique({
    where: {
      guildId_channelId: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
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

async function lockChat(interaction) {
  const checked = await ensureLockPermissions(interaction);
  if (checked.error) return interaction.reply(v2Panel(`## 🔒 Lock do chat\n\n${checked.error}`));

  const { channel, botMember } = checked;
  const roles = interaction.options ? selectedRoles(interaction) : [];
  const roleError = validateRoles(roles, interaction.guild);
  if (roleError) return interaction.reply(v2Panel(`## 🔒 Lock do chat\n\n${roleError}`));

  const currentLock = await getLock(interaction);
  const previousRoleIds = lockRecordRoleIds(currentLock);
  const nextRoleIds = new Set(roles.map(role => role.id));

  try {
    await editSendMessages(channel, interaction.guild.roles.everyone.id, false);

    for (const roleId of previousRoleIds) {
      if (!nextRoleIds.has(roleId)) await editSendMessages(channel, roleId, null);
    }
    for (const role of roles) {
      await editSendMessages(channel, role.id, true);
    }

    // O bot continua podendo publicar o painel e responder no chat trancado.
    await channel.permissionOverwrites.edit(botMember.id, {
      ViewChannel: true,
      SendMessages: true,
      EmbedLinks: true,
      ReadMessageHistory: true,
    });

    await prisma.chatLock.upsert({
      where: {
        guildId_channelId: {
          guildId: interaction.guildId,
          channelId: channel.id,
        },
      },
      create: {
        guildId: interaction.guildId,
        channelId: channel.id,
        allowedRoleIds: roles.map(role => role.id).join(','),
        lockedById: contextUserId(interaction),
      },
      update: {
        allowedRoleIds: roles.map(role => role.id).join(','),
        lockedById: contextUserId(interaction),
        lockedAt: new Date(),
      },
    });
  } catch (error) {
    return interaction.reply(v2Panel(
      `## 🔒 Lock do chat\n\nNão consegui trancar este canal.\n\n> ${error.message}`,
    ));
  }

  return interaction.reply({
    ...v2Panel(
      `## 🔒 Chat trancado\n\n` +
      `**Cargos que podem falar:** ${roleList(roles)}\n` +
      `**Trancado por:** <@${contextUserId(interaction)}>`,
    ),
  });
}

async function unlockChat(interaction) {
  const checked = await ensureLockPermissions(interaction);
  if (checked.error) return interaction.reply(v2Panel(`## 🔓 Unlock do chat\n\n${checked.error}`));

  const { channel, botMember } = checked;
  const currentLock = await getLock(interaction);
  if (!currentLock) {
    return interaction.reply(v2Panel('## 🔓 Chat destrancado\n\nEste canal não possui um lock ativo.'));
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
    return interaction.reply(v2Panel(
      `## 🔓 Unlock do chat\n\nNão consegui destrancar este canal.\n\n> ${error.message}`,
    ));
  }

  return interaction.reply({
    ...v2Panel(
      `## 🔓 Chat destrancado\n\n` +
      `**Destrancado por:** <@${contextUserId(interaction)}>`,
    ),
  });
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
    ),
  // Os comandos de texto têm nomes próprios; o slash continua agrupado em /chat.
  name: 'lock',
  aliases: ['unlock'],

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'lock') return lockChat(interaction);
    if (subcommand === 'unlock') return unlockChat(interaction);
    return interaction.reply(v2Panel('Use `/chat lock` ou `/chat unlock`.'));
  },

  async executePrefix(message, _args, _client, commandName) {
    const invokedCommand = commandName
      ?? message.content.trim().split(/\s+/)[1]?.toLowerCase();

    if (invokedCommand === 'lock') return lockChat(message);
    if (invokedCommand === 'unlock') return unlockChat(message);
    return message.reply('Use `savage lock` ou `savage unlock`.');
  },
};
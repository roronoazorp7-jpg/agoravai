import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

const SERVER_INFO_BANNER_PATH = fileURLToPath(new URL('../../assets/server-info-banner.gif', import.meta.url));

function payload(guild) {
  const owner = guild.ownerId ? `<@${guild.ownerId}>` : 'Não identificado';
  const channels = guild.channels.cache;
  const textChannels = channels.filter(channel => channel.isTextBased()).size;
  const voiceChannels = channels.filter(channel => channel.isVoiceBased()).size;
  const iconUrl = guild.iconURL?.({ extension: 'png', size: 256, forceStatic: false });

  const text = [
    `## ${guild.name}`,
    '',
    `**Dono:** ${owner}`,
    `**Membros:** ${guild.memberCount}`,
    `**Canais:** ${textChannels} texto · ${voiceChannels} voz`,
    `**Cargos:** ${guild.roles.cache.size - 1}`,
    `**Criado em:** <t:${Math.floor(guild.createdTimestamp / 1000)}:D>`,
    `**ID:** \`${guild.id}\``,
  ].join('\n');

  return {
    ...buildUtilityV2({
      text,
      thumbnailUrl: iconUrl,
      imageUrl: 'attachment://server-info-banner.gif',
    }),
    files: [
      new AttachmentBuilder(SERVER_INFO_BANNER_PATH, { name: 'server-info-banner.gif' }),
    ],
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('server-info')
    .setDescription('Mostra informações deste servidor'),
  name: 'server-info',
  aliases: ['serverinfo', 'infoserver', 'servidor'],
  async execute(interaction) {
    return interaction.reply(payload(interaction.guild));
  },
  async executePrefix(message) {
    return message.reply(payload(message.guild));
  },
};
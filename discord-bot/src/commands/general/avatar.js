import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

function targetFrom(messageOrInteraction) {
  return messageOrInteraction.mentions?.users?.first()
    ?? messageOrInteraction.options?.getUser('usuario')
    ?? messageOrInteraction.user;
}

function payload(user) {
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 1024, forceStatic: false });
  return buildUtilityV2({
    text: `## Avatar de ${user.globalName ?? user.username}\n\n[Abra o avatar em tamanho completo](${avatarUrl})`,
    imageUrl: avatarUrl,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostra o avatar de um usuário')
    .addUserOption(option => option.setName('usuario').setDescription('Usuário desejado')),
  name: 'avatar',
  aliases: ['pfp'],
  async execute(interaction) {
    return interaction.reply(payload(targetFrom(interaction)));
  },
  async executePrefix(message) {
    return message.reply(payload(targetFrom(message)));
  },
};
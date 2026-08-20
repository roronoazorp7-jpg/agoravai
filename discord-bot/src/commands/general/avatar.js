import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

function targetFromInteraction(interaction) {
  return interaction.options.getUser('usuario') ?? interaction.user;
}

function targetFromMessage(message) {
  return message.mentions.users.first() ?? message.author;
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
    return interaction.reply(payload(targetFromInteraction(interaction)));
  },
  async executePrefix(message) {
    return message.reply(payload(targetFromMessage(message)));
  },
};
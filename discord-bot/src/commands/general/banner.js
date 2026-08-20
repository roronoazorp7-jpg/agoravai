import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

function targetFrom(messageOrInteraction) {
  return messageOrInteraction.mentions?.users?.first()
    ?? messageOrInteraction.options?.getUser('usuario')
    ?? messageOrInteraction.user;
}

function payload(user) {
  const bannerUrl = user.bannerURL?.({ extension: 'png', size: 1024, forceStatic: false });
  if (!bannerUrl) {
    return buildUtilityV2({
      text: `## Banner de ${user.globalName ?? user.username}\n\nEste usuário não possui um banner personalizado.`,
      thumbnailUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
    });
  }

  return buildUtilityV2({
    text: `## Banner de ${user.globalName ?? user.username}\n\n[Abra o banner em tamanho completo](${bannerUrl})`,
    imageUrl: bannerUrl,
  });
}

async function fetchTarget(user) {
  return user.fetch().catch(() => user);
}

export default {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Mostra o banner de um usuário')
    .addUserOption(option => option.setName('usuario').setDescription('Usuário desejado')),
  name: 'banner',
  aliases: ['profile-banner'],
  async execute(interaction) {
    return interaction.reply(payload(await fetchTarget(targetFrom(interaction))));
  },
  async executePrefix(message) {
    return message.reply(payload(await fetchTarget(targetFrom(message))));
  },
};
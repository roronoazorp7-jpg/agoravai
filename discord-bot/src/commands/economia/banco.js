import { SlashCommandBuilder } from 'discord.js';
import { sendBankPanel } from '../../utils/bankHandlers.js';

const cmdBanco = {
  data: new SlashCommandBuilder()
    .setName('banco')
    .setDescription('🏦 Acesse o Midas Bank e invista em ações'),
  name: 'banco',
  aliases: ['bank', 'midas'],

  async execute(interaction) {
    return sendBankPanel({
      guildId: interaction.guildId,
      reply: payload => interaction.reply(payload),
    });
  },

  async executePrefix(message) {
    return sendBankPanel({
      guildId: message.guildId,
      reply: payload => message.reply(payload),
    });
  },
};

export default cmdBanco;
import { SlashCommandBuilder } from 'discord.js';
import { startUno } from '../../utils/unoGame.js';

export default {
  data: new SlashCommandBuilder()
    .setName('uno')
    .setDescription('🎴 Inicie uma partida clássica de UNO'),
  name: 'uno',
  aliases: ['cartas-uno'],

  async execute(interaction) {
    await interaction.deferReply();
    return startUno(interaction, payload => interaction.editReply(payload));
  },

  async executePrefix(message) {
    return startUno(message, payload => message.reply(payload));
  },
};
import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { errorEmbed } from '../../utils/embed.js';
import { startBlackjack, startMines } from '../../utils/gameHandlers.js';
import { totalCoins } from '../../utils/economyFunds.js';

import { getEmoji } from '../../utils/emojiManager.js';
const COIN = () => getEmoji('futecoins');

function parseBet(input, balance) {
  const s = String(input).toLowerCase().trim();
  if (s === 'tudo' || s === 'all') return balance;
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}

async function getEco(userId, guildId) {
  return prisma.economy.upsert({
    where:  { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('jogo')
    .setDescription('Apostas e jogos de cassino')
    .addSubcommand(s => s.setName('blackjack')
      .setDescription('🃏 Blackjack — chegue mais perto de 21 sem estourar')
      .addStringOption(o => o.setName('aposta').setDescription('Valor (ex: 500 ou "tudo")').setRequired(true)))
    .addSubcommand(s => s.setName('mines')
      .setDescription('💣 Mines — revele gemas sem explodir!')
      .addStringOption(o => o.setName('aposta').setDescription('Valor (ex: 500 ou "tudo")').setRequired(true))
      .addIntegerOption(o => o.setName('bombas').setDescription('Número de bombas (padrão: 3)').setMinValue(1).setMaxValue(13))),
  name: 'jogo',
  aliases: ['apostar', 'jog', 'blackjack', 'bj', 'mines'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    const eco = await getEco(interaction.user.id, interaction.guildId);

    if (sub === 'blackjack') {
      const bet = parseBet(interaction.options.getString('aposta'), totalCoins(eco));
      if (!bet || bet <= 0) return interaction.editReply({ embeds: [errorEmbed('Aposta inválida.')] });
      return startBlackjack(interaction, bet, opts => interaction.editReply(opts));
    }

    if (sub === 'mines') {
      const bet   = parseBet(interaction.options.getString('aposta'), totalCoins(eco));
      const bombs = interaction.options.getInteger('bombas') ?? 3;
      if (!bet || bet <= 0) return interaction.editReply({ embeds: [errorEmbed('Aposta inválida.')] });
      return startMines(interaction, bet, bombs, opts => interaction.editReply(opts));
    }
  },

  async executePrefix(message, args, client, calledAs) {
    const userId  = message.author.id;
    const guildId = message.guildId;

    const help = () => message.reply({
      embeds: [errorEmbed('**Uso:** `savage jogo <subcomando> <aposta> [extra]`\n**Subcomandos:** `blackjack <aposta>`, `mines <aposta> [bombas]`')],
    });

    const eco = await getEco(userId, guildId).catch(() => null);
    if (!eco) return message.reply({ embeds: [errorEmbed('Erro ao acessar seu saldo.')] });

    const send = opts => message.reply(opts);

    // Chamada direta: "savage blackjack 500" ou "savage bj 500"
    if (calledAs === 'blackjack' || calledAs === 'bj') {
      const bet = parseBet(args[0], totalCoins(eco));
      if (!bet || bet <= 0) return send({ embeds: [errorEmbed('Aposta inválida. Ex: `savage blackjack 500`')] });
      return startBlackjack(message, bet, opts => message.reply(opts));
    }

    // Chamada direta: "savage mines 500 3"
    if (calledAs === 'mines') {
      const bet   = parseBet(args[0], totalCoins(eco));
      const bombs = parseInt(args[1]) || 3;
      if (!bet || bet <= 0) return send({ embeds: [errorEmbed('Aposta inválida. Ex: `savage mines 500 3`')] });
      return startMines(message, bet, bombs, opts => message.reply(opts));
    }

    const sub = args[0]?.toLowerCase();
    if (!sub) return help();

    if (sub === 'blackjack' || sub === 'bj') {
      const bet = parseBet(args[1], totalCoins(eco));
      if (!bet || bet <= 0) return send({ embeds: [errorEmbed('Aposta inválida. Ex: `savage jogo blackjack 500`')] });
      return startBlackjack(message, bet, opts => message.reply(opts));
    }

    if (sub === 'mines' || sub === 'm') {
      const bet   = parseBet(args[1], totalCoins(eco));
      const bombs = parseInt(args[2]) || 3;
      if (!bet || bet <= 0) return send({ embeds: [errorEmbed('Aposta inválida. Ex: `savage jogo mines 500 3`')] });
      return startMines(message, bet, bombs, opts => message.reply(opts));
    }

    return help();
  },
};

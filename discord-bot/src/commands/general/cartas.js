import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import prisma from '../../database/client.js';
import { spendCoins, totalCoins } from '../../utils/economyFunds.js';
import {
  CARD_DEFS,
  CARD_PACK_PRICE,
  CARD_PACK_SIZE,
  rarityData,
  getCard,
  pickPackCards,
} from '../../utils/cardData.js';
import { generateCardSheet } from '../../utils/cardVisuals.js';

function packCount(value) {
  return Math.min(Math.max(Number(value) || 1, 1), 3);
}

async function getEco(userId, guildId, db = prisma) {
  return db.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}

function collectionText(rows) {
  const owned = new Map(rows.map(row => [row.cardKey, row.quantity]));
  const lines = CARD_DEFS.map(card => {
    const quantity = owned.get(card.key) ?? 0;
    const rarity = rarityData(card.rarity);
    return `${quantity ? '▣' : '▫'} **${card.name}** — ${rarity.label}${quantity ? ` ×${quantity}` : ''}`;
  });
  return lines.join('\n');
}

async function openPacks(userId, guildId, count) {
  const total = CARD_PACK_PRICE * count;
  const cards = Array.from({ length: count }, () => pickPackCards()).flat();
  return prisma.$transaction(async tx => {
    const eco = await getEco(userId, guildId, tx);
    if (totalCoins(eco) < total) return { ok: false, balance: totalCoins(eco), total };
    const spent = await spendCoins(tx, { userId, guildId, amount: total });
    if (!spent.ok) return { ok: false, balance: spent.available ?? totalCoins(eco), total };

    let duplicates = 0;
    let refund = 0;
    for (const card of cards) {
      const current = await tx.cardCollection.findUnique({
        where: { userId_cardKey: { userId, cardKey: card.key } },
      });
      if (current) {
        duplicates += 1;
        refund += rarityData(card.rarity).duplicateValue;
        await tx.cardCollection.update({
          where: { userId_cardKey: { userId, cardKey: card.key } },
          data: { quantity: { increment: 1 } },
        });
      } else {
        await tx.cardCollection.create({ data: { userId, cardKey: card.key } });
      }
    }
    if (refund) {
      await tx.economy.update({
        where: { userId_guildId: { userId, guildId } },
        data: { balance: { increment: refund } },
      });
    }
    return { ok: true, cards, duplicates, refund, balance: totalCoins(eco) - total + refund };
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('cartas')
    .setDescription('Colecione cartas originais de anime e fantasia')
    .addSubcommand(sub => sub
      .setName('abrir')
      .setDescription(`Abra um pacote com ${CARD_PACK_SIZE} cartas por ${CARD_PACK_PRICE} coins`)
      .addIntegerOption(option => option
        .setName('pacotes')
        .setDescription('Quantidade de pacotes (máximo 3)')
        .setMinValue(1)
        .setMaxValue(3)))
    .addSubcommand(sub => sub
      .setName('colecao')
      .setDescription('Veja suas cartas e seu progresso'))
    .addSubcommand(sub => sub
      .setName('ver')
      .setDescription('Veja os detalhes de uma carta')
      .addStringOption(option => option
        .setName('carta')
        .setDescription('Carta que deseja consultar')
        .setRequired(true)
        .addChoices(...CARD_DEFS.map(card => ({ name: card.name, value: card.key }))))),
  name: 'cartas',
  aliases: ['carta', 'cards'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'colecao') {
      const rows = await prisma.cardCollection.findMany({ where: { userId: interaction.user.id } });
      const ownedUnique = rows.length;
      const embed = new EmbedBuilder()
        .setColor(0x8e6cff)
        .setTitle('Arcana — Sua coleção')
        .setDescription(`**${ownedUnique}/${CARD_DEFS.length}** cartas descobertas\n\n${collectionText(rows)}`)
        .setFooter({ text: 'Use /cartas abrir para comprar um pacote.' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'ver') {
      const card = getCard(interaction.options.getString('carta'));
      const owned = await prisma.cardCollection.findUnique({
        where: { userId_cardKey: { userId: interaction.user.id, cardKey: card.key } },
      });
      const image = await generateCardSheet([card]);
      return interaction.editReply({
        content: `${card.name} • ${rarityData(card.rarity).label}${owned ? ` • Você possui ${owned.quantity}` : ' • Ainda não descoberta'}`,
        files: [new AttachmentBuilder(image, { name: 'carta.png' })],
      });
    }

    const result = await openPacks(
      interaction.user.id,
      interaction.guildId,
      packCount(interaction.options.getInteger('pacotes')),
    );
    if (!result.ok) {
      return interaction.editReply(`Você precisa de **${result.total.toLocaleString('pt-BR')} coins**, mas possui **${result.balance.toLocaleString('pt-BR')} coins**.`);
    }
    const image = await generateCardSheet(result.cards);
    const summary = result.cards
      .map(card => `${rarityData(card.rarity).label} — **${card.name}**`)
      .join('\n');
    return interaction.editReply({
      content:
        `## Pacote Arcana aberto!\n${summary}\n\n` +
        (result.duplicates
          ? `♻️ ${result.duplicates} duplicata(s) convertida(s) em **${result.refund.toLocaleString('pt-BR')} coins**.`
          : '✨ Todas as cartas são novas!') +
        `\n💰 Valor pago: **${(CARD_PACK_PRICE * packCount(interaction.options.getInteger('pacotes'))).toLocaleString('pt-BR')} coins**`,
      files: [new AttachmentBuilder(image, { name: 'pacote-arcana.png' })],
    });
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() ?? 'colecao';
    if (sub === 'colecao' || sub === 'collection') {
      const rows = await prisma.cardCollection.findMany({ where: { userId: message.author.id } });
      return message.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x8e6cff)
          .setTitle('Arcana — Sua coleção')
          .setDescription(`**${rows.length}/${CARD_DEFS.length}** cartas descobertas\n\n${collectionText(rows)}`)],
      });
    }
    if (sub === 'abrir' || sub === 'open') {
      const count = packCount(args[1]);
      const result = await openPacks(message.author.id, message.guildId, count);
      if (!result.ok) return message.reply(`Você precisa de **${result.total.toLocaleString('pt-BR')} coins**, mas possui **${result.balance.toLocaleString('pt-BR')} coins**.`);
      const image = await generateCardSheet(result.cards);
      return message.reply({
        content: `## Pacote Arcana aberto!\n${result.cards.map(card => `${rarityData(card.rarity).label} — **${card.name}**`).join('\n')}\n\n` +
          (result.duplicates ? `♻️ Duplicatas convertidas em **${result.refund.toLocaleString('pt-BR')} coins**.` : '✨ Todas as cartas são novas!'),
        files: [new AttachmentBuilder(image, { name: 'pacote-arcana.png' })],
      });
    }
    const card = getCard(args[1]);
    if (!card) return message.reply('Use `savage cartas abrir`, `savage cartas colecao` ou `savage cartas ver <chave>`. Veja as chaves disponíveis em `/cartas ver`.');
    const image = await generateCardSheet([card]);
    return message.reply({ content: `${card.name} • ${rarityData(card.rarity).label}`, files: [new AttachmentBuilder(image, { name: 'carta.png' })] });
  },
};
import {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
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
import { generateCardSheet, loadPackCover } from '../../utils/cardVisuals.js';

function packCount(value) {
  return Math.min(Math.max(Number(value) || 1, 1), 3);
}

const packSessions = new Map();
const SESSION_TTL = 10 * 60 * 1000;

function createPackSession({ userId, guildId, count }) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  packSessions.set(token, {
    userId,
    guildId,
    count,
    cards: null,
    index: 0,
    expiresAt: Date.now() + SESSION_TTL,
  });
  return token;
}

function getPackSession(token) {
  const session = packSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    packSessions.delete(token);
    return null;
  }
  return session;
}

async function buildPackCoverPayload(token, count) {
  const cover = await loadPackCover();
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://capa-pack-pokemon.jpg'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Pack Pokémon\n\n` +
        `Um pack com **${CARD_PACK_SIZE} cartas** da coleção Pokémon.\n` +
        `Você está abrindo **${count} pack${count > 1 ? 's' : ''}** por **${(CARD_PACK_PRICE * count).toLocaleString('pt-BR')} coins**.`,
      ),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon_pack_open:${token}`)
      .setLabel('Abrir pack')
      .setStyle(ButtonStyle.Primary),
  );
  return {
    components: [container, row],
    files: [new AttachmentBuilder(cover, { name: 'capa-pack-pokemon.jpg' })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildCardRevealPayload(session) {
  const card = session.cards[session.index];
  const isLast = session.index >= session.cards.length - 1;
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://carta-revelada.png'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Carta ${session.index + 1} de ${session.cards.length}\n\n` +
        `**${card.name}** — ${rarityData(card.rarity).label}`,
      ),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(isLast ? `pokemon_pack_finish:${session.token}` : `pokemon_pack_next:${session.token}`)
      .setLabel(isLast ? 'Ver pack completo' : 'Passar carta')
      .setStyle(ButtonStyle.Primary),
  );
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

function buildPackFinishedPayload(session) {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://cartas-pokemon.png'),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Pack Pokémon completo\n\n` +
        session.cards.map((card, i) => `${i + 1}. **${card.name}** — ${rarityData(card.rarity).label}`).join('\n') +
        `\n\n${session.duplicates ? `♻️ ${session.duplicates} duplicata(s) convertida(s) em **${session.refund.toLocaleString('pt-BR')} coins**.` : '✨ Todas as cartas são novas!'}`,
      ),
    );
  return { components: [container], flags: MessageFlags.IsComponentsV2 };
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

export async function handleCardPackInteraction(interaction) {
  const [action, token] = interaction.customId.split(':');
  const session = getPackSession(token);
  if (!session) {
    return interaction.reply({ content: 'Este pack expirou. Use `s cartas abrir` para começar outro.', ephemeral: true });
  }
  if (session.userId !== interaction.user.id) {
    return interaction.reply({ content: 'Este pack pertence a outra pessoa.', ephemeral: true });
  }

  if (action === 'pokemon_pack_open') {
    const result = await openPacks(session.userId, session.guildId, session.count);
    if (!result.ok) {
      packSessions.delete(token);
      return interaction.update({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Não foi possível abrir o pack\n\nVocê precisa de **${result.total.toLocaleString('pt-BR')} coins**, mas possui **${result.balance.toLocaleString('pt-BR')} coins**.`,
            ),
          ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }
    session.cards = result.cards;
    session.index = 0;
    session.duplicates = result.duplicates;
    session.refund = result.refund;
    const cardImage = await generateCardSheet([session.cards[0]]);
    return interaction.update({
      ...buildCardRevealPayload({ ...session, token }),
      files: [new AttachmentBuilder(cardImage, { name: 'carta-revelada.png' })],
    });
  }

  if (action === 'pokemon_pack_next') {
    if (!session.cards) return interaction.reply({ content: 'Abra o pack primeiro.', ephemeral: true });
    session.index += 1;
    const cardImage = await generateCardSheet([session.cards[session.index]]);
    return interaction.update({
      ...buildCardRevealPayload({ ...session, token }),
      files: [new AttachmentBuilder(cardImage, { name: 'carta-revelada.png' })],
    });
  }

  if (action === 'pokemon_pack_finish') {
    if (!session.cards) return interaction.reply({ content: 'Abra o pack primeiro.', ephemeral: true });
    const image = await generateCardSheet(session.cards);
    packSessions.delete(token);
    return interaction.update({
      ...buildPackFinishedPayload(session),
      files: [new AttachmentBuilder(image, { name: 'cartas-pokemon.png' })],
    });
  }
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

    const count = packCount(interaction.options.getInteger('pacotes'));
    const token = createPackSession({ userId: interaction.user.id, guildId: interaction.guildId, count });
    return interaction.editReply(await buildPackCoverPayload(token, count));
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
      const token = createPackSession({ userId: message.author.id, guildId: message.guildId, count });
      return message.reply(await buildPackCoverPayload(token, count));
    }
    const card = getCard(args[1]);
    if (!card) return message.reply('Use `savage cartas abrir`, `savage cartas colecao` ou `savage cartas ver <chave>`. Veja as chaves disponíveis em `/cartas ver`.');
    const image = await generateCardSheet([card]);
    return message.reply({ content: `${card.name} • ${rarityData(card.rarity).label}`, files: [new AttachmentBuilder(image, { name: 'carta.png' })] });
  },
};
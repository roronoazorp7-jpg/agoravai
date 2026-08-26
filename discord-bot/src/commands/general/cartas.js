import {
  SlashCommandBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { fileURLToPath } from 'node:url';
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
import { generateCardSheet, generatePokedexSheet, loadPackCover } from '../../utils/cardVisuals.js';

function packCount(value) {
  return Math.min(Math.max(Number(value) || 1, 1), 3);
}

const packSessions = new Map();
const dexSessions = new Map();
const activeDexSessions = new Map();
const SESSION_TTL = 10 * 60 * 1000;
const DEX_PAGE_SIZE = 8;
const SELL_PAGE_SIZE = 25;
const FUT_TEST_CARDS = Object.freeze([
  {
    name: 'Paulo Dybala • 96 CF',
    path: fileURLToPath(new URL('../../assets/cards/fut-test-01.jpg', import.meta.url)),
    filename: 'fut-carta-1.jpg',
    type: 'imagem',
  },
  {
    name: 'Marcus Rashford • 95 MI',
    path: fileURLToPath(new URL('../../assets/cards/fut-test-02.jpg', import.meta.url)),
    filename: 'fut-carta-2.jpg',
    type: 'imagem',
  },
  {
    name: 'Carta FUT de teste #1',
    path: fileURLToPath(new URL('../../assets/cards/fut-test-01.gif', import.meta.url)),
    filename: 'fut-carta-3.gif',
    type: 'GIF',
  },
  {
    name: 'Carta FUT de teste #2',
    path: fileURLToPath(new URL('../../assets/cards/fut-test-02.gif', import.meta.url)),
    filename: 'fut-carta-4.gif',
    type: 'GIF',
  },
]);
const futPackSessions = new Map();

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

function createFutPackSession({ userId, guildId }) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  futPackSessions.set(token, {
    userId,
    guildId,
    index: 0,
    expiresAt: Date.now() + SESSION_TTL,
  });
  return token;
}

function getFutPackSession(token) {
  const session = futPackSessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    futPackSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function buildFutPackCoverPayload(token) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Abrir FUT\n\n` +
        `Pacote teste gratuito com **4 cartas de futebol**: 2 cartas e 2 GIFs.\n` +
        `Tudo será revelado um por vez, exatamente como enviado.`,
      ),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fut_pack_open:${token}`)
      .setLabel('Abrir FUT')
      .setStyle(ButtonStyle.Primary),
  );
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

function buildFutCardPayload(session) {
  const card = FUT_TEST_CARDS[session.index];
  const isLast = session.index >= FUT_TEST_CARDS.length - 1;
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${card.filename}`),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Carta FUT ${session.index + 1} de ${FUT_TEST_CARDS.length}\n\n` +
        `**${card.name}**\n` +
        `${card.type === 'GIF' ? 'GIF original' : 'Imagem original'} do pacote de teste.`,
      ),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(isLast ? `fut_pack_finish:${session.token}` : `fut_pack_next:${session.token}`)
      .setLabel(isLast ? 'Ver pacote completo' : 'Próxima carta')
      .setStyle(ButtonStyle.Primary),
  );
  return {
    components: [container, row],
    files: [new AttachmentBuilder(card.path, { name: card.filename })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildFutPackFinishedPayload() {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        ...FUT_TEST_CARDS.map(card =>
          new MediaGalleryItemBuilder().setURL(`attachment://${card.filename}`),
        ),
      ),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Abrir FUT concluído\n\n` +
        `Você revelou as **${FUT_TEST_CARDS.length} cartas** do pacote teste.`,
      ),
    );
  return {
    components: [container],
    files: FUT_TEST_CARDS.map(card => new AttachmentBuilder(card.path, { name: card.filename })),
    flags: MessageFlags.IsComponentsV2,
  };
}

function createDexSession({ userId, guildId, page = 0 }) {
  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  const session = {
    token,
    userId,
    guildId,
    page,
    expiresAt: Date.now() + SESSION_TTL,
  };
  dexSessions.set(token, session);
  activeDexSessions.set(`${guildId}:${userId}`, token);
  return token;
}

function getDexSession(token, userId = null, guildId = null) {
  let session = dexSessions.get(token);
  if (!session && userId && guildId) {
    const activeToken = activeDexSessions.get(`${guildId}:${userId}`);
    session = activeToken ? dexSessions.get(activeToken) : null;
  }
  if (!session || session.expiresAt < Date.now()) {
    if (token) dexSessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
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

async function buildDexPayload({ userId, guildId, token, page }) {
  const rows = await prisma.cardCollection.findMany({ where: { userId } });
  const owned = new Map(rows.map(row => [row.cardKey, row.quantity]));
  const totalPages = Math.max(1, Math.ceil(CARD_DEFS.length / DEX_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageCards = CARD_DEFS.slice(safePage * DEX_PAGE_SIZE, (safePage + 1) * DEX_PAGE_SIZE);
  const image = await generatePokedexSheet(pageCards, new Set(owned.keys()), { columns: 4 });
  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`pokemon_dex_card:${token}`)
      .setPlaceholder('Escolha uma carta para ver e vender')
      .addOptions(pageCards.map(card => ({
        label: card.name.slice(0, 100),
        description: `${rarityData(card.rarity).label}${owned.has(card.key) ? ` • possui ${owned.get(card.key)}x` : ' • não descoberta'}`,
        value: card.key,
      }))),
  );
  const navigationRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon_dex_page:${token}:${safePage - 1}`)
      .setLabel('Página anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`pokemon_dex_page:${token}:${safePage + 1}`)
      .setLabel('Próxima página')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`pokemon_vitrine:${token}:0`)
      .setLabel('Vitrine')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`pokemon_sell:${token}:0`)
      .setLabel('Vender cartas')
      .setStyle(ButtonStyle.Success),
  );
  return {
    content:
      `## Pokédex Pokémon\n` +
      `**${owned.size}/${CARD_DEFS.length}** cartas descobertas • Página **${safePage + 1}/${totalPages}**\n` +
      `Cartas bloqueadas aparecem esmaecidas. Use \`/cartas ver\` para abrir uma carta.`,
    files: [new AttachmentBuilder(image, { name: 'pokedex-pokemon.png' })],
    components: [selectRow, navigationRow],
  };
}

async function buildSellPayload({ userId, guildId, token, page = 0 }) {
  const rows = await prisma.cardCollection.findMany({
    where: { userId, quantity: { gt: 0 } },
    orderBy: { cardKey: 'asc' },
  });
  const ownedCards = rows
    .map(row => ({ card: getCard(row.cardKey), quantity: row.quantity }))
    .filter(item => item.card);
  const totalPages = Math.max(1, Math.ceil(ownedCards.length / SELL_PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageCards = ownedCards.slice(safePage * SELL_PAGE_SIZE, (safePage + 1) * SELL_PAGE_SIZE);
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Vender cartas\n\n` +
      (ownedCards.length
        ? `Selecione uma carta que você possui. Página **${safePage + 1}/${totalPages}**.`
        : 'Você ainda não possui cartas para vender.'),
    ),
  );
  const components = [container];
  if (pageCards.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`pokemon_sell_card:${token}`)
        .setPlaceholder('Escolha uma carta para vender')
        .addOptions(pageCards.map(({ card, quantity }) => ({
          label: card.name.slice(0, 100),
          description: `${quantity}x • ${rarityData(card.rarity).duplicateValue.toLocaleString('pt-BR')} coins por unidade`,
          value: card.key,
        }))),
    ));
  }
  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon_sell_page:${token}:${safePage - 1}`)
      .setLabel('Página anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`pokemon_sell_page:${token}:${safePage + 1}`)
      .setLabel('Próxima página')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`pokemon_collection_back:${token}`)
      .setLabel('Voltar à coleção')
      .setStyle(ButtonStyle.Secondary),
  ));
  return { content: null, components, flags: MessageFlags.IsComponentsV2 };
}

async function buildShowcasePayload({ token, page = 0 }) {
  const totalPages = CARD_DEFS.length;
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const card = CARD_DEFS[safePage];
  const image = await generateCardSheet([card]);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pokemon_vitrine_page:${token}:${safePage - 1}`)
      .setLabel('Carta anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`pokemon_vitrine_page:${token}:${safePage + 1}`)
      .setLabel('Próxima carta')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`pokemon_collection_back:${token}`)
      .setLabel('Voltar à coleção')
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content:
      `## Vitrine Pokémon\n` +
      `Carta **${safePage + 1}/${totalPages}**\n\n` +
      `**${card.name}** — ${rarityData(card.rarity).label}\n` +
      `${card.element} • ${card.description}`,
    files: [new AttachmentBuilder(image, { name: 'carta-vitrine.png' })],
    components: [row],
  };
}

async function sellCards(userId, guildId, cardKey, requestedQuantity = 1) {
  if (!guildId) return { ok: false, reason: 'A venda de cartas só funciona dentro de um servidor.' };
  const card = getCard(cardKey);
  if (!card) return { ok: false, reason: 'Carta não encontrada.' };
  const quantity = requestedQuantity === 'all'
    ? Number.MAX_SAFE_INTEGER
    : Math.max(1, Math.floor(Number(requestedQuantity) || 1));
  return prisma.$transaction(async tx => {
    const owned = await tx.cardCollection.findUnique({
      where: { userId_cardKey: { userId, cardKey } },
    });
    if (!owned) return { ok: false, reason: 'Você não possui essa carta.' };
    const sold = Math.min(owned.quantity, quantity);
    const value = rarityData(card.rarity).duplicateValue * sold;
    if (sold >= owned.quantity) {
      await tx.cardCollection.delete({ where: { userId_cardKey: { userId, cardKey } } });
    } else {
      await tx.cardCollection.update({
        where: { userId_cardKey: { userId, cardKey } },
        data: { quantity: { decrement: sold } },
      });
    }
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: value },
      update: { balance: { increment: value } },
    });
    return { ok: true, sold, value, card };
  });
}

async function buildCardDetailPayload({
  userId,
  guildId,
  card,
  backCustomId = 'pokemon_collection_open',
  backLabel = 'Voltar à coleção',
  sessionToken = null,
}) {
  const owned = await prisma.cardCollection.findUnique({
    where: { userId_cardKey: { userId, cardKey: card.key } },
  });
  const image = await generateCardSheet([card]);
  const quantity = owned?.quantity ?? 0;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(sessionToken
        ? `pokemon_card_sell:${sessionToken}:${card.key}:1`
        : `pokemon_card_sell:${card.key}:1`)
      .setLabel(`Vender 1 • ${rarityData(card.rarity).duplicateValue.toLocaleString('pt-BR')} coins`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(quantity < 1),
    new ButtonBuilder()
      .setCustomId(sessionToken
        ? `pokemon_card_sell:${sessionToken}:${card.key}:all`
        : `pokemon_card_sell:${card.key}:all`)
      .setLabel('Vender todas')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(quantity < 1),
    new ButtonBuilder()
      .setCustomId(backCustomId)
      .setLabel(backLabel)
      .setStyle(ButtonStyle.Secondary),
  );
  return {
    content:
      `## ${card.name}\n` +
      `${rarityData(card.rarity).label} • Você possui **${quantity}**\n` +
      `Venda cada unidade por **${rarityData(card.rarity).duplicateValue.toLocaleString('pt-BR')} coins**.`,
    files: [new AttachmentBuilder(image, { name: 'carta.png' })],
    components: [row],
  };
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

export async function handleFutPackInteraction(interaction) {
  const [action, token] = interaction.customId.split(':');
  const session = getFutPackSession(token);
  if (!session) {
    return interaction.reply({
      content: 'Este pacote FUT expirou. Use `/cartas abrir-fut` para começar outro.',
      ephemeral: true,
    });
  }
  if (session.userId !== interaction.user.id) {
    return interaction.reply({ content: 'Este pacote pertence a outra pessoa.', ephemeral: true });
  }

  if (action === 'fut_pack_open') {
    session.index = 0;
    return interaction.update(buildFutCardPayload({ ...session, token }));
  }

  if (action === 'fut_pack_next') {
    if (session.index >= FUT_TEST_CARDS.length - 1) {
      return interaction.reply({ content: 'Você já revelou todas as cartas deste pacote.', ephemeral: true });
    }
    session.index += 1;
    return interaction.update(buildFutCardPayload({ ...session, token }));
  }

  if (action === 'fut_pack_finish') {
    futPackSessions.delete(token);
    return interaction.update(buildFutPackFinishedPayload());
  }
}

export async function handleCardCollectionInteraction(interaction) {
  const [action, token, value, quantity] = interaction.customId.split(':');
  if (action === 'pokemon_dex_card') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta Pokédex expirou. Use `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta Pokédex pertence a outra pessoa.', ephemeral: true });
    const card = getCard(interaction.values[0]);
    if (!card) return interaction.reply({ content: 'Carta não encontrada.', ephemeral: true });
    return interaction.update(await buildCardDetailPayload({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      card,
      backCustomId: `pokemon_collection_back:${session.token}`,
    }));
  }
  if (action === 'pokemon_dex_page') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta Pokédex expirou. Use `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta Pokédex pertence a outra pessoa.', ephemeral: true });
    session.page = Number(value) || 0;
    return interaction.update(await buildDexPayload(session));
  }

  if (action === 'pokemon_vitrine') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta vitrine expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta vitrine pertence a outra pessoa.', ephemeral: true });
    session.collectionPage = session.page;
    session.page = 0;
    return interaction.update(await buildShowcasePayload({ token: session.token, page: 0 }));
  }

  if (action === 'pokemon_sell') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta área expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta área pertence a outra pessoa.', ephemeral: true });
    session.collectionPage = session.page;
    session.page = 0;
    return interaction.update(await buildSellPayload({
      userId: session.userId,
      guildId: session.guildId,
      token: session.token,
      page: 0,
    }));
  }

  if (action === 'pokemon_collection_back') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta coleção expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta coleção pertence a outra pessoa.', ephemeral: true });
    session.page = session.collectionPage ?? 0;
    return interaction.update(await buildDexPayload(session));
  }

  if (action === 'pokemon_collection_open') {
    const newToken = createDexSession({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      page: 0,
    });
    return interaction.update(await buildDexPayload({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      token: newToken,
      page: 0,
    }));
  }

  if (action === 'pokemon_sell_page') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta área expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta área pertence a outra pessoa.', ephemeral: true });
    session.page = Number(value) || 0;
    return interaction.update(await buildSellPayload({
      userId: session.userId,
      guildId: session.guildId,
      token: session.token,
      page: session.page,
    }));
  }

  if (action === 'pokemon_sell_card') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta área expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta área pertence a outra pessoa.', ephemeral: true });
    const card = getCard(interaction.values[0]);
    if (!card) return interaction.reply({ content: 'Carta não encontrada.', ephemeral: true });
    return interaction.update(await buildCardDetailPayload({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      card,
      backCustomId: `pokemon_sell_page:${session.token}:${session.page}`,
      backLabel: 'Voltar à venda',
      sessionToken: session.token,
    }));
  }

  if (action === 'pokemon_vitrine_page') {
    const session = getDexSession(token, interaction.user.id, interaction.guildId);
    if (!session) return interaction.reply({ content: 'Esta vitrine expirou. Abra `/cartas colecao` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Esta vitrine pertence a outra pessoa.', ephemeral: true });
    session.page = Number(value) || 0;
    return interaction.update(await buildShowcasePayload({ token: session.token, page: session.page }));
  }

  if (action === 'pokemon_card_sell') {
    const hasSessionToken = quantity !== undefined;
    const sessionToken = hasSessionToken ? token : null;
    const cardKey = hasSessionToken ? value : token;
    const sellQuantity = hasSessionToken ? quantity : value;
    const session = sessionToken
      ? getDexSession(sessionToken, interaction.user.id, interaction.guildId)
      : null;
    const card = getCard(cardKey);
    if (!card) return interaction.reply({ content: 'Carta não encontrada.', ephemeral: true });
    if (interaction.guildId == null) return interaction.reply({ content: 'A venda de cartas só funciona dentro de um servidor.', ephemeral: true });
    const result = await sellCards(interaction.user.id, interaction.guildId, card.key, sellQuantity);
    if (!result.ok) return interaction.reply({ content: result.reason, ephemeral: true });
    return interaction.update(await buildCardDetailPayload({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      card,
      backCustomId: session
        ? `pokemon_sell_page:${session.token}:${session.page}`
        : 'pokemon_collection_open',
      backLabel: session ? 'Voltar à venda' : 'Voltar à coleção',
      sessionToken: session?.token ?? null,
    })).then(async () => {
      await interaction.followUp({
        content: `Você vendeu **${result.sold}x ${card.name}** por **${result.value.toLocaleString('pt-BR')} coins**.`,
        ephemeral: true,
      });
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
      .setName('abrir-fut')
      .setDescription('Abra o pacote teste FUT com 4 cartas'))
    .addSubcommand(sub => sub
      .setName('colecao')
      .setDescription('Veja suas cartas e seu progresso'))
    .addSubcommand(sub => sub
      .setName('pokedex')
      .setDescription('Veja as cartas descobertas e as que ainda faltam'))
    .addSubcommand(sub => sub
      .setName('ver')
      .setDescription('Veja os detalhes de uma carta')
      .addStringOption(option => option
        .setName('carta')
        .setDescription('Carta que deseja consultar')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('vender')
      .setDescription('Venda uma carta por coins')
      .addStringOption(option => option
        .setName('carta')
        .setDescription('Chave da carta')
        .setRequired(true))
      .addIntegerOption(option => option
        .setName('quantidade')
        .setDescription('Quantidade para vender')
        .setMinValue(1))),
  name: 'cartas',
  aliases: ['carta', 'cards'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    if (sub === 'colecao') {
      const token = createDexSession({ userId: interaction.user.id, guildId: interaction.guildId });
      return interaction.editReply(await buildDexPayload({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        token,
        page: 0,
      }));
    }

    if (sub === 'pokedex') {
      const token = createDexSession({ userId: interaction.user.id, guildId: interaction.guildId });
      return interaction.editReply(await buildDexPayload({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        token,
        page: 0,
      }));
    }

    if (sub === 'abrir-fut') {
      const token = createFutPackSession({ userId: interaction.user.id, guildId: interaction.guildId });
      return interaction.editReply(buildFutPackCoverPayload(token));
    }

    if (sub === 'ver') {
      const card = getCard(interaction.options.getString('carta'));
      if (!card) return interaction.editReply({ content: 'Carta não encontrada. Use a chave da carta, como `pikachu-thunder-wave`.' });
      return interaction.editReply(await buildCardDetailPayload({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        card,
      }));
    }

    if (sub === 'vender') {
      const card = getCard(interaction.options.getString('carta'));
      if (!card) return interaction.editReply({ content: 'Carta não encontrada. Use a chave da carta, como `pikachu-thunder-wave`.' });
      const result = await sellCards(
        interaction.user.id,
        interaction.guildId,
        card.key,
        interaction.options.getInteger('quantidade') ?? 'all',
      );
      if (!result.ok) return interaction.editReply({ content: result.reason });
      return interaction.editReply({
        content: `Você vendeu **${result.sold}x ${card.name}** por **${result.value.toLocaleString('pt-BR')} coins**.`,
      });
    }

    const count = packCount(interaction.options.getInteger('pacotes'));
    const token = createPackSession({ userId: interaction.user.id, guildId: interaction.guildId, count });
    return interaction.editReply(await buildPackCoverPayload(token, count));
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() ?? 'colecao';
    if (sub === 'colecao' || sub === 'collection') {
      const token = createDexSession({ userId: message.author.id, guildId: message.guildId });
      return message.reply(await buildDexPayload({
        userId: message.author.id,
        guildId: message.guildId,
        token,
        page: 0,
      }));
    }
    if (sub === 'pokedex' || sub === 'dex') {
      const token = createDexSession({ userId: message.author.id, guildId: message.guildId });
      return message.reply(await buildDexPayload({
        userId: message.author.id,
        guildId: message.guildId,
        token,
        page: 0,
      }));
    }
    if (sub === 'abrir-fut' || (sub === 'abrir' && args[1]?.toLowerCase() === 'fut')) {
      const token = createFutPackSession({ userId: message.author.id, guildId: message.guildId });
      return message.reply(buildFutPackCoverPayload(token));
    }
    if (sub === 'abrir' || sub === 'open') {
      const count = packCount(args[1]);
      const token = createPackSession({ userId: message.author.id, guildId: message.guildId, count });
      return message.reply(await buildPackCoverPayload(token, count));
    }
    if (sub === 'vender' || sub === 'sell') {
      const card = getCard(args[1]);
      if (!card) return message.reply('Carta não encontrada. Use a chave da carta, como `pikachu-thunder-wave`.');
      const result = await sellCards(message.author.id, message.guildId, card.key, args[2] ?? 'all');
      if (!result.ok) return message.reply(result.reason);
      return message.reply(`Você vendeu **${result.sold}x ${card.name}** por **${result.value.toLocaleString('pt-BR')} coins**.`);
    }
    const card = getCard(args[1]);
    if (!card) return message.reply('Use `savage cartas abrir`, `savage cartas colecao`, `savage cartas ver <chave>` ou `savage cartas vender <chave> [quantidade]`.');
    return message.reply(await buildCardDetailPayload({
      userId: message.author.id,
      guildId: message.guildId,
      card,
    }));
  },
};
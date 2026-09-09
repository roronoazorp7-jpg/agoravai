import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { generateUnoCard, unoColorValue } from './unoVisuals.js';

const MAX_PLAYERS = 10;
const STARTING_HAND_SIZE = 7;
const LOBBY_TTL = 10 * 60 * 1000;
const GAME_TTL = 45 * 60 * 1000;

export const UNO_COLORS = Object.freeze({
  red: { label: 'Vermelho', emoji: '🔴' },
  yellow: { label: 'Amarelo', emoji: '🟡' },
  green: { label: 'Verde', emoji: '🟢' },
  blue: { label: 'Azul', emoji: '🔵' },
});

const games = new Map();
let nextCardId = 1;

function gameId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function nextId() {
  return `c${nextCardId++}`;
}

function shuffle(cards) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

function buildDeck() {
  const deck = [];
  for (const color of Object.keys(UNO_COLORS)) {
    deck.push({ id: nextId(), color, kind: 'number', value: 0 });
    for (let value = 1; value <= 9; value += 1) {
      deck.push({ id: nextId(), color, kind: 'number', value });
      deck.push({ id: nextId(), color, kind: 'number', value });
    }
    for (const kind of ['skip', 'reverse', 'draw2']) {
      deck.push({ id: nextId(), color, kind });
      deck.push({ id: nextId(), color, kind });
    }
  }
  for (let index = 0; index < 4; index += 1) {
    deck.push({ id: nextId(), color: 'wild', kind: 'wild' });
    deck.push({ id: nextId(), color: 'wild', kind: 'wild4' });
  }
  return shuffle(deck);
}

function cardLabel(card) {
  const color = card.color === 'wild' ? 'Preta' : UNO_COLORS[card.color].label;
  const symbol = card.kind === 'number'
    ? card.value
    : card.kind === 'skip'
      ? 'Pular'
      : card.kind === 'reverse'
        ? 'Inverter'
        : card.kind === 'draw2'
          ? '+2'
          : card.kind === 'wild4'
            ? 'Coringa +4'
            : 'Coringa';
  return `${color} ${symbol}`;
}

function cardDescription(card) {
  if (card.kind === 'number') return `Número ${card.value}`;
  if (card.kind === 'skip') return 'Pula o próximo jogador';
  if (card.kind === 'reverse') return 'Inverte o sentido da rodada';
  if (card.kind === 'draw2') return 'Próximo compra 2 e perde a vez';
  if (card.kind === 'wild4') return 'Escolha a cor; próximo compra 4';
  return 'Escolha a próxima cor';
}

function playerName(player) {
  return player.name || `<@${player.id}>`;
}

function currentPlayer(game) {
  return game.players[game.turnIndex];
}

function nextIndex(game, steps = 1) {
  const total = game.players.length;
  return (game.turnIndex + game.direction * steps + total * 10) % total;
}

function drawOne(game) {
  if (!game.deck.length) {
    const top = game.discard.pop();
    game.deck = shuffle(game.discard.splice(0));
    if (top) game.discard.push(top);
  }
  return game.deck.pop() ?? null;
}

function drawMany(game, player, amount) {
  for (let index = 0; index < amount; index += 1) {
    const card = drawOne(game);
    if (card) player.hand.push(card);
  }
}

function sameSymbol(left, right) {
  if (!left || !right || left.color === 'wild' || right.color === 'wild') return false;
  if (left.kind !== right.kind) return false;
  return left.kind !== 'number' || left.value === right.value;
}

function canPlayCard(card, game, player = currentPlayer(game)) {
  const top = game.discard.at(-1);
  if (!card || !top) return false;
  if (card.kind === 'wild4') {
    const hasCurrentColor = player.hand.some(candidate =>
      candidate.id !== card.id && candidate.color === game.activeColor);
    if (hasCurrentColor) return false;
  }
  return card.color === 'wild'
    || card.color === game.activeColor
    || sameSymbol(card, top);
}

function playableCards(game, player = currentPlayer(game)) {
  return player.hand.filter(card => canPlayCard(card, game, player));
}

function touch(game) {
  game.updatedAt = Date.now();
}

function scheduleExpiry(game) {
  const ttl = game.status === 'playing' ? GAME_TTL : LOBBY_TTL;
  setTimeout(() => {
    const current = games.get(game.id);
    if (current !== game || current.status === 'done') return;
    if (Date.now() - game.updatedAt < ttl) return scheduleExpiry(game);
    games.delete(game.id);
  }, ttl + 1000);
}

function createGame(ctx) {
  const host = {
    id: ctx.user?.id ?? ctx.author?.id,
    name: ctx.member?.displayName ?? ctx.user?.username ?? ctx.author?.username ?? 'Jogador',
  };
  const game = {
    id: gameId(),
    guildId: ctx.guildId,
    channelId: ctx.channelId ?? ctx.channel?.id,
    messageId: null,
    hostId: host.id,
    players: [host],
    status: 'lobby',
    deck: [],
    discard: [],
    turnIndex: 0,
    direction: 1,
    activeColor: null,
    pendingWild: null,
    updatedAt: Date.now(),
    notice: '',
  };
  games.set(game.id, game);
  scheduleExpiry(game);
  return game;
}

function v2Notice(text, ephemeral = true) {
  const container = new ContainerBuilder()
    .setAccentColor(0xed1c24)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
  };
}

function lobbyPayload(game) {
  const playerLines = game.players.map((player, index) =>
    `${index === 0 ? '👑' : '🎴'} ${index + 1}. ${playerName(player)}`).join('\n');
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🎴 UNO TCG'))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Sala de espera**\nCriada por **${playerName(game.players[0])}**\n\n` +
      `**Jogadores (${game.players.length}/${MAX_PLAYERS})**\n${playerLines}\n\n` +
      (game.players.length >= 2
        ? 'A mesa está pronta. O anfitrião pode começar.'
        : 'Entre na mesa para jogar. São necessários pelo menos 2 jogadores.'),
    ));

  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`uno_join:${game.id}`)
          .setLabel('Entrar na mesa')
          .setEmoji('🎴')
          .setStyle(ButtonStyle.Success)
          .setDisabled(game.players.length >= MAX_PLAYERS),
        new ButtonBuilder()
          .setCustomId(`uno_start:${game.id}`)
          .setLabel('Começar partida')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(game.players.length < 2),
        new ButtonBuilder()
          .setCustomId(`uno_cancel:${game.id}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

function startGame(game) {
  game.status = 'playing';
  game.deck = buildDeck();
  game.discard = [];
  for (const player of game.players) {
    player.hand = [];
    for (let index = 0; index < STARTING_HAND_SIZE; index += 1) {
      player.hand.push(drawOne(game));
    }
  }

  let first = drawOne(game);
  while (first?.color === 'wild') {
    game.deck.unshift(first);
    first = drawOne(game);
  }
  game.discard.push(first);
  game.activeColor = first?.color ?? 'red';
  game.turnIndex = 0;
  game.direction = 1;
  touch(game);
}

function boardText(game, notice = '') {
  const top = game.discard.at(-1);
  const turn = currentPlayer(game);
  const counts = game.players.map(player =>
    `${playerName(player)} **${player.hand.length}**`).join('  ·  ');
  const direction = game.direction === 1 ? 'horário' : 'anti-horário';
  const pending = game.pendingWild
    ? '\n🌈 O jogador atual está escolhendo a próxima cor.'
    : '';

  return [
    `## 🎴 UNO TCG`,
    `**Carta na mesa:** ${cardLabel(top)}`,
    `**Cor ativa:** ${UNO_COLORS[game.activeColor]?.emoji ?? '⚫'} ${UNO_COLORS[game.activeColor]?.label ?? 'Preta'}`,
    `**Vez:** ${playerName(turn)}  ·  sentido ${direction}`,
    '',
    `**Cartas na mesa**\n${counts}`,
    '',
    notice || game.notice || `Clique em **Minha mão** para jogar quando for sua vez.${pending}`,
  ].join('\n');
}

async function boardPayload(game, notice = '') {
  const top = game.discard.at(-1);
  const filename = `uno-${game.id}-${top.id}.png`;
  const image = await generateUnoCard(top);
  const container = new ContainerBuilder()
    .setAccentColor(unoColorValue(game.activeColor))
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${filename}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(boardText(game, notice)))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      'A mão de cada jogador é privada. Jogue por cor, número ou símbolo. ' +
      'O Coringa +4 só pode ser usado quando você não tiver a cor ativa.',
    ));

  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`uno_hand:${game.id}`)
          .setLabel('Minha mão')
          .setEmoji('🃏')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`uno_call:${game.id}`)
          .setLabel('UNO!')
          .setEmoji('📣')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`uno_rules:${game.id}`)
          .setLabel('Regras')
          .setEmoji('📖')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    files: [new AttachmentBuilder(image, { name: filename })],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function winnerPayload(game, winner, card) {
  const filename = `uno-${game.id}-winner-${card.id}.png`;
  const image = await generateUnoCard(card);
  const container = new ContainerBuilder()
    .setAccentColor(0xf1c40f)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${filename}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🏆 ${playerName(winner)} venceu o UNO!\n\n` +
      `A última carta foi **${cardLabel(card)}**.\n` +
      'A mesa foi encerrada. Inicie outra partida para jogar novamente.',
    ));
  return {
    components: [container],
    files: [new AttachmentBuilder(image, { name: filename })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function handOptions(game, player) {
  const options = playableCards(game, player).slice(0, 24).map(card =>
    new StringSelectMenuOptionBuilder()
      .setLabel(cardLabel(card).slice(0, 100))
      .setDescription(cardDescription(card).slice(0, 100))
      .setValue(card.id));
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel('Comprar uma carta')
      .setDescription('Compre uma carta; se ela não servir, sua vez passa')
      .setValue('draw'),
  );
  return options.slice(0, 25);
}

function handPayload(game, player, notice = '') {
  const isTurn = game.status === 'playing'
    && !game.pendingWild
    && currentPlayer(game)?.id === player.id;
  const hand = player.hand ?? [];
  const cards = hand.length
    ? hand.map(card => `• ${cardLabel(card)}`).join('\n')
    : 'Sem cartas';
  const container = new ContainerBuilder()
    .setAccentColor(unoColorValue(game.activeColor ?? 'wild'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🃏 Sua mão — ${hand.length} carta(s)\n` +
      `${isTurn ? '🟢 **É a sua vez.**' : `⏳ Vez de **${playerName(currentPlayer(game))}**.`}\n\n` +
      cards +
      (notice ? `\n\n${notice}` : ''),
    ))
    .addSeparatorComponents(new SeparatorBuilder());

  const components = [container];
  if (isTurn) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`uno_hand:${game.id}`)
        .setPlaceholder('Escolha uma carta para jogar')
        .addOptions(handOptions(game, player)),
    ));
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      'Abra sua mão novamente quando chegar a sua vez.',
    ));
  }
  return {
    components,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function colorPayload(game) {
  const container = new ContainerBuilder()
    .setAccentColor(unoColorValue('wild'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## 🌈 Escolha a próxima cor\n\nA cor escolhida será usada para validar a próxima jogada.',
    ));
  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`uno_hand_color:${game.id}`)
          .setPlaceholder('Escolha uma cor')
          .addOptions(Object.entries(UNO_COLORS).map(([value, color]) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(color.label)
              .setEmoji(color.emoji)
              .setValue(value))),
      ),
    ],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function rulesPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## 📖 Como jogar UNO TCG\n\n' +
      '• Jogue uma carta da mesma **cor**, **número** ou **símbolo** da carta na mesa.\n' +
      '• Se não quiser ou não puder jogar, compre uma carta. Se ela servir, você pode jogá-la.\n' +
      '• **Pular** passa a vez do próximo jogador.\n' +
      '• **Inverter** muda o sentido da rodada; com 2 jogadores, funciona como Pular.\n' +
      '• **+2** faz o próximo jogador comprar 2 e perder a vez.\n' +
      '• **Coringa** permite escolher a próxima cor.\n' +
      '• **Coringa +4** só pode ser jogado sem nenhuma carta da cor ativa.\n' +
      '• Quando ficar com uma carta, clique em **UNO!**. O primeiro a zerar a mão vence.',
    ));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function finishGame(game, winner) {
  game.status = 'done';
  game.winner = winner;
  touch(game);
  games.delete(game.id);
}

function advanceAfterCard(game, card) {
  if (card.kind === 'reverse') {
    if (game.players.length > 2) game.direction *= -1;
    game.turnIndex = nextIndex(game, 1);
    if (game.players.length === 2) game.turnIndex = nextIndex(game, 1);
    return;
  }
  if (card.kind === 'skip') {
    game.turnIndex = nextIndex(game, 2);
    return;
  }
  if (card.kind === 'draw2' || card.kind === 'wild4') {
    const target = game.players[nextIndex(game, 1)];
    drawMany(game, target, card.kind === 'draw2' ? 2 : 4);
    game.turnIndex = nextIndex(game, 2);
    return;
  }
  game.turnIndex = nextIndex(game, 1);
}

function applyCard(game, player, card, chosenColor = null) {
  const index = player.hand.findIndex(candidate => candidate.id === card.id);
  if (index < 0 || !canPlayCard(card, game, player)) return { error: 'Carta inválida.' };
  player.hand.splice(index, 1);
  game.discard.push(card);
  game.activeColor = card.color === 'wild' ? chosenColor : card.color;
  if (!player.hand.length) {
    finishGame(game, player);
    return { winner: player, card };
  }
  advanceAfterCard(game, card);
  touch(game);
  return { card };
}

function gameForInteraction(interaction, id) {
  const game = games.get(id);
  if (!game) return null;
  if (game.guildId !== interaction.guildId || game.channelId !== interaction.channelId) return null;
  return game;
}

async function editPublicPayload(interaction, game, payload) {
  const message = interaction.message?.flags?.has?.(MessageFlags.Ephemeral)
    ? null
    : interaction.message?.id === game.messageId
      ? interaction.message
      : null;
  if (message) return message.edit(payload);

  const channel = interaction.client.channels.cache.get(game.channelId)
    ?? await interaction.client.channels.fetch(game.channelId).catch(() => null);
  const publicMessage = game.messageId
    ? await channel?.messages.fetch(game.messageId).catch(() => null)
    : null;
  if (publicMessage) return publicMessage.edit(payload);
  return null;
}

async function editPublicBoard(interaction, game, notice = '') {
  return editPublicPayload(interaction, game, await boardPayload(game, notice));
}

export async function startUno(ctx, send) {
  if (!ctx.guildId) return send(v2Notice('❌ O UNO só funciona dentro de um servidor.', false));
  const channelId = ctx.channelId ?? ctx.channel?.id;
  const active = [...games.values()].find(game =>
    game.guildId === ctx.guildId && game.channelId === channelId);
  if (active) return send(v2Notice('❌ Já existe uma mesa de UNO ativa neste canal.', false));

  const game = createGame(ctx);
  const message = await send(lobbyPayload(game));
  if (message?.id) game.messageId = message.id;
  return message;
}

export async function handleUnoInteraction(interaction) {
  const [action, id] = interaction.customId.split(':');
  const game = gameForInteraction(interaction, id);
  if (!game) return interaction.reply(v2Notice('❌ Esta mesa de UNO não está mais ativa.'));

  const userId = interaction.user.id;
  const player = game.players.find(candidate => candidate.id === userId);

  if (action === 'uno_rules') {
    return interaction.reply(rulesPayload());
  }

  if (action === 'uno_join') {
    if (game.status !== 'lobby') return interaction.reply(v2Notice('❌ A partida já começou.'));
    if (player) return interaction.reply(v2Notice('✅ Você já está nesta mesa.'));
    if (game.players.length >= MAX_PLAYERS) return interaction.reply(v2Notice('❌ A mesa está cheia.'));
    game.players.push({ id: userId, name: interaction.member?.displayName ?? interaction.user.username });
    touch(game);
    game.messageId = interaction.message.id;
    return interaction.update(lobbyPayload(game));
  }

  if (action === 'uno_start') {
    if (game.hostId !== userId) return interaction.reply(v2Notice('❌ Só o anfitrião pode começar.'));
    if (game.players.length < 2) return interaction.reply(v2Notice('❌ Entre com pelo menos mais uma pessoa.'));
    startGame(game);
    game.messageId = interaction.message.id;
    await interaction.deferUpdate();
    return interaction.editReply(await boardPayload(game, 'A partida começou. Abra sua mão para jogar.'));
  }

  if (action === 'uno_cancel') {
    if (game.hostId !== userId) return interaction.reply(v2Notice('❌ Só o anfitrião pode cancelar.'));
    games.delete(game.id);
    return interaction.update({
      components: [
        new ContainerBuilder()
          .setAccentColor(0xed1c24)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛑 Partida de UNO cancelada')),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  }

  if (game.status !== 'playing') return interaction.reply(v2Notice('❌ Esta partida já terminou.'));
  if (!player) return interaction.reply(v2Notice('❌ Você não participa desta partida.'));

  if (action === 'uno_hand') {
    if (interaction.isButton()) return interaction.reply(handPayload(game, player));

    if (player.id !== currentPlayer(game).id) {
      return interaction.update(handPayload(game, player, `⏳ Aguarde a vez de **${playerName(currentPlayer(game))}**.`));
    }
    if (game.pendingWild) return interaction.update(colorPayload(game));

    const selected = interaction.values?.[0];
    if (selected === 'draw') {
      const card = drawOne(game);
      if (card) player.hand.push(card);
      const canPlay = card && canPlayCard(card, game, player);
      if (!canPlay) {
        game.turnIndex = nextIndex(game, 1);
        touch(game);
        const privatePayload = handPayload(game, player, 'Você comprou e passou a vez.');
        await interaction.update(privatePayload);
        await editPublicBoard(interaction, game, `🃏 ${playerName(player)} comprou uma carta e passou a vez.`);
        return;
      }
      touch(game);
      const privatePayload = handPayload(
        game,
        player,
        `Você comprou **${cardLabel(card)}** e pode jogar.`,
      );
      await interaction.update(privatePayload);
      await editPublicBoard(interaction, game, `🃏 Você comprou **${cardLabel(card)}**. Ela pode ser jogada.`);
      return;
    }

    const card = player.hand.find(candidate => candidate.id === selected);
    if (!card) return interaction.reply(v2Notice('❌ Essa carta não está na sua mão.'));
    if (!canPlayCard(card, game, player)) return interaction.reply(v2Notice('❌ Essa carta não combina com a mesa.'));

    if (card.color === 'wild') {
      player.hand.splice(player.hand.findIndex(candidate => candidate.id === card.id), 1);
      game.discard.push(card);
      game.pendingWild = { playerId: player.id, cardId: card.id };
      touch(game);
      await interaction.update(colorPayload(game));
      await editPublicBoard(interaction, game, `🌈 ${playerName(player)} jogou um coringa e está escolhendo a cor.`);
      return;
    }

    const result = applyCard(game, player, card);
    if (result.winner) {
      await interaction.update(v2Notice(
        `🏆 **${playerName(player)} venceu o UNO!** A mesa foi encerrada.`,
      ));
      const payload = await winnerPayload(game, player, card);
      await editPublicPayload(interaction, game, payload);
      return;
    }
    const privatePayload = handPayload(game, player, `Você jogou **${cardLabel(card)}**.`);
    await interaction.update(privatePayload);
    await editPublicBoard(interaction, game, `✅ ${playerName(player)} jogou **${cardLabel(card)}**.`);
    return;
  }

  if (action === 'uno_hand_color') {
    if (player.id !== currentPlayer(game).id) return interaction.reply(v2Notice('❌ Essa escolha não é sua.'));
    const pending = game.pendingWild;
    const chosenColor = interaction.values?.[0];
    if (!pending || pending.playerId !== userId || !UNO_COLORS[chosenColor]) {
      return interaction.reply(v2Notice('❌ A escolha de cor expirou.'));
    }

    game.pendingWild = null;
    game.activeColor = chosenColor;
    const card = game.discard.at(-1);
    if (!player.hand.length) {
      finishGame(game, player);
      await interaction.update(v2Notice(
        `🏆 **${playerName(player)} venceu o UNO!** A mesa foi encerrada.`,
      ));
      const payload = await winnerPayload(game, player, card);
      await editPublicPayload(interaction, game, payload);
      return;
    }

    advanceAfterCard(game, card);
    touch(game);
    const notice = `🌈 ${playerName(player)} escolheu ${UNO_COLORS[chosenColor].emoji} **${UNO_COLORS[chosenColor].label}**.`;
    await interaction.update(handPayload(game, player, notice));
    await editPublicBoard(interaction, game, notice);
    return;
  }

  if (action === 'uno_call') {
    if (player.id !== currentPlayer(game).id) {
      return interaction.reply(v2Notice(`⏳ Aguarde a vez de **${playerName(currentPlayer(game))}**.`));
    }
    if (player.hand.length !== 1) {
      return interaction.reply(v2Notice('📣 O botão UNO só pode ser usado com uma carta na mão.'));
    }
    game.notice = `📣 **${playerName(player)}** gritou UNO!`;
    touch(game);
    return interaction.update(await boardPayload(game));
  }

  return interaction.reply(v2Notice('❌ Ação de UNO desconhecida.'));
}
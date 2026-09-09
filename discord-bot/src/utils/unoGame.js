import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { generateUnoCard } from './unoVisuals.js';

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
  const colors = Object.keys(UNO_COLORS);

  for (const color of colors) {
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
  if (card.kind === 'reverse') return 'Inverte a direção';
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
  return (game.turnIndex + (game.direction * steps) + total * 10) % total;
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

function scheduleExpiry(game) {
  const expiresAt = game.started ? GAME_TTL : LOBBY_TTL;
  setTimeout(() => {
    const current = games.get(game.id);
    if (current !== game || current.status === 'done') return;
    if (Date.now() - game.updatedAt < expiresAt) {
      scheduleExpiry(game);
      return;
    }
    games.delete(game.id);
  }, expiresAt + 1000);
}

function createGame(ctx) {
  const id = gameId();
  const host = {
    id: ctx.user?.id ?? ctx.author?.id,
    name: ctx.member?.displayName ?? ctx.user?.username ?? ctx.author?.username ?? 'Jogador',
  };
  const game = {
    id,
    guildId: ctx.guildId,
    channelId: ctx.channelId ?? ctx.channel?.id,
    hostId: host.id,
    players: [host],
    status: 'lobby',
    deck: [],
    discard: [],
    turnIndex: 0,
    direction: 1,
    activeColor: null,
    updatedAt: Date.now(),
    notice: '',
  };
  games.set(id, game);
  scheduleExpiry(game);
  return game;
}

function touch(game) {
  game.updatedAt = Date.now();
}

function lobbyPayload(game) {
  const playerLines = game.players.map((player, index) =>
    `${index === 0 ? '👑' : '🎴'} ${index + 1}. ${playerName(player)}`).join('\n');
  return {
    content: [
      '## 🎴 UNO — aguardando jogadores',
      `Criado por **${playerName(game.players[0])}**`,
      '',
      `**Jogadores (${game.players.length}/${MAX_PLAYERS}):**`,
      playerLines,
      '',
      game.players.length >= 2
        ? 'A partida pode começar. O anfitrião deve clicar em **Começar**.'
        : 'Mínimo de 2 jogadores. Clique em **Entrar** para participar.',
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`uno_join:${game.id}`)
          .setLabel('Entrar')
          .setEmoji('🎴')
          .setStyle(ButtonStyle.Success)
          .setDisabled(game.players.length >= MAX_PLAYERS),
        new ButtonBuilder()
          .setCustomId(`uno_start:${game.id}`)
          .setLabel('Começar')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(game.players.length < 2),
        new ButtonBuilder()
          .setCustomId(`uno_cancel:${game.id}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function startGame(game) {
  game.status = 'playing';
  game.deck = buildDeck();
  game.discard = [];
  game.players.forEach(player => {
    player.hand = [];
    for (let index = 0; index < STARTING_HAND_SIZE; index += 1) {
      player.hand.push(drawOne(game));
    }
  });

  let first = drawOne(game);
  while (first && first.color === 'wild') {
    game.deck.unshift(first);
    first = drawOne(game);
  }
  game.discard.push(first);
  game.activeColor = first?.color ?? 'red';
  game.turnIndex = 0;
  game.direction = 1;
  touch(game);
}

function runningContent(game, notice = '') {
  const top = game.discard.at(-1);
  const turn = currentPlayer(game);
  const counts = game.players
    .map(player => `${playerName(player)}: **${player.hand.length}**`)
    .join(' · ');
  const direction = game.direction === 1 ? 'horário' : 'anti-horário';

  return [
    '## 🎴 UNO',
    `Carta na mesa: **${cardLabel(top)}**`,
    `Cor ativa: ${UNO_COLORS[game.activeColor]?.emoji ?? '⚫'} **${UNO_COLORS[game.activeColor]?.label ?? 'Preta'}**`,
    `Vez de **${playerName(turn)}** · sentido ${direction}`,
    '',
    `**Cartas:** ${counts}`,
    notice || game.notice || 'Use o menu para jogar uma carta válida ou comprar.',
  ].join('\n');
}

async function runningPayload(game, notice = '') {
  const top = game.discard.at(-1);
  const image = await generateUnoCard(top);
  const fileName = `uno-${game.id}-${top.id}.png`;
  const current = currentPlayer(game);
  const playable = playableCards(game);
  const options = playable.slice(0, 24).map(card =>
    new StringSelectMenuOptionBuilder()
      .setLabel(cardLabel(card).slice(0, 100))
      .setDescription(cardDescription(card).slice(0, 100))
      .setValue(card.id),
  );

  if (!options.length) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Comprar uma carta')
        .setDescription('Compre uma carta e passe a vez se ela não servir')
        .setValue('draw'),
    );
  }

  const handText = current.hand.length
    ? current.hand.map(card => `\`${cardLabel(card)}\``).join(' · ')
    : 'sem cartas';

  return {
    content: `${runningContent(game, notice)}\n\n**Mão de ${playerName(current)}:** ${handText}`,
    files: [new AttachmentBuilder(image, { name: fileName })],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`uno_play:${game.id}`)
          .setPlaceholder(`Jogar carta — vez de ${playerName(current)}`.slice(0, 150))
          .addOptions(options),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`uno_draw:${game.id}`)
          .setLabel('Comprar carta')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`uno_call:${game.id}`)
          .setLabel('UNO!')
          .setEmoji('📣')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function colorPayload(game) {
  return {
    content: [
      runningContent(game),
      '',
      `**${playerName(currentPlayer(game))}**, escolha a cor que continuará na mesa:`,
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`uno_color:${game.id}`)
          .setPlaceholder('Escolha a cor')
          .addOptions(Object.entries(UNO_COLORS).map(([value, color]) => (
            new StringSelectMenuOptionBuilder()
              .setLabel(color.label)
              .setEmoji(color.emoji)
              .setValue(value)
          ))),
      ),
    ],
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
    const targetIndex = nextIndex(game, 1);
    const target = game.players[targetIndex];
    drawMany(game, target, card.kind === 'draw2' ? 2 : 4);
    game.turnIndex = nextIndex(game, 2);
    return;
  }
  game.turnIndex = nextIndex(game, 1);
}

function applyCard(game, player, card, chosenColor = null) {
  const index = player.hand.findIndex(candidate => candidate.id === card.id);
  if (index < 0 || !canPlayCard(card, game, player)) return { error: 'Essa carta não pode ser jogada agora.' };

  player.hand.splice(index, 1);
  game.discard.push(card);
  game.activeColor = card.color === 'wild' ? chosenColor : card.color;

  if (!player.hand.length) {
    const winner = player;
    finishGame(game, winner);
    return { winner };
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

function replyExpired(interaction) {
  return interaction.reply({
    content: '❌ Esta partida de UNO não está mais ativa.',
    ephemeral: true,
  });
}

export async function startUno(ctx, send) {
  if (!ctx.guildId) return send({ content: '❌ O UNO só funciona dentro de um servidor.' });
  const channelId = ctx.channelId ?? ctx.channel?.id;
  const activeInChannel = [...games.values()].find(game =>
    game.guildId === ctx.guildId && game.channelId === channelId);
  if (activeInChannel) {
    return send({ content: '❌ Já existe uma partida de UNO ativa neste canal.' });
  }

  const game = createGame(ctx);
  return send(lobbyPayload(game));
}

export async function handleUnoInteraction(interaction) {
  const [action, id] = interaction.customId.split(':');
  const game = gameForInteraction(interaction, id);
  if (!game) return replyExpired(interaction);
  const userId = interaction.user.id;
  const player = game.players.find(candidate => candidate.id === userId);

  if (action === 'uno_join') {
    if (game.status !== 'lobby') return interaction.reply({ content: '❌ A partida já começou.', ephemeral: true });
    if (player) return interaction.reply({ content: '✅ Você já está nesta partida.', ephemeral: true });
    if (game.players.length >= MAX_PLAYERS) return interaction.reply({ content: '❌ A partida está cheia.', ephemeral: true });
    game.players.push({
      id: userId,
      name: interaction.member?.displayName ?? interaction.user.username,
    });
    touch(game);
    return interaction.update(lobbyPayload(game));
  }

  if (action === 'uno_start') {
    if (game.hostId !== userId) return interaction.reply({ content: '❌ Somente quem criou a partida pode começar.', ephemeral: true });
    if (game.players.length < 2) return interaction.reply({ content: '❌ Entre com pelo menos mais uma pessoa.', ephemeral: true });
    startGame(game);
    return interaction.update(await runningPayload(game, 'A partida começou!'));
  }

  if (action === 'uno_cancel') {
    if (game.hostId !== userId) return interaction.reply({ content: '❌ Somente quem criou a partida pode cancelar.', ephemeral: true });
    games.delete(game.id);
    return interaction.update({ content: '🛑 Partida de UNO cancelada.', components: [] });
  }

  if (game.status !== 'playing') return interaction.reply({ content: '❌ Esta partida já terminou.', ephemeral: true });
  if (!player) return interaction.reply({ content: '❌ Você não participa desta partida.', ephemeral: true });
  if (player.id !== currentPlayer(game).id) {
    return interaction.reply({ content: `⏳ Aguarde a vez de **${playerName(currentPlayer(game))}**.`, ephemeral: true });
  }

  if (action === 'uno_call') {
    if (player.hand.length !== 1) {
      return interaction.reply({ content: '📣 Você só pode gritar UNO quando estiver com uma carta.', ephemeral: true });
    }
    game.notice = `📣 **${playerName(player)}** gritou UNO!`;
    touch(game);
    return interaction.update(await runningPayload(game));
  }

  if (action === 'uno_draw') {
    const card = drawOne(game);
    if (card) player.hand.push(card);
    const canPlay = card && canPlayCard(card, game, player);
    if (!canPlay) {
      game.turnIndex = nextIndex(game, 1);
      touch(game);
      return interaction.update(await runningPayload(game, `🃏 ${playerName(player)} comprou uma carta e passou a vez.`));
    }
    touch(game);
    return interaction.update(await runningPayload(game, `🃏 ${playerName(player)} comprou **${cardLabel(card)}** e pode jogá-la.`));
  }

  if (action === 'uno_play') {
    const selected = interaction.values?.[0];
    if (selected === 'draw') {
      const card = drawOne(game);
      if (card) player.hand.push(card);
      if (!card || !canPlayCard(card, game, player)) game.turnIndex = nextIndex(game, 1);
      touch(game);
      return interaction.update(await runningPayload(
        game,
        card && canPlayCard(card, game, player)
          ? `🃏 Você comprou **${cardLabel(card)}** e pode jogá-la.`
          : '🃏 Você comprou uma carta e passou a vez.',
      ));
    }

    const card = player.hand.find(candidate => candidate.id === selected);
    if (!card) return interaction.reply({ content: '❌ Essa carta não está na sua mão.', ephemeral: true });
    if (!canPlayCard(card, game, player)) {
      return interaction.reply({ content: '❌ Essa carta não combina com a carta da mesa.', ephemeral: true });
    }
    if (card.color === 'wild') {
      player.hand.splice(player.hand.findIndex(candidate => candidate.id === card.id), 1);
      game.discard.push(card);
      game.pendingWild = { playerId: player.id, cardId: card.id };
      touch(game);
      return interaction.update(colorPayload(game));
    }

    const result = applyCard(game, player, card);
    if (result.winner) {
      return interaction.update({
        content: `🏆 **${playerName(player)} venceu o UNO!**\nA última carta foi **${cardLabel(card)}**.`,
        components: [],
      });
    }
    return interaction.update(await runningPayload(game, `✅ ${playerName(player)} jogou **${cardLabel(card)}**.`));
  }

  if (action === 'uno_color') {
    const pending = game.pendingWild;
    if (!pending || pending.playerId !== userId) return interaction.reply({ content: '❌ Essa escolha de cor não é sua.', ephemeral: true });
    const chosenColor = interaction.values?.[0];
    if (!UNO_COLORS[chosenColor]) return interaction.reply({ content: '❌ Cor inválida.', ephemeral: true });
    game.pendingWild = null;
    game.activeColor = chosenColor;
    const playedCard = game.discard.at(-1);
    if (!player.hand.length) {
      finishGame(game, player);
      return interaction.update({
        content: `🏆 **${playerName(player)} venceu o UNO!**\nA última carta foi **${cardLabel(playedCard)}**.`,
        components: [],
      });
    }
    advanceAfterCard(game, playedCard);
    touch(game);
    return interaction.update(await runningPayload(
      game,
      `🌈 ${playerName(player)} escolheu ${UNO_COLORS[chosenColor].emoji} **${UNO_COLORS[chosenColor].label}**.`,
    ));
  }

  return interaction.reply({ content: '❌ Ação de UNO desconhecida.', ephemeral: true });
}
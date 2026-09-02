import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import prisma from '../database/client.js';
import { getEmoji } from './emojiManager.js';
import { generateDarkMinesGrid } from './darkMinesGrid.js';
import { generateBlackjackCard } from './economyCards.js';
import { spendCoins, totalCoins } from './economyFunds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '../../public/games');

const COIN = () => getEmoji('futecoins');

// ─── In-memory game states ────────────────────────────────────────────────────
export const blackjackGames = new Map();
export const minesGames     = new Map();

// ─── Shared helpers ───────────────────────────────────────────────────────────
async function getEco(userId, guildId) {
  return prisma.economy.upsert({
    where:  { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}
async function deductBet(userId, guildId, bet) {
  const result = await spendCoins(prisma, { userId, guildId, amount: bet });
  if (!result.ok) throw new Error('Saldo insuficiente para essa aposta.');
}
async function addWin(userId, guildId, amount) {
  await prisma.economy.update({
    where: { userId_guildId: { userId, guildId } },
    data:  { balance: { increment: amount } },
  });
}

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return n.toLocaleString('pt-BR');
}

function memberInfo(interaction) {
  return {
    name:   interaction.member?.displayName ?? interaction.user?.username ?? interaction.author?.username ?? 'Jogador',
    avatar: interaction.member?.displayAvatarURL({ size: 64 })
      ?? interaction.user?.displayAvatarURL({ size: 64 })
      ?? interaction.author?.displayAvatarURL({ size: 64 })
      ?? null,
  };
}

// ─── V2 payload ───────────────────────────────────────────────────────────────

function v2Payload(container, files, ...extras) {
  const payload = { components: [container, ...extras], flags: MessageFlags.IsComponentsV2 };
  if (files && files.length > 0) payload.files = files;
  return payload;
}

// ─── Blackjack canvas image (dynamic — unique filename evita cache do Discord) ─

async function buildBJAttachment(state, hideDealer) {
  const pTotal  = handTotal(state.player);
  const dTotal  = handTotal(state.dealer);
  const payout  = state.won ? state.bet * 2 : state.tie ? state.bet : 0;

  const buf = await generateBlackjackCard({
    playerCards: state.player,
    dealerCards:  state.dealer,
    pTotal, dTotal,
    won:    state.won,
    tie:    state.tie,
    bust:   state.bust,
    bet:    state.bet,
    payout,
    hideDealer,
  });

  // Filename único por update — impede Discord de exibir a imagem cacheada
  const fname = `bj_${state.userId}_${Date.now()}.png`;
  return new AttachmentBuilder(buf, { name: fname });
}

// ══════════════════════════════════════════════════════════════════════════════
// BLACKJACK
// ══════════════════════════════════════════════════════════════════════════════

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck()  { return SUITS.flatMap(s => RANKS.map(r => ({ rank: r, suit: s }))); }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function cardValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank);
}
function handTotal(cards) {
  let total = cards.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces  = cards.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function fmtCard(c) { return `\`${c.rank}${c.suit}\``; }
function fmtHand(cards) { return cards.map(fmtCard).join(' '); }

async function buildBJContainer(state, hideDealer = false) {
  const attachment = await buildBJAttachment(state, hideDealer);
  const fname      = attachment.name;

  const container = new ContainerBuilder();
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(`attachment://${fname}`),
    ),
  );

  return { container, files: [attachment] };
}

function buildBJComponents(state) {
  if (state.status !== 'playing') return [];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bj_hit_${state.userId}`)
        .setLabel('Pedir Carta')
        .setEmoji('🎴')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`bj_stand_${state.userId}`)
        .setLabel('Parar')
        .setEmoji('👋')
        .setStyle(ButtonStyle.Success),
    ),
  ];
}

async function finalizeBJ(state, interaction) {
  while (handTotal(state.dealer) < 17) state.dealer.push(state.deck.pop());

  const pTotal = handTotal(state.player);
  const dTotal = handTotal(state.dealer);
  const won    = dTotal > 21 || pTotal > dTotal;
  const tie    = !won && pTotal === dTotal;

  state.status = 'done';
  state.won = won;
  state.tie = tie;

  const payout = won ? state.bet * 2 : tie ? state.bet : 0;
  if (payout > 0) await addWin(state.userId, state.guildId, payout);
  blackjackGames.delete(state.userId);

  const { container, files } = await buildBJContainer(state);
  return interaction.update(v2Payload(container, files));
}

export async function startBlackjack(ctx, bet, sendFn) {
  const userId  = ctx.user?.id ?? ctx.author?.id;
  const guildId = ctx.guildId;

  if (blackjackGames.has(userId))
    return sendFn({ content: '❌ Você já tem um jogo de blackjack em andamento!' });

  const eco = await getEco(userId, guildId);
  const available = totalCoins(eco);
  if (bet > available)
    return sendFn({ content: `❌ Saldo insuficiente. Você tem **${fmtNum(available)} ${COIN()}** disponíveis entre carteira e banco.` });

  await deductBet(userId, guildId, bet);

  const deck   = shuffle(newDeck());
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];

  const state = { userId, guildId, bet, player, dealer, deck, status: 'playing', won: false, tie: false, bust: false };
  blackjackGames.set(userId, state);

  // Natural blackjack check
  if (handTotal(player) === 21) {
    const dTotal = handTotal(dealer);
    const won = dTotal !== 21;
    state.status = 'done';
    state.won = won;
    state.tie = !won;
    const payout = won ? Math.floor(bet * 2.5) : bet;
    await addWin(userId, guildId, payout);
    blackjackGames.delete(userId);
    const { container, files } = await buildBJContainer(state);
    return sendFn(v2Payload(container, files));
  }

  // Auto-timeout 2 min
  setTimeout(async () => {
    const s = blackjackGames.get(userId);
    if (s?.status === 'playing') {
      blackjackGames.delete(userId);
      await addWin(userId, guildId, bet).catch(() => {});
    }
  }, 120_000);

  const { container, files } = await buildBJContainer(state, true);
  return sendFn(v2Payload(container, files, ...buildBJComponents(state)));
}

export async function handleBJHit(interaction, targetId) {
  if (interaction.user.id !== targetId)
    return interaction.reply({ content: '❌ Este não é o seu jogo!', ephemeral: true });

  const state = blackjackGames.get(targetId);
  if (!state || state.status !== 'playing') return interaction.update({ components: [] });

  state.player.push(state.deck.pop());
  const total = handTotal(state.player);

  if (total > 21) {
    state.status = 'done';
    state.bust = true;
    blackjackGames.delete(targetId);
    const { container, files } = await buildBJContainer(state);
    return interaction.update(v2Payload(container, files));
  }
  if (total === 21) return finalizeBJ(state, interaction);

  const { container, files } = await buildBJContainer(state, true);
  return interaction.update(v2Payload(container, files, ...buildBJComponents(state)));
}

export async function handleBJStand(interaction, targetId) {
  if (interaction.user.id !== targetId)
    return interaction.reply({ content: '❌ Este não é o seu jogo!', ephemeral: true });

  const state = blackjackGames.get(targetId);
  if (!state) return interaction.update({ components: [] });

  return finalizeBJ(state, interaction);
}

// ══════════════════════════════════════════════════════════════════════════════
// MINES
// ══════════════════════════════════════════════════════════════════════════════

const GRID = 4;

function calcMult(gems, bombs) {
  if (gems === 0) return 1;
  const total = GRID * GRID;
  const safe  = total - bombs;
  let m = 1;
  for (let i = 0; i < gems; i++) m *= (total - i) / (safe - i);
  return Math.round(m * 0.97 * 100) / 100;
}

async function buildMinesPayload(state) {
  const mult   = calcMult(state.gems, state.bombs);
  const payout = Math.floor(state.bet * mult);

  const accentColor = 0x000000;

  const titleLine = state.status === 'lost'   ? `## ${getEmoji('05_angels')} Fim de jogo!`
    : state.status === 'cashed'               ? `## ${getEmoji('dinheiro_kingbuxx')} Fim de jogo!`
    : `## ${getEmoji('Diamante')} Mines`;

  const gainLine = state.status === 'lost'
    ? `> ${getEmoji('c_flymoney')} **Ganhos:** 0 ${COIN()}`
    : `> ${getEmoji('c_flymoney')} **Ganhos:** ${fmtNum(payout)} ${COIN()}`;

  const statusLine = state.status === 'playing'
    ? `\n> ${getEmoji('p_bom')} **Minas:** ${state.bombs} | ${getEmoji('Diamante')} **Reveladas:** ${state.gems}`
    : '';

  const text = `${titleLine}\n\n> ${getEmoji('f_3bat')} **Aposta:** ${fmtNum(state.bet)} ${COIN()}\n${gainLine}${statusLine}`;

  const container = new ContainerBuilder().setAccentColor(accentColor);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

  let files = [];
  try {
    const imgBuf = await generateDarkMinesGrid({
      grid:     state.grid,
      revealed: state.revealed,
      status:   state.status,
    });
    const attachment = new AttachmentBuilder(imgBuf, { name: 'mines.png' });
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://mines.png'),
      ),
    );
    files = [attachment];
  } catch {}

  return { container, files };
}

function buildMinesComponents(state) {
  const rows = [];
  const done = state.status !== 'playing';

  for (let r = 0; r < GRID; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < GRID; c++) {
      const idx        = r * GRID + c;
      const isRevealed = state.revealed[idx];
      const isBomb     = state.grid[idx];

      let emoji    = '⬜';
      let style    = ButtonStyle.Secondary;
      let disabled = done;

      if (isRevealed) {
        emoji    = isBomb ? getEmoji('p_bom') : getEmoji('Diamante');
        style    = isBomb ? ButtonStyle.Danger : ButtonStyle.Success;
        disabled = true;
      } else if (done && isBomb) {
        emoji    = getEmoji('p_bom');
        style    = ButtonStyle.Danger;
        disabled = true;
      } else if (done) {
        disabled = true;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_cell_${idx}_${state.userId}`)
          .setEmoji(emoji)
          .setStyle(style)
          .setDisabled(disabled),
      );
    }
    rows.push(row);
  }

  if (!done) {
    const canCash = state.gems > 0;
    const mult    = calcMult(state.gems, state.bombs);
    const payout  = Math.floor(state.bet * mult);
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`mines_cashout_${state.userId}`)
          .setLabel(canCash ? `Sacar — ${fmtNum(payout)}` : 'Sacar (revele uma gema primeiro)')
          .setEmoji('💰')
          .setStyle(ButtonStyle.Success)
          .setDisabled(!canCash),
      ),
    );
  }

  return rows;
}

export async function startMines(ctx, bet, bombs, sendFn) {
  const userId  = ctx.user?.id ?? ctx.author?.id;
  const guildId = ctx.guildId;
  const total = GRID * GRID;

  if (minesGames.has(userId))
    return sendFn({ content: '❌ Você já tem um jogo de mines em andamento!' });
  if (bombs < 1 || bombs >= total)
    return sendFn({ content: `❌ Número de bombas inválido (1–${total - 1}).` });

  const eco = await getEco(userId, guildId);
  const available = totalCoins(eco);
  if (bet > available)
    return sendFn({ content: `❌ Saldo insuficiente. Você tem **${fmtNum(available)} ${COIN()}** disponíveis entre carteira e banco.` });

  await deductBet(userId, guildId, bet);

  const bombSet = new Set();
  while (bombSet.size < bombs) bombSet.add(Math.floor(Math.random() * total));
  const grid = Array.from({ length: total }, (_, i) => bombSet.has(i));

  const state = {
    userId, guildId, bet, bombs,
    grid,
    revealed: Array(total).fill(false),
    gems: 0,
    status: 'playing',
  };

  minesGames.set(userId, state);

  // Auto-cashout after 5 min
  setTimeout(async () => {
    const s = minesGames.get(userId);
    if (s?.status === 'playing') {
      minesGames.delete(userId);
      const p = s.gems > 0 ? Math.floor(s.bet * calcMult(s.gems, s.bombs)) : s.bet;
      await addWin(userId, guildId, p).catch(() => {});
    }
  }, 300_000);

  const { container, files } = await buildMinesPayload(state);
  return sendFn(v2Payload(container, files, ...buildMinesComponents(state)));
}

export async function handleMinesCell(interaction, idx, targetId) {
  if (interaction.user.id !== targetId)
    return interaction.reply({ content: '❌ Este não é o seu jogo!', ephemeral: true });

  const state = minesGames.get(targetId);
  if (!state || state.status !== 'playing') return interaction.update({ components: [] });

  state.revealed[idx] = true;

  if (state.grid[idx]) {
    state.revealed = state.revealed.map(() => true);
    state.status = 'lost';
    minesGames.delete(targetId);
    const { container, files } = await buildMinesPayload(state);
    return interaction.update(v2Payload(container, files, ...buildMinesComponents(state)));
  }

  state.gems++;
  const totalSafe = GRID * GRID - state.bombs;

  if (state.gems >= totalSafe) {
    const payout = Math.floor(state.bet * calcMult(state.gems, state.bombs));
    state.status   = 'cashed';
    state.revealed = state.revealed.map(() => true);
    minesGames.delete(targetId);
    await addWin(targetId, state.guildId, payout);
    const { container, files } = await buildMinesPayload(state);
    return interaction.update(v2Payload(container, files, ...buildMinesComponents(state)));
  }

  const { container, files } = await buildMinesPayload(state);
  return interaction.update(v2Payload(container, files, ...buildMinesComponents(state)));
}

export async function handleMinesCashout(interaction, targetId) {
  if (interaction.user.id !== targetId)
    return interaction.reply({ content: '❌ Este não é o seu jogo!', ephemeral: true });

  const state = minesGames.get(targetId);
  if (!state || state.status !== 'playing') return interaction.update({ components: [] });
  if (state.gems === 0)
    return interaction.reply({ content: '❌ Revele pelo menos uma gema antes de sacar.', ephemeral: true });

  const payout = Math.floor(state.bet * calcMult(state.gems, state.bombs));
  state.status   = 'cashed';
  state.revealed = state.revealed.map(() => true);
  minesGames.delete(targetId);
  await addWin(targetId, state.guildId, payout);

  const { container, files } = await buildMinesPayload(state);
  return interaction.update(v2Payload(container, files, ...buildMinesComponents(state)));
}

import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import prisma from '../../database/client.js';
import { CARD_DEFS, getCard, rarityData } from '../../utils/cardData.js';
import { generateBattleBoard } from '../../utils/battleVisuals.js';

const TEAM_SIZE = 3;
const TEAM_PAGE_SIZE = 24;
const SESSION_TTL = 15 * 60 * 1000;
const CHALLENGE_TTL = 2 * 60 * 1000;

const teamSessions = new Map();
const challenges = new Map();
const battles = new Map();

function token() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function ownedCardKeys(rows) {
  return rows
    .filter(row => row.quantity > 0)
    .map(row => row.cardKey)
    .filter(key => getCard(key));
}

async function getOwnedCards(userId) {
  const rows = await prisma.cardCollection.findMany({
    where: { userId, quantity: { gt: 0 } },
    orderBy: { cardKey: 'asc' },
  });
  return ownedCardKeys(rows).map(key => getCard(key));
}

async function getTeam(userId, guildId) {
  const row = await prisma.cardBattleTeam.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });
  if (!row) return [];
  try {
    const keys = JSON.parse(row.cardKeys);
    return Array.isArray(keys) && keys.length === TEAM_SIZE
      ? keys.map(key => getCard(key)).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function saveTeam(userId, guildId, keys) {
  return prisma.cardBattleTeam.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, cardKeys: JSON.stringify(keys) },
    update: { cardKeys: JSON.stringify(keys) },
  });
}

function createTeamSession(userId, guildId, cards, selected = []) {
  const id = token();
  teamSessions.set(id, {
    id,
    userId,
    guildId,
    cards,
    selected: [...selected],
    page: 0,
    expiresAt: Date.now() + SESSION_TTL,
  });
  return id;
}

function getTeamSession(id) {
  const session = teamSessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    teamSessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL;
  return session;
}

function teamName(card, index) {
  return `${index + 1}. ${card.name}`;
}

function buildTeamPayload(session, message = null) {
  const totalPages = Math.max(1, Math.ceil(session.cards.length / TEAM_PAGE_SIZE));
  session.page = Math.min(Math.max(session.page, 0), totalPages - 1);
  const pageCards = session.cards.slice(
    session.page * TEAM_PAGE_SIZE,
    (session.page + 1) * TEAM_PAGE_SIZE,
  );
  const selectedText = session.selected.length
    ? session.selected.map((key, i) => `${i + 1}. **${getCard(key)?.name ?? 'Carta removida'}**`).join('\n')
    : 'Nenhum Pokémon escolhido ainda.';
  const selects = Array.from({ length: TEAM_SIZE }, (_, slot) => (
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`battle_team_select:${session.id}:${slot}`)
        .setPlaceholder(`Escolha o ${slot + 1}º Pokémon`)
        .addOptions(pageCards.map(card => ({
          label: card.name.slice(0, 100),
          description: `${rarityData(card.rarity).label} • CP ${cardPower(card)}`,
          value: card.key,
          default: session.selected[slot] === card.key,
        }))),
    )
  ));
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`battle_team_page:${session.id}:${session.page - 1}`)
      .setLabel('Página anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.page === 0),
    new ButtonBuilder()
      .setCustomId(`battle_team_page:${session.id}:${session.page + 1}`)
      .setLabel('Próxima página')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(session.page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`battle_team_confirm:${session.id}`)
      .setLabel('Confirmar time')
      .setStyle(ButtonStyle.Success)
      .setDisabled(session.selected.length !== TEAM_SIZE),
    new ButtonBuilder()
      .setCustomId(`battle_team_cancel:${session.id}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Danger),
  );
  return {
    content: [
      '## Montagem do time Pokémon GO',
      message ?? 'Escolha três Pokémon diferentes que você possui.',
      `Página **${session.page + 1}/${totalPages}**`,
      '',
      '**Seu time:**',
      selectedText,
      '',
      'O time fica salvo neste servidor e será usado nos próximos desafios.',
    ].join('\n'),
    components: [...selects, controls],
  };
}

function hashCard(card) {
  return [...card.key].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) % 997, 17);
}

function cardPower(card) {
  const base = card.rarity === 'mitica' ? 1550 : card.rarity === 'incomum' ? 1250 : 1000;
  return base + (hashCard(card) % 260);
}

function cardStats(card) {
  const cp = cardPower(card);
  return {
    cp,
    maxHp: 120 + Math.floor(cp / 16),
  };
}

function battleCard(card, ownerId) {
  const stats = cardStats(card);
  return { card, ownerId, ...stats, hp: stats.maxHp, energy: 0 };
}

function activePokemon(battle, playerId) {
  const side = battle.players[playerId];
  return side.team[side.active];
}

function otherPlayer(battle, playerId) {
  return battle.playerIds.find(id => id !== playerId);
}

function renderBar(value, max, size = 12) {
  const filled = Math.max(0, Math.ceil((value / max) * size));
  return `${'█'.repeat(filled)}${'░'.repeat(size - filled)}`;
}

const MOVES = Object.freeze({
  Fogo: [
    ['Brasa Rápida', 18, 20],
    ['Presas Flamejantes', 31, 45],
    ['Explosão Solar', 45, 70],
  ],
  Água: [
    ['Jato d’Água', 18, 20],
    ['Onda de Espuma', 30, 45],
    ['Hidrocanhão', 44, 70],
  ],
  Planta: [
    ['Folha Navalha', 18, 20],
    ['Chicote de Vinha', 30, 45],
    ['Raio Solar', 43, 70],
  ],
  Raio: [
    ['Faísca', 18, 20],
    ['Eletrochoque', 31, 45],
    ['Trovão', 45, 70],
  ],
  Psíquico: [
    ['Confusão', 18, 20],
    ['Pulso Psíquico', 30, 45],
    ['Psíquico', 44, 70],
  ],
  Sombrio: [
    ['Mordida', 18, 20],
    ['Jogo Sujo', 30, 45],
    ['Pulso Sombrio', 44, 70],
  ],
  Luta: [
    ['Golpe Rápido', 18, 20],
    ['Corpo a Corpo', 31, 45],
    ['Força Bruta', 44, 70],
  ],
  Metal: [
    ['Garra de Metal', 18, 20],
    ['Cabeça de Ferro', 30, 45],
    ['Canhão de Flash', 43, 70],
  ],
  Incolor: [
    ['Investida', 18, 20],
    ['Ataque Rápido', 29, 45],
    ['Hiper Voz', 42, 70],
  ],
});

const TYPE_ADVANTAGE = Object.freeze({
  Fogo: { Planta: 1.25, Água: 0.8 },
  Água: { Fogo: 1.25, Planta: 0.8 },
  Planta: { Água: 1.25, Fogo: 0.8 },
  Raio: { Água: 1.25, Planta: 0.8 },
  Psíquico: { Luta: 1.25, Sombrio: 0.8 },
  Sombrio: { Psíquico: 1.25 },
  Luta: { Sombrio: 1.25, Psíquico: 0.8 },
  Metal: { Psíquico: 1.15 },
});

function movesFor(pokemon) {
  return MOVES[pokemon.card.element] ?? MOVES.Incolor;
}

function renderPokemon(pokemon) {
  return [
    `**${pokemon.card.name}** • CP **${pokemon.cp}**`,
    `HP ${Math.max(0, pokemon.hp)}/${pokemon.maxHp} ${renderBar(pokemon.hp, pokemon.maxHp)}`,
    `Energia ${pokemon.energy}/100`,
  ].join('\n');
}

async function battlePayload(battle, extra = '') {
  if (battle.finished) {
    const winner = battle.players[battle.winner];
    return {
      content: [
        '## Batalha encerrada',
        `**${winner.name}** venceu a batalha Pokémon GO!`,
        battle.log,
      ].join('\n\n'),
      components: [],
    };
  }
  const first = battle.players[battle.playerIds[0]];
  const second = battle.players[battle.playerIds[1]];
  const turnPlayer = battle.players[battle.turn];
  const current = activePokemon(battle, battle.turn);
  const moves = movesFor(current);
  const moveMenu = new StringSelectMenuBuilder()
    .setCustomId(`battle_move:${battle.id}`)
    .setPlaceholder(`Escolha um golpe de ${current.card.name}`)
    .addOptions(moves.map(([name, power, cost], index) => ({
      label: name,
      description: `${power} poder • ${cost === 20 ? 'rápido' : `custa ${cost} energia`}`,
      value: String(index),
      emoji: cost === 20 ? '⚡' : '💥',
    })));
  const controls = new ActionRowBuilder().addComponents(
    moveMenu,
  );
  const utilityControls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`battle_action:${battle.id}:switch`).setLabel('Trocar Pokémon').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`battle_action:${battle.id}:surrender`).setLabel('Desistir').setStyle(ButtonStyle.Danger),
  );
  let image;
  try {
    image = await generateBattleBoard(
      activePokemon(battle, first.id),
      activePokemon(battle, second.id),
      turnPlayer.name,
    );
  } catch {}
  return {
    content: [
      '## Batalha Pokémon GO',
      `**${first.name}**\n${renderPokemon(activePokemon(battle, first.id))}`,
      '',
      `**${second.name}**\n${renderPokemon(activePokemon(battle, second.id))}`,
      '',
      `Vez de **${turnPlayer.name}** — escolha um dos golpes da carta ativa.`,
      extra || battle.log,
    ].join('\n'),
    components: [controls, utilityControls],
     ...(image ? { files: [new AttachmentBuilder(image, { name: `battle-${battle.id}-${Date.now()}.png` })] } : {}),
  };
}

async function updateBattle(interaction, battle, extra = '') {
  await interaction.deferUpdate();
  return interaction.editReply(await battlePayload(battle, extra));
}

function availableSwitches(side) {
  return side.team.some((pokemon, index) => index !== side.active && pokemon.hp > 0);
}

function finishIfNeeded(battle, defenderId) {
  const defender = battle.players[defenderId];
  if (defender.team.every(pokemon => pokemon.hp <= 0)) {
    battle.finished = true;
    battle.winner = otherPlayer(battle, defenderId);
    return true;
  }
  const active = activePokemon(battle, defenderId);
  if (active.hp <= 0) {
    const next = defender.team.findIndex(pokemon => pokemon.hp > 0);
    if (next >= 0) defender.active = next;
  }
  return false;
}

function initializeBattle(id, challenger, opponent, challengerTeam, opponentTeam) {
  return {
    id,
    playerIds: [challenger.id, opponent.id],
    turn: challenger.id,
    finished: false,
    winner: null,
    log: 'A batalha começou! O desafiante começa.',
    players: {
      [challenger.id]: {
        id: challenger.id,
        name: challenger.name,
        active: 0,
        team: challengerTeam.map(card => battleCard(card, challenger.id)),
      },
      [opponent.id]: {
        id: opponent.id,
        name: opponent.name,
        active: 0,
        team: opponentTeam.map(card => battleCard(card, opponent.id)),
      },
    },
  };
}

async function startTeamSetup(interaction, userId, guildId, edit) {
  const cards = await getOwnedCards(userId);
  if (cards.length < TEAM_SIZE) {
    return edit({
      content: `Você precisa possuir pelo menos **${TEAM_SIZE} cartas diferentes** para montar um time. Abra alguns packs com \`/cartas abrir\`.`,
      components: [],
    });
  }
  const current = await getTeam(userId, guildId);
  const sessionId = createTeamSession(userId, guildId, cards, current.map(card => card.key));
  return edit(buildTeamPayload(getTeamSession(sessionId)));
}

async function challengeMember(interaction, target, reply) {
  if (!interaction.guildId) return reply({ content: 'A batalha só funciona dentro de um servidor.', ephemeral: true });
  const actor = interaction.user ?? interaction.author;
  const actorName = interaction.member?.displayName ?? actor.username;
  if (!target || target.bot) return reply({ content: 'Escolha um membro válido do servidor.', ephemeral: true });
  if (target.id === actor.id) return reply({ content: 'Você não pode desafiar a si mesmo.', ephemeral: true });
  const challengerTeam = await getTeam(actor.id, interaction.guildId);
  if (challengerTeam.length !== TEAM_SIZE) {
    return reply({ content: 'Monte seu time primeiro usando `/batalha montar`.', ephemeral: true });
  }
  const opponentTeam = await getTeam(target.id, interaction.guildId);
  if (opponentTeam.length !== TEAM_SIZE) {
    return reply({ content: `${target} ainda não montou um time neste servidor.`, ephemeral: true });
  }
  const id = token();
  challenges.set(id, {
    id,
    guildId: interaction.guildId,
    challenger: { id: actor.id, name: actorName },
    opponent: { id: target.id, name: target.displayName ?? target.username },
    challengerTeam,
    opponentTeam,
    expiresAt: Date.now() + CHALLENGE_TTL,
  });
  return reply({
    content: `${target}, **${actorName}** te desafiou para uma batalha Pokémon GO!`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`battle_challenge_accept:${id}`).setLabel('Aceitar batalha').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`battle_challenge_decline:${id}`).setLabel('Recusar').setStyle(ButtonStyle.Danger),
    )],
  });
}

export async function handleBattleInteraction(interaction) {
  const [action, id, value] = interaction.customId.split(':');

  if (action === 'battle_team_select') {
    const session = getTeamSession(id);
    if (!session) return interaction.reply({ content: 'Esta montagem expirou. Use `/batalha montar` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Este time pertence a outra pessoa.', ephemeral: true });
    const slot = Number(value);
    const selected = interaction.values[0];
    if (session.selected.includes(selected) && session.selected[slot] !== selected) {
      return interaction.reply({ content: 'Escolha três Pokémon diferentes.', ephemeral: true });
    }
    session.selected[slot] = selected;
    return interaction.update(buildTeamPayload(session, 'Seleções atualizadas. Confira o time e confirme quando estiver pronto.'));
  }

  if (action === 'battle_team_page') {
    const session = getTeamSession(id);
    if (!session) return interaction.reply({ content: 'Esta montagem expirou. Use `/batalha montar` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Este time pertence a outra pessoa.', ephemeral: true });
    session.page = Number(value) || 0;
    return interaction.update(buildTeamPayload(session));
  }

  if (action === 'battle_team_cancel') {
    const session = getTeamSession(id);
    if (!session) return interaction.reply({ content: 'Esta montagem já expirou.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Este time pertence a outra pessoa.', ephemeral: true });
    teamSessions.delete(id);
    return interaction.update({ content: 'Montagem cancelada.', components: [] });
  }

  if (action === 'battle_team_confirm') {
    const session = getTeamSession(id);
    if (!session) return interaction.reply({ content: 'Esta montagem expirou. Use `/batalha montar` novamente.', ephemeral: true });
    if (session.userId !== interaction.user.id) return interaction.reply({ content: 'Este time pertence a outra pessoa.', ephemeral: true });
    if (session.selected.length !== TEAM_SIZE || new Set(session.selected).size !== TEAM_SIZE) {
      return interaction.reply({ content: 'Escolha três Pokémon diferentes antes de confirmar.', ephemeral: true });
    }
    await saveTeam(session.userId, session.guildId, session.selected);
    teamSessions.delete(id);
    return interaction.update({
      content: `## Time salvo\n\n${session.selected.map((key, i) => teamName(getCard(key), i)).join('\n')}\n\nUse \`/batalha desafiar\` para chamar um membro.`,
      components: [],
    });
  }

  if (action === 'battle_challenge_accept' || action === 'battle_challenge_decline') {
    const challenge = challenges.get(id);
    if (!challenge || challenge.expiresAt < Date.now()) {
      challenges.delete(id);
      return interaction.reply({ content: 'Este desafio expirou.', ephemeral: true });
    }
    if (interaction.user.id !== challenge.opponent.id) {
      return interaction.reply({ content: 'Somente a pessoa desafiada pode responder.', ephemeral: true });
    }
    challenges.delete(id);
    if (action === 'battle_challenge_decline') {
      return interaction.update({ content: 'Desafio recusado.', components: [] });
    }
    const battle = initializeBattle(
      token(),
      challenge.challenger,
      challenge.opponent,
      challenge.challengerTeam,
      challenge.opponentTeam,
    );
    battles.set(battle.id, battle);
     return updateBattle(interaction, battle);
  }

  if (action === 'battle_move') {
    const battle = battles.get(id);
    if (!battle || battle.finished) return interaction.reply({ content: 'Esta batalha já terminou.', ephemeral: true });
    if (!battle.players[interaction.user.id]) return interaction.reply({ content: 'Você não participa desta batalha.', ephemeral: true });
    if (battle.turn !== interaction.user.id) return interaction.reply({ content: 'Aguarde a vez do adversário.', ephemeral: true });

    const current = activePokemon(battle, interaction.user.id);
    const defenderId = otherPlayer(battle, interaction.user.id);
    const defender = activePokemon(battle, defenderId);
    const moveIndex = Number(interaction.values?.[0]);
    const move = movesFor(current)[moveIndex];
    if (!move) return interaction.reply({ content: 'Esse golpe não está disponível.', ephemeral: true });

    const [moveName, power, energyCost] = move;
    if (current.energy < energyCost) {
      return interaction.reply({
        content: `Energia insuficiente para **${moveName}**. Você tem ${current.energy}/100 e precisa de ${energyCost}.`,
        ephemeral: true,
      });
    }

    const typeMultiplier = TYPE_ADVANTAGE[current.card.element]?.[defender.card.element] ?? 1;
    const rarityMultiplier = defender.card.rarity === 'mitica' ? 0.9 : defender.card.rarity === 'comum' ? 1.05 : 1;
    const cpMultiplier = 0.9 + (current.cp / 2000) * 0.1;
    const damage = Math.max(8, Math.round(power * cpMultiplier * typeMultiplier * rarityMultiplier));
    defender.hp -= damage;
    current.energy = Math.min(100, current.energy - energyCost + (energyCost === 20 ? 32 : 8));

    const advantageText = typeMultiplier > 1 ? ' Foi super eficaz!' : typeMultiplier < 1 ? ' Não foi muito eficaz...' : '';
    battle.log = `${current.card.name} usou **${moveName}** e causou **${damage} de dano**.${advantageText}`;
    if (finishIfNeeded(battle, defenderId)) return updateBattle(interaction, battle);
    battle.turn = defenderId;
    return updateBattle(interaction, battle);
  }

  if (action === 'battle_action') {
    const battle = battles.get(id);
    if (!battle || battle.finished) return interaction.reply({ content: 'Esta batalha já terminou.', ephemeral: true });
    if (!battle.players[interaction.user.id]) return interaction.reply({ content: 'Você não participa desta batalha.', ephemeral: true });
    if (battle.turn !== interaction.user.id) return interaction.reply({ content: 'Aguarde a vez do adversário.', ephemeral: true });
    const current = activePokemon(battle, interaction.user.id);
    const defenderId = otherPlayer(battle, interaction.user.id);
    const defender = activePokemon(battle, defenderId);
    if (value === 'surrender') {
      battle.finished = true;
      battle.winner = defenderId;
      battle.log = `${battle.players[interaction.user.id].name} desistiu.`;
       return updateBattle(interaction, battle);
    }
    if (value === 'switch') {
      if (!availableSwitches(battle.players[interaction.user.id])) {
        return interaction.reply({ content: 'Você não tem outro Pokémon saudável para trocar.', ephemeral: true });
      }
      battle.players[interaction.user.id].active = battle.players[interaction.user.id].team.findIndex(
        (pokemon, index) => index !== battle.players[interaction.user.id].active && pokemon.hp > 0,
      );
      battle.log = `${battle.players[interaction.user.id].name} fez uma troca rápida!`;
     }
    battle.turn = defenderId;
     return updateBattle(interaction, battle);
  }
}

const battleCommand = {
  data: new SlashCommandBuilder()
    .setName('batalha')
    .setDescription('Batalhas Pokémon GO entre membros')
    .addSubcommand(sub => sub.setName('montar').setDescription('Monte ou altere seu time de 3 Pokémon'))
    .addSubcommand(sub => sub
      .setName('desafiar')
      .setDescription('Desafie um membro para uma batalha')
      .addUserOption(option => option.setName('membro').setDescription('Membro que você quer desafiar').setRequired(true))),
  name: 'batalha',
  aliases: ['battle', 'pvp'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (!interaction.guildId) return interaction.reply({ content: 'A batalha só funciona dentro de um servidor.', ephemeral: true });
    if (sub === 'montar') {
      await interaction.deferReply({ ephemeral: true });
      return startTeamSetup(interaction, interaction.user.id, interaction.guildId, opts => interaction.editReply(opts));
    }
    await interaction.deferReply();
    return challengeMember(
      interaction,
      interaction.options.getUser('membro'),
      opts => interaction.editReply(opts),
    );
  },

  async executePrefix(message, args) {
    if (!message.guildId) return message.reply('A batalha só funciona dentro de um servidor.');
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === 'montar' || sub === 'montar-time' || sub === 'time') {
      return startTeamSetup(message, message.author.id, message.guildId, opts => message.reply(opts));
    }
    if (sub === 'desafiar' || sub === 'challenge') {
      return challengeMember(message, message.mentions.users.first(), opts => message.reply(opts));
    }
    return message.reply('Use `savage batalha montar` ou `savage batalha desafiar @membro`.');
  },
};

export default battleCommand;
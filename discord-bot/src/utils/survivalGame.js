import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from '../database/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, '../../assets/survival');
const MAX_PLAYERS = 24;
const MIN_PLAYERS = 2;
const VOTE_TIMEOUT_MS = 30_000;
const GAME_TTL_MS = 60 * 60 * 1000;

const games = new Map();

const SCENARIOS = [
  {
    key: 'storm',
    image: 'survival-storm.png',
    title: '🌩️ Rodada 1 — A tempestade',
    text: 'O céu ficou preto. A chuva está levando os suprimentos e um raio atingiu a velha torre de rádio.',
    choices: [
      { id: 'cave', label: 'Abrigar na caverna', emoji: '🕳️', detail: 'Protege o grupo e encontra abrigo.', supplies: 1, morale: 1, risk: 0.08 },
      { id: 'radio', label: 'Ligar o rádio', emoji: '📡', detail: 'Pode chamar ajuda, mas exige atravessar a chuva.', signal: 2, supplies: -1, risk: 0.18 },
      { id: 'wreck', label: 'Vasculhar os destroços', emoji: '🧰', detail: 'A chance de encontrar recursos é grande.', supplies: 2, risk: 0.28 },
    ],
  },
  {
    key: 'cave',
    image: 'survival-cave.png',
    title: '🕯️ Rodada 2 — A noite na caverna',
    text: 'A escuridão caiu. Há marcas estranhas nas paredes e o grupo precisa decidir como passar a noite.',
    choices: [
      { id: 'fire', label: 'Acender uma fogueira', emoji: '🔥', detail: 'Aquece o grupo e aumenta a confiança.', morale: 2, risk: 0.12 },
      { id: 'watch', label: 'Fazer vigília', emoji: '👀', detail: 'Ninguém dorme, mas todos ficam mais atentos.', signal: 1, morale: 1, risk: 0.05 },
      { id: 'explore', label: 'Explorar a caverna', emoji: '🪨', detail: 'Pode haver suprimentos… ou algo pior.', supplies: 1, signal: 1, risk: 0.22 },
    ],
  },
  {
    key: 'tower',
    image: 'survival-tower.png',
    title: '📡 Rodada 3 — O sinal',
    text: 'A torre está acima da linha das árvores. Um último esforço pode fazer o sinal alcançar o continente.',
    choices: [
      { id: 'climb', label: 'Subir até o rádio', emoji: '🧗', detail: 'Conserta a antena, mas a subida é perigosa.', signal: 2, risk: 0.25 },
      { id: 'flare', label: 'Guardar o sinalizador', emoji: '🚨', detail: 'Preserva um recurso para a hora certa.', supplies: 1, morale: -1, risk: 0.08 },
      { id: 'mountain', label: 'Cruzar a montanha', emoji: '⛰️', detail: 'Procura um ponto alto e novos recursos.', signal: 1, supplies: 1, risk: 0.28 },
    ],
  },
  {
    key: 'rescue',
    image: 'survival-rescue.png',
    title: '🚁 Rodada 4 — A última chance',
    text: 'Um helicóptero apareceu no horizonte. O grupo tem poucos minutos para escolher como será visto.',
    choices: [
      { id: 'flare', label: 'Acender o sinalizador', emoji: '🚨', detail: 'Um clarão pode ser visto de longe.', signal: 2, risk: 0.15 },
      { id: 'smoke', label: 'Fazer sinal de fumaça', emoji: '💨', detail: 'Usa os últimos materiais do acampamento.', signal: 1, supplies: -1, risk: 0.1 },
      { id: 'wait', label: 'Esperar em silêncio', emoji: '🤫', detail: 'Poupa forças, mas o resgate pode passar direto.', signal: -1, morale: 1, risk: 0.3 },
    ],
  },
];

function gameToken() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function assetPath(filename) {
  return join(ASSET_DIR, filename);
}

function activePlayers(game) {
  return [...game.players.values()].filter(player => player.alive);
}

function playerName(player) {
  return String(player.displayName || player.username || player.userId).slice(0, 28);
}

function playerList(game) {
  const players = [...game.players.values()];
  if (!players.length) return 'Ainda ninguém entrou. Seja o primeiro!';
  const visible = players.slice(0, 12).map(player => `${player.alive ? '🟢' : '⚫'} ${playerName(player)}`);
  const remaining = players.length - visible.length;
  if (remaining > 0) visible.push(`… e mais ${remaining}`);
  return visible.join('\n');
}

function formatStats(game) {
  const alive = activePlayers(game).length;
  return `👥 **${alive}/${game.players.size}** vivos  •  🧰 **${Math.max(0, game.supplies)}** suprimentos  •  📡 **${Math.max(0, game.signal)}** sinal`;
}

function scenarioFor(game) {
  return SCENARIOS[Math.min(game.round, SCENARIOS.length - 1)];
}

function choiceCounts(game, scenario) {
  return new Map(
    scenario.choices.map(choice => [
      choice.id,
      [...game.votes.values()].filter(value => value === choice.id).length,
    ]),
  );
}

function choiceButton(game, choice, counts) {
  const voted = game.votes.get(game.viewerId);
  return new ButtonBuilder()
    .setCustomId(`survival_choice:${game.id}:${choice.id}`)
    .setLabel(`${choice.label} • ${counts.get(choice.id) ?? 0}`)
    .setEmoji(choice.emoji)
    .setStyle(voted === choice.id ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function buildLobbyPayload(game) {
  const embed = new EmbedBuilder()
    .setColor(0x1D9BF0)
    .setTitle('🏕️ SOBREVIVÊNCIA: ILHA ZERO')
    .setDescription(
      'Um sinal de emergência foi detectado em uma ilha desconhecida.\n' +
      'Entrem no grupo, tomem decisões juntos e tentem sobreviver até o resgate.\n\n' +
      '**Como funciona:**\n' +
      '• Todos votam em uma decisão por rodada.\n' +
      '• A maioria muda o destino do grupo.\n' +
      '• Riscos podem ferir ou eliminar sobreviventes.\n' +
      '• A equipe precisa acumular sinal antes do último resgate.',
    )
    .addFields(
      { name: '👥 Participantes', value: playerList(game), inline: true },
      { name: '🎯 Objetivo', value: 'Sobreviver a 4 rodadas e alcançar o resgate.', inline: true },
    )
    .setFooter({ text: `Partida criada por ${game.hostName} • Máximo de ${MAX_PLAYERS} jogadores` })
    .setImage('attachment://survival-lobby.png');

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(assetPath('survival-lobby.png'), { name: 'survival-lobby.png' })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`survival_join:${game.id}`)
          .setLabel(`Participar • ${game.players.size}/${MAX_PLAYERS}`)
          .setEmoji('🏕️')
          .setStyle(ButtonStyle.Success)
          .setDisabled(game.players.size >= MAX_PLAYERS),
        new ButtonBuilder()
          .setCustomId(`survival_leave:${game.id}`)
          .setLabel('Sair')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`survival_start:${game.id}`)
          .setLabel('Iniciar partida')
          .setEmoji('🚀')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
  };
}

function buildRoundPayload(game) {
  const scenario = scenarioFor(game);
  const counts = choiceCounts(game, scenario);
  const alive = activePlayers(game);
  const voted = game.votes.size;
  const history = game.history.length
    ? `\n\n**Último acontecimento:** ${game.history.at(-1)}`
    : '';

  const embed = new EmbedBuilder()
    .setColor(0xF59E0B)
    .setTitle(scenario.title)
    .setDescription(
      `${scenario.text}${history}\n\n` +
      `**Votação:** ${voted}/${alive.length} sobreviventes já escolheram.\n` +
      `${formatStats(game)}`,
    )
    .addFields({
      name: '🧭 Jogadores na expedição',
      value: playerList(game),
      inline: false,
    })
    .setFooter({ text: 'A decisão da maioria define o próximo capítulo • Você pode trocar seu voto' })
    .setImage(`attachment://${scenario.image}`);

  const rows = [];
  for (let i = 0; i < scenario.choices.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      scenario.choices.slice(i, i + 5).map(choice => choiceButton(game, choice, counts)),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`survival_status:${game.id}`)
      .setLabel('Ver situação')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
  ));

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(assetPath(scenario.image), { name: scenario.image })],
    components: rows,
  };
}

function buildFinishedPayload(game) {
  const won = game.result === 'won';
  const alive = activePlayers(game);
  const embed = new EmbedBuilder()
    .setColor(won ? 0x57F287 : 0xED4245)
    .setTitle(won ? '🚁 RESGATE CONFIRMADO!' : '🌑 A ILHA VENCEU')
    .setDescription(
      won
        ? `O sinal finalmente alcançou o continente. **${alive.length}** sobrevivente(s) saíram da ilha!\n\n${game.history.join('\n')}`
        : `O grupo perdeu o sinal e os últimos suprimentos. A expedição terminou com **${alive.length}** sobrevivente(s).\n\n${game.history.join('\n')}`,
    )
    .addFields(
      { name: '🏆 Resultado', value: won ? 'Vitória cooperativa' : 'Derrota coletiva', inline: true },
      { name: '🧰 Suprimentos finais', value: String(Math.max(0, game.supplies)), inline: true },
      { name: '📡 Sinal final', value: String(Math.max(0, game.signal)), inline: true },
      { name: '🎁 Recompensa', value: won ? '750 moedas para vivos • 250 para eliminados' : '150 moedas pela participação', inline: false },
    )
    .setFooter({ text: 'Uma nova expedição pode ser criada quando esta partida terminar.' })
    .setImage(`attachment://${game.resultImage}`);

  return {
    embeds: [embed],
    files: [new AttachmentBuilder(assetPath(game.resultImage), { name: game.resultImage })],
    components: [],
  };
}

export function buildSurvivalPayload(game) {
  if (game.stage === 'lobby') return buildLobbyPayload(game);
  if (game.stage === 'finished') return buildFinishedPayload(game);
  return buildRoundPayload(game);
}

async function deleteTemporaryChannel(game) {
  if (!game.temporaryChannel || !game.client || !game.channelId) return;
  try {
    const channel = game.client.channels.cache.get(game.channelId)
      ?? await game.client.channels.fetch(game.channelId).catch(() => null);
    if (channel) await channel.delete('Expedição de sobrevivência encerrada');
  } catch (error) {
    console.error('[SURVIVAL] Falha ao remover canal temporário:', error.message);
  }
}

function expireGame(game) {
  if (!games.has(game.id)) return;
  games.delete(game.id);
  void deleteTemporaryChannel(game);
}

export function removeSurvivalGame(gameId) {
  const game = games.get(gameId);
  if (!game) return;
  clearTimeout(game.timer);
  games.delete(gameId);
}

export function createSurvivalGame({ guildId, channelId, hostId, hostName, client, temporaryChannel = false }) {
  const game = {
    id: gameToken(),
    guildId,
    channelId,
    client,
    temporaryChannel,
    messageId: null,
    hostId,
    hostName,
    stage: 'lobby',
    round: 0,
    players: new Map(),
    votes: new Map(),
    supplies: 2,
    signal: 0,
    morale: 2,
    history: [],
    timer: null,
    result: null,
    resultImage: 'survival-rescue.png',
    rewardsPaid: false,
  };
  games.set(game.id, game);
  game.timer = setTimeout(() => expireGame(game), GAME_TTL_MS);
  return game;
}

function getGame(id) {
  const game = games.get(id);
  if (!game) return null;
  return game;
}

async function updateGameMessage(client, game) {
  try {
    const channel = client.channels.cache.get(game.channelId)
      ?? await client.channels.fetch(game.channelId).catch(() => null);
    const message = channel
      ? await channel.messages.fetch(game.messageId).catch(() => null)
      : null;
    if (message) await message.edit(buildSurvivalPayload(game));
  } catch (error) {
    console.error('[SURVIVAL] Falha ao atualizar painel:', error.message);
  }
}

function scheduleRound(client, game) {
  clearTimeout(game.timer);
  game.timer = setTimeout(() => resolveRound(client, game), VOTE_TIMEOUT_MS);
}

function chooseWinningChoice(game, scenario) {
  const counts = choiceCounts(game, scenario);
  const max = Math.max(...counts.values());
  const winners = scenario.choices.filter(choice => counts.get(choice.id) === max);
  return winners[Math.floor(Math.random() * winners.length)] ?? scenario.choices[0];
}

async function applyChoice(game, scenario, choice) {
  game.supplies = Math.max(0, game.supplies + (choice.supplies ?? 0));
  game.signal = Math.max(0, game.signal + (choice.signal ?? 0));
  game.morale = Math.max(0, game.morale + (choice.morale ?? 0));

  const events = [`A maioria escolheu **${choice.label}**.`];
  const alive = activePlayers(game);

  if (choice.risk && Math.random() < choice.risk && alive.length) {
    const victim = alive[Math.floor(Math.random() * alive.length)];
    victim.hp -= 1;
    if (victim.hp <= 0) {
      victim.alive = false;
      events.push(`💀 **${playerName(victim)}** não conseguiu continuar a expedição.`);
    } else {
      events.push(`🩹 **${playerName(victim)}** se feriu, mas continua vivo.`);
    }
  }

  if (game.supplies === 0 && activePlayers(game).length) {
    const hungry = activePlayers(game)[Math.floor(Math.random() * activePlayers(game).length)];
    hungry.hp -= 1;
    events.push(`🥀 A falta de suprimentos enfraqueceu **${playerName(hungry)}**.`);
    if (hungry.hp <= 0) {
      hungry.alive = false;
      events.push(`💀 **${playerName(hungry)}** ficou sem forças.`);
    }
  }

  game.history.push(events.join(' '));
}

async function rewardPlayers(game) {
  if (game.rewardsPaid) return;
  game.rewardsPaid = true;

  await Promise.all([...game.players.values()].map(async player => {
    const reward = game.result === 'won'
      ? (player.alive ? 750 : 250)
      : 150;
    try {
      await prisma.economy.upsert({
        where: { userId_guildId: { userId: player.userId, guildId: game.guildId } },
        create: { userId: player.userId, guildId: game.guildId, balance: reward },
        update: { balance: { increment: reward } },
      });
    } catch (error) {
      console.error(`[SURVIVAL] Falha ao premiar ${player.userId}:`, error.message);
    }
  }));
}

async function resolveRound(client, game) {
  if (game.stage !== 'round') return;
  clearTimeout(game.timer);

  const scenario = scenarioFor(game);
  const choice = chooseWinningChoice(game, scenario);
  await applyChoice(game, scenario, choice);
  game.votes.clear();

  if (!activePlayers(game).length) {
    game.stage = 'finished';
    game.result = 'lost';
    game.resultImage = 'survival-storm.png';
  } else if (game.round >= SCENARIOS.length - 1) {
    game.stage = 'finished';
    game.result = game.signal >= 3 || game.morale >= 5 ? 'won' : 'lost';
    game.resultImage = game.result === 'won' ? 'survival-rescue.png' : 'survival-cave.png';
  } else {
    game.round += 1;
    scheduleRound(client, game);
  }

  if (game.stage === 'finished') {
    await rewardPlayers(game);
    clearTimeout(game.timer);
    game.timer = setTimeout(() => expireGame(game), 15 * 60 * 1000);
  }

  await updateGameMessage(client, game);
}

export async function handleSurvivalInteraction(interaction) {
  const [action, gameId, choiceId] = interaction.customId.split(':');
  const game = getGame(gameId);
  if (!game || game.guildId !== interaction.guildId) {
    return interaction.reply({ content: '❌ Esta expedição não existe mais.', ephemeral: true });
  }

  if (action === 'survival_join') {
    if (game.stage !== 'lobby') return interaction.reply({ content: '❌ A partida já começou.', ephemeral: true });
    if (game.players.has(interaction.user.id)) return interaction.reply({ content: '✅ Você já está na expedição.', ephemeral: true });
    if (game.players.size >= MAX_PLAYERS) return interaction.reply({ content: '❌ A expedição está lotada.', ephemeral: true });

    game.players.set(interaction.user.id, {
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
      hp: 3,
      alive: true,
    });
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_leave') {
    if (game.stage !== 'lobby') return interaction.reply({ content: '❌ Depois que começa, não dá para abandonar a expedição.', ephemeral: true });
    if (interaction.user.id === game.hostId) return interaction.reply({ content: '❌ O organizador não pode sair. Cancele a mensagem ou inicie a partida.', ephemeral: true });
    if (!game.players.delete(interaction.user.id)) return interaction.reply({ content: '❌ Você ainda não entrou.', ephemeral: true });
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_start') {
    if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas quem criou a expedição pode iniciá-la.', ephemeral: true });
    if (game.players.size < MIN_PLAYERS) return interaction.reply({ content: `❌ São necessários pelo menos ${MIN_PLAYERS} participantes.`, ephemeral: true });

    game.stage = 'round';
    game.round = 0;
    game.votes.clear();
    scheduleRound(interaction.client, game);
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_status') {
    const player = game.players.get(interaction.user.id);
    const status = player
      ? `${player.alive ? '🟢 Vivo' : '⚫ Eliminado'} • ❤️ ${Math.max(0, player.hp)}/3 de vida`
      : 'Você está assistindo à expedição.';
    return interaction.reply({
      content: `**📊 Situação da expedição**\n${status}\n${formatStats(game)}\n\n${playerList(game)}`,
      ephemeral: true,
    });
  }

  if (action === 'survival_choice') {
    if (game.stage !== 'round') return interaction.reply({ content: '❌ A votação não está aberta.', ephemeral: true });
    const player = game.players.get(interaction.user.id);
    if (!player) return interaction.reply({ content: '❌ Você precisa clicar em **Participar** antes.', ephemeral: true });
    if (!player.alive) return interaction.reply({ content: '❌ Você foi eliminado da expedição.', ephemeral: true });
    const scenario = scenarioFor(game);
    if (!scenario.choices.some(choice => choice.id === choiceId)) return interaction.reply({ content: '❌ Escolha inválida.', ephemeral: true });

    game.votes.set(interaction.user.id, choiceId);
    if (game.votes.size >= activePlayers(game).length) {
      await interaction.deferUpdate();
      return resolveRound(interaction.client, game);
    }
    return interaction.update(buildSurvivalPayload(game));
  }

  return interaction.reply({ content: '❌ Ação da expedição inválida.', ephemeral: true });
}
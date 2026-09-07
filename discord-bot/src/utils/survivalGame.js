import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from '../database/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, '../../assets/survival');
const MAX_PLAYERS = 24;
const MIN_PLAYERS = 2;
const MAX_HP = 5;
const VOTE_TIMEOUT_MS = 30_000;
const GAME_TTL_MS = 60 * 60 * 1000;

const games = new Map();

const SCENARIOS = [
  {
    key: 'storm',
    biome: 'Costa da tempestade',
    image: 'survival-storm-banner.png',
    title: '🌩️ Rodada 1 — A tempestade',
    text: 'O céu ficou preto. A chuva está levando os suprimentos e um raio atingiu a velha torre de rádio.',
    choices: [
      { id: 'cave', label: 'Abrigar na caverna', emoji: '🕳️', detail: 'Protege o grupo e encontra abrigo.', supplies: 1, morale: 1, risk: 0.08 },
      { id: 'radio', label: 'Ligar o rádio', emoji: '📡', detail: 'Pode chamar ajuda, mas exige atravessar a chuva.', signal: 2, supplies: -1, risk: 0.18 },
      { id: 'wreck', label: 'Vasculhar os destroços', emoji: '🧰', detail: 'A chance de encontrar recursos é grande.', supplies: 2, risk: 0.28 },
    ],
  },
  {
    key: 'mangrove',
    biome: 'Manguezal',
    image: 'survival-mangrove-banner.png',
    title: '🌿 Rodada 2 — O manguezal',
    text: 'A maré subiu e as raízes escondem passagens estreitas. Há água potável em algum lugar, mas o terreno está cheio de armadilhas.',
    choices: [
      { id: 'roots', label: 'Seguir pelas raízes', emoji: '🌱', detail: 'Procura frutas e um caminho seco.', supplies: 1, morale: 1, risk: 0.12 },
      { id: 'tide', label: 'Seguir a maré', emoji: '🌊', detail: 'A corrente pode levar o sinal mais longe.', signal: 2, supplies: -1, risk: 0.2 },
      { id: 'raft', label: 'Montar uma jangada', emoji: '🪵', detail: 'Cruza o mangue sem perder tempo.', supplies: 2, risk: 0.26 },
    ],
  },
  {
    key: 'cave',
    biome: 'Caverna',
    image: 'survival-cave-banner.png',
    title: '🕯️ Rodada 3 — A noite na caverna',
    text: 'A escuridão caiu. Há marcas estranhas nas paredes e o grupo precisa decidir como passar a noite.',
    choices: [
      { id: 'fire', label: 'Acender uma fogueira', emoji: '🔥', detail: 'Aquece o grupo e aumenta a confiança.', morale: 2, risk: 0.12 },
      { id: 'watch', label: 'Fazer vigília', emoji: '👀', detail: 'Ninguém dorme, mas todos ficam mais atentos.', signal: 1, morale: 1, risk: 0.05 },
      { id: 'explore', label: 'Explorar a caverna', emoji: '🪨', detail: 'Pode haver suprimentos… ou algo pior.', supplies: 1, signal: 1, risk: 0.22 },
    ],
  },
  {
    key: 'volcano',
    biome: 'Vulcão',
    image: 'survival-volcano-banner.png',
    title: '🌋 Rodada 4 — A encosta vulcânica',
    text: 'O chão treme sob os pés. A fumaça cobre o céu e o calor abre uma rota perigosa até um antigo posto de observação.',
    choices: [
      { id: 'ash', label: 'Subir pela cinza', emoji: '🌋', detail: 'A altura pode revelar uma rota de resgate.', signal: 2, risk: 0.24 },
      { id: 'shelter', label: 'Buscar abrigo', emoji: '🪨', detail: 'Protege o grupo e preserva a moral.', supplies: 1, morale: 2, risk: 0.1 },
      { id: 'lava', label: 'Cortar caminho', emoji: '🔥', detail: 'É rápido, mas qualquer erro custa caro.', supplies: -1, signal: 1, risk: 0.34 },
    ],
  },
  {
    key: 'tower',
    biome: 'Montanha',
    image: 'survival-tower-banner.png',
    title: '📡 Rodada 5 — O sinal',
    text: 'A torre está acima da linha das árvores. Um último esforço pode fazer o sinal alcançar o continente.',
    choices: [
      { id: 'climb', label: 'Subir até o rádio', emoji: '🧗', detail: 'Conserta a antena, mas a subida é perigosa.', signal: 2, risk: 0.25 },
      { id: 'flare', label: 'Guardar o sinalizador', emoji: '🚨', detail: 'Preserva um recurso para a hora certa.', supplies: 1, morale: -1, risk: 0.08 },
      { id: 'mountain', label: 'Cruzar a montanha', emoji: '⛰️', detail: 'Procura um ponto alto e novos recursos.', signal: 1, supplies: 1, risk: 0.28 },
    ],
  },
  {
    key: 'rescue',
    biome: 'Costa de resgate',
    image: 'survival-rescue-banner.png',
    title: '🚁 Rodada 6 — A última chance',
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

function healthBar(hp, maxHp = MAX_HP) {
  const current = Math.max(0, Math.min(maxHp, hp));
  return `${'🟩'.repeat(current)}${'⬛'.repeat(maxHp - current)} ${current}/${maxHp}`;
}

function teamHealthBar(game) {
  const players = [...game.players.values()];
  if (!players.length) return '⬛⬛⬛⬛⬛ 0/0';
  const total = players.reduce((sum, player) => sum + Math.max(0, player.hp), 0);
  const maximum = players.length * MAX_HP;
  const segments = 5;
  const filled = Math.round((total / maximum) * segments);
  return `${'🟩'.repeat(filled)}${'⬛'.repeat(segments - filled)} ${total}/${maximum}`;
}

function playerList(game, includeHealth = false) {
  const players = [...game.players.values()];
  if (!players.length) return 'Ainda ninguém entrou. Seja o primeiro!';
  const visible = players.slice(0, 12).map(player => [
    `${player.alive ? '🟢' : '⚫'} ${playerName(player)}`,
    includeHealth ? `\`${healthBar(player.hp)}\`` : '',
  ].filter(Boolean).join(' '));
  const remaining = players.length - visible.length;
  if (remaining > 0) visible.push(`… e mais ${remaining}`);
  return visible.join('\n');
}

function formatStats(game) {
  const alive = activePlayers(game).length;
  const streak = game.teamStreak > 0 ? `  •  🔥 **${game.teamStreak}** em sequência` : '';
  return `👥 **${alive}/${game.players.size}** vivos  •  🧰 **${Math.max(0, game.supplies)}** suprimentos  •  📡 **${Math.max(0, game.signal)}** sinal  •  🫶 **${Math.max(0, game.morale)}** moral${streak}`;
}

const PERSONAL_ACTIONS = [
  { id: 'heal', label: 'Tratar ferida', emoji: '🩹' },
  { id: 'scout', label: 'Explorar bioma', emoji: '🔎' },
  { id: 'rally', label: 'Animar equipe', emoji: '📣' },
];

function personalActionButton(game, action) {
  const used = game.actions?.has(game.viewerId);
  return new ButtonBuilder()
    .setCustomId(`survival_action:${game.id}:${action.id}`)
    .setLabel(used ? 'Ação usada' : action.label)
    .setEmoji(action.emoji)
    .setStyle(used ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setDisabled(Boolean(used));
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
  const panel = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://survival-lobby-banner.png'),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# 🏕️ SOBREVIVÊNCIA: ILHA ZERO',
      'Um sinal de emergência foi detectado. Entrem no grupo e sobrevivam juntos até o resgate.',
      '',
      '**Como funciona**',
      'Vote em uma decisão por rodada. A maioria define o caminho, enquanto os riscos podem ferir ou eliminar sobreviventes.',
      '',
      `**👥 Participantes** ${game.players.size}/${MAX_PLAYERS}`,
      playerList(game),
      '',
      `**🎯 Objetivo** Sobreviver a ${SCENARIOS.length} rodadas e alcançar o resgate.`,
      `_Criada por ${game.hostName}_`,
    ].join('\n')));

  return {
    files: [new AttachmentBuilder(assetPath('survival-lobby-banner.png'), { name: 'survival-lobby-banner.png' })],
    components: [panel,
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
        new ButtonBuilder()
          .setCustomId(`survival_tag:${game.id}`)
          .setLabel('Marcar participantes')
          .setEmoji('📣')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(game.players.size === 0),
        new ButtonBuilder()
          .setCustomId(`survival_close:${game.id}`)
          .setLabel('Fechar expedição')
          .setEmoji('🛑')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildRoundPayload(game) {
  const scenario = scenarioFor(game);
  const counts = choiceCounts(game, scenario);
  const alive = activePlayers(game);
  const voted = game.votes.size;
  const history = game.history.at(-1);

  const panel = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${scenario.image}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# ${scenario.title} · ${game.round + 1}/${SCENARIOS.length}`,
      `**🗺️ Bioma:** ${scenario.biome}`,
      scenario.text,
      history ? `**Último acontecimento** ${game.history.at(-1)}` : '',
      '',
      `**Votação** ${voted}/${alive.length} sobreviventes já escolheram.`,
      `**${formatStats(game)}**`,
      `**❤️ Vida da equipe** ${teamHealthBar(game)}`,
      '',
      '**🧭 Expedição**',
      playerList(game, true),
      '',
      '💬 Cada pessoa pode fazer uma ação e votar. A rodada fecha em 30s ou quando todos escolherem.',
    ].filter(Boolean).join('\n')));

  const rows = [];
  for (let i = 0; i < scenario.choices.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      scenario.choices.slice(i, i + 5).map(choice => choiceButton(game, choice, counts)),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    PERSONAL_ACTIONS.map(action => personalActionButton(game, action)),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`survival_status:${game.id}`)
      .setLabel('Ver situação')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`survival_tag:${game.id}`)
      .setLabel('Marcar participantes')
      .setEmoji('📣')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`survival_close:${game.id}`)
      .setLabel('Fechar expedição')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger),
  ));

  return {
    components: [panel, ...rows],
    files: [new AttachmentBuilder(assetPath(scenario.image), { name: scenario.image })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildFinishedPayload(game) {
  const won = game.result === 'won';
  const alive = activePlayers(game);
  const panel = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${game.resultImage}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# ${won ? '🚁 RESGATE CONFIRMADO!' : '🌑 A ILHA VENCEU'}`,
      won
        ? `O sinal alcançou o continente. **${alive.length}** sobrevivente(s) saíram da ilha!`
        : `O grupo perdeu o sinal. A expedição terminou com **${alive.length}** sobrevivente(s).`,
      '',
      `**🏆 Resultado** ${won ? 'Vitória cooperativa' : 'Derrota coletiva'}`,
      `**🧰 Suprimentos** ${Math.max(0, game.supplies)}  •  **📡 Sinal** ${Math.max(0, game.signal)}`,
      `**🎁 Recompensa** ${won ? '750 moedas para vivos • 250 para eliminados' : '150 moedas pela participação'}`,
      `**❤️ Vida da equipe** ${teamHealthBar(game)}`,
      '',
      `**Últimos acontecimentos**\n${game.history.slice(-4).join('\n')}`,
      '',
      'Uma nova expedição pode ser criada quando esta partida terminar.',
    ].join('\n')));

  return {
    components: [panel],
    files: [new AttachmentBuilder(assetPath(game.resultImage), { name: game.resultImage })],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function buildSurvivalPayload(game) {
  if (game.stage === 'lobby') return buildLobbyPayload(game);
  if (game.stage === 'finished') return buildFinishedPayload(game);
  return buildRoundPayload(game);
}

async function deleteTemporaryChannel(game, reason = 'Expedição de sobrevivência encerrada') {
  if (!game.temporaryChannel || !game.client || !game.channelId) return;
  try {
    const channel = game.client.channels.cache.get(game.channelId)
      ?? await game.client.channels.fetch(game.channelId).catch(() => null);
    if (channel) await channel.delete(reason);
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

export async function closeSurvivalGame(gameId, reason = 'Expedição fechada pelo organizador') {
  const game = games.get(gameId);
  if (!game) return false;
  clearTimeout(game.timer);
  games.delete(gameId);
  await deleteTemporaryChannel(game, reason);
  return true;
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
    teamStreak: 0,
    actions: new Map(),
    history: [],
    timer: null,
    result: null,
    resultImage: 'survival-rescue-banner.png',
    rewardsPaid: false,
    lastTagAt: 0,
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

async function publishGameMessage(client, game) {
  try {
    const channel = client.channels.cache.get(game.channelId)
      ?? await client.channels.fetch(game.channelId).catch(() => null);
    if (!channel) return null;

    if (game.messageId) {
      const previousMessage = await channel.messages.fetch(game.messageId).catch(() => null);
      if (previousMessage) {
        await previousMessage.edit({ components: [] }).catch(error => {
          console.error('[SURVIVAL] Falha ao arquivar painel anterior:', error.message);
        });
      }
    }

    const message = await channel.send(buildSurvivalPayload(game));
    game.messageId = message.id;
    return message;
  } catch (error) {
    console.error('[SURVIVAL] Falha ao publicar capítulo:', error.message);
    return null;
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
  const unanimous = alive.length > 0
    && alive.every(player => game.votes.get(player.userId) === choice.id);

  if (unanimous) {
    game.teamStreak += 1;
    game.morale += 1;
    events.push(`🤝 Decisão unânime! A equipe ganhou confiança (${game.teamStreak} em sequência).`);
    if (game.teamStreak >= 2) {
      game.supplies += 1;
      events.push('🔥 A sintonia do grupo rendeu um suprimento extra.');
    }
  } else {
    if (game.teamStreak > 0) events.push('💔 O grupo se dividiu e perdeu a sequência de cooperação.');
    game.teamStreak = 0;
  }

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

  const twists = [
    { text: '🗺️ Um mapa antigo apareceu entre os destroços.', supplies: 1 },
    { text: '📻 Um ruído estranho veio do rádio e revelou uma direção.', signal: 1 },
    { text: '🌫️ Uma névoa pesada desorientou o grupo.', morale: -1 },
    { text: '🍃 A ilha escondeu frutas seguras perto do acampamento.', supplies: 1, morale: 1 },
  ];
  if (Math.random() < 0.3) {
    const twist = twists[Math.floor(Math.random() * twists.length)];
    game.supplies = Math.max(0, game.supplies + (twist.supplies ?? 0));
    game.signal = Math.max(0, game.signal + (twist.signal ?? 0));
    game.morale = Math.max(0, game.morale + (twist.morale ?? 0));
    events.push(twist.text);
  }

  game.history.push(events.join(' '));
}

function applyPersonalAction(game, player, actionId) {
  game.actions ??= new Map();
  if (game.actions.has(player.userId)) {
    return { ok: false, message: 'Você já usou sua ação nesta rodada.' };
  }

  let message;
  if (actionId === 'heal') {
    if (game.supplies < 1) {
      return { ok: false, message: 'Não há suprimentos para tratar feridas.' };
    }
    if (player.hp >= MAX_HP) {
      return { ok: false, message: 'Sua vida já está cheia.' };
    }
    game.supplies -= 1;
    player.hp = Math.min(MAX_HP, player.hp + 1);
    message = `🩹 **${playerName(player)}** tratou seus ferimentos. \`${healthBar(player.hp)}\``;
  } else if (actionId === 'scout') {
    const scenario = scenarioFor(game);
    const roll = Math.random();
    if (roll < 0.4) {
      game.supplies += 1;
      message = `🔎 **${playerName(player)}** explorou o bioma **${scenario.biome}** e encontrou suprimentos.`;
    } else if (roll < 0.75) {
      game.signal += 1;
      message = `🔎 **${playerName(player)}** encontrou um ponto alto no bioma **${scenario.biome}** e reforçou o sinal.`;
    } else {
      player.hp -= 1;
      if (player.hp <= 0) {
        player.alive = false;
        message = `⚠️ **${playerName(player)}** se perdeu durante a exploração e foi eliminado.`;
      } else {
        message = `🩹 **${playerName(player)}** voltou ferido da exploração. \`${healthBar(player.hp)}\``;
      }
    }
  } else if (actionId === 'rally') {
    game.morale = Math.min(8, game.morale + 1);
    message = `📣 **${playerName(player)}** animou a equipe. A moral subiu para **${game.morale}**.`;
  } else {
    return { ok: false, message: 'Ação inválida.' };
  }

  game.actions.set(player.userId, actionId);
  game.history.push(message);
  return { ok: true, message };
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
    game.resultImage = 'survival-storm-banner.png';
  } else if (game.round >= SCENARIOS.length - 1) {
    game.stage = 'finished';
    game.result = game.signal >= 3 || game.morale >= 5 ? 'won' : 'lost';
    game.resultImage = game.result === 'won' ? 'survival-rescue-banner.png' : 'survival-cave-banner.png';
  } else {
    game.round += 1;
    scheduleRound(client, game);
  }

  if (game.stage === 'finished') {
    await rewardPlayers(game);
    clearTimeout(game.timer);
    game.timer = setTimeout(() => expireGame(game), 15 * 60 * 1000);
  }

  game.actions.clear();
  await publishGameMessage(client, game);
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

    const player = {
      userId: interaction.user.id,
      username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
      hp: MAX_HP,
      alive: true,
    };
    game.players.set(interaction.user.id, player);
    try {
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
      });
    } catch (error) {
      game.players.delete(interaction.user.id);
      console.error('[SURVIVAL] Falha ao liberar chat para participante:', error.message);
      return interaction.reply({
        content: '❌ Você entrou, mas não consegui liberar sua permissão de fala neste canal.',
        ephemeral: true,
      });
    }
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_leave') {
    if (game.stage !== 'lobby') return interaction.reply({ content: '❌ Depois que começa, não dá para abandonar a expedição.', ephemeral: true });
    if (interaction.user.id === game.hostId) return interaction.reply({ content: '❌ O organizador não pode sair. Cancele a mensagem ou inicie a partida.', ephemeral: true });
    if (!game.players.delete(interaction.user.id)) return interaction.reply({ content: '❌ Você ainda não entrou.', ephemeral: true });
    await interaction.channel.permissionOverwrites.delete(interaction.user.id).catch(error => {
      console.error('[SURVIVAL] Falha ao remover permissão do participante:', error.message);
    });
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_start') {
    if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas quem criou a expedição pode iniciá-la.', ephemeral: true });
    if (game.players.size < MIN_PLAYERS) return interaction.reply({ content: `❌ São necessários pelo menos ${MIN_PLAYERS} participantes.`, ephemeral: true });

    game.stage = 'round';
    game.round = 0;
    game.votes.clear();
    game.actions.clear();
    scheduleRound(interaction.client, game);
    await interaction.deferUpdate();
    await publishGameMessage(interaction.client, game);
    return;
  }

  if (action === 'survival_action') {
    if (game.stage !== 'round') return interaction.reply({ content: '❌ As ações só ficam disponíveis durante uma rodada.', ephemeral: true });
    const player = game.players.get(interaction.user.id);
    if (!player) return interaction.reply({ content: '❌ Você precisa clicar em **Participar** antes.', ephemeral: true });
    if (!player.alive) return interaction.reply({ content: '❌ Você foi eliminado da expedição.', ephemeral: true });

    const result = applyPersonalAction(game, player, choiceId);
    if (!result.ok) return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
    if (!activePlayers(game).length) {
      await interaction.deferUpdate();
      return resolveRound(interaction.client, game);
    }
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_status') {
    const player = game.players.get(interaction.user.id);
    const status = player
      ? `${player.alive ? '🟢 Vivo' : '⚫ Eliminado'} • ❤️ ${healthBar(player.hp)}`
      : 'Você está assistindo à expedição.';
    return interaction.reply({
      content: `**📊 Situação da expedição**\n${status}\n${formatStats(game)}\n❤️ **Vida da equipe** ${teamHealthBar(game)}\n\n${playerList(game, true)}`,
      ephemeral: true,
    });
  }

  if (action === 'survival_tag') {
    if (interaction.user.id !== game.hostId) {
      return interaction.reply({ content: '❌ Apenas quem criou a expedição pode marcar os participantes.', ephemeral: true });
    }
    if (!game.players.size) return interaction.reply({ content: '❌ Ainda não há participantes para marcar.', ephemeral: true });
    if (Date.now() - game.lastTagAt < 30_000) {
      return interaction.reply({ content: '⏳ Espere alguns segundos antes de marcar o grupo novamente.', ephemeral: true });
    }

    const userIds = [...game.players.keys()];
    game.lastTagAt = Date.now();
    await interaction.reply({ content: '📣 Participantes marcados no canal.', ephemeral: true });
    return interaction.channel.send({
      content: `📣 **Expedição ${game.stage === 'lobby' ? 'aguardando começar' : 'em andamento'}!** ${userIds.map(userId => `<@${userId}>`).join(' ')}`,
      allowedMentions: { users: userIds },
    });
  }

  if (action === 'survival_close') {
    if (interaction.user.id !== game.hostId) {
      return interaction.reply({ content: '❌ Apenas quem criou a expedição pode fechá-la.', ephemeral: true });
    }
    await interaction.reply({ content: '🛑 Expedição fechada. O canal temporário será removido.', ephemeral: true });
    await closeSurvivalGame(game.id);
    return;
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
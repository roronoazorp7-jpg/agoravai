import {
  ActionRowBuilder,
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from '../database/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = join(__dirname, '../../assets/survival');
const MIN_PLAYERS = 2;
const MAX_HP = 5;
const MAX_MORALE = 10;
const ESCAPE_PROGRESS_TARGET = 8;
const VOTE_TIMEOUT_MS = 45_000;
const GAME_TTL_MS = 60 * 60 * 1000;

const games = new Map();

const SCENARIOS = [
  {
    key: 'crash',
    biome: 'Destroços na nevasca',
    image: 'survival-crash-banner.png',
    title: '✈️ Rodada 1 — A queda',
    text: 'Um avião com 30 passageiros caiu durante uma nevasca. Apenas 24 sobreviveram, e a temperatura está despencando entre os destroços.',
    choices: [
      { id: 'cockpit', label: 'Vasculhar a cabine', emoji: '🧰', detail: 'Procura rádio, lanternas e o sinalizador.', supplies: 2, signal: 1, risk: 0.18, coldDamage: 1 },
      { id: 'cargo', label: 'Abrir o compartimento', emoji: '📦', detail: 'Pode haver comida e equipamentos, mas a fuselagem está instável.', supplies: 3, risk: 0.26, coldDamage: 1 },
      { id: 'clothes', label: 'Buscar roupas e cobertores', emoji: '🧥', detail: 'Protege os sobreviventes do frio e recupera a equipe.', morale: 1, healAll: 1, risk: 0.1 },
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

const EXTRA_CHOICES = {
  crash: [
    { id: 'beacon', label: 'Montar o sinalizador', emoji: '📡', detail: 'Reúne peças da cabine para tentar pedir ajuda.', signal: 2, progress: 1, risk: 0.2 },
    { id: 'windbreak', label: 'Construir um abrigo', emoji: '🏕️', detail: 'Protege contra a nevasca, mas consome materiais.', supplies: -1, morale: 1, progress: 1, risk: 0.08 },
    { id: 'wreckage', label: 'Desmontar os destroços', emoji: '🔧', detail: 'Recupera materiais antes que a neve cubra tudo.', supplies: 2, progress: 1, risk: 0.24 },
    { id: 'ridge', label: 'Subir até a crista', emoji: '🏔️', detail: 'Procura uma rota segura no meio da tempestade.', signal: 1, progress: 2, risk: 0.3 },
  ],
  mangrove: [
    { id: 'freshwater', label: 'Procurar água doce', emoji: '💧', detail: 'A maré esconde uma nascente atrás das raízes.', supplies: 2, morale: 1, progress: 1, risk: 0.18 },
    { id: 'canopy', label: 'Subir pelas árvores', emoji: '🌴', detail: 'Do alto, o grupo pode enxergar uma saída.', signal: 2, progress: 2, risk: 0.28 },
    { id: 'fish', label: 'Pescar no estuário', emoji: '🐟', detail: 'Garante comida, mas atrai predadores.', supplies: 2, progress: 0, risk: 0.22 },
    { id: 'roots_safe', label: 'Marcar o caminho', emoji: '🪢', detail: 'Cordas e marcas evitam que o grupo se perca.', progress: 2, morale: 1, risk: 0.1 },
  ],
  cave: [
    { id: 'underground', label: 'Seguir o rio subterrâneo', emoji: '🕳️', detail: 'A corrente pode levar a uma saída, se não arrastar ninguém.', progress: 2, supplies: -1, risk: 0.3 },
    { id: 'draw_map', label: 'Mapear as galerias', emoji: '🗺️', detail: 'Registra bifurcações para não voltar ao mesmo lugar.', progress: 1, signal: 1, risk: 0.12 },
    { id: 'echo', label: 'Testar os ecos', emoji: '🔊', detail: 'Sons distantes podem revelar uma abertura.', signal: 2, progress: 1, risk: 0.2 },
    { id: 'mushrooms', label: 'Coletar fungos', emoji: '🍄', detail: 'Alimento arriscado, mas talvez seja a única opção.', supplies: 2, risk: 0.25, morale: -1 },
  ],
  volcano: [
    { id: 'observatory', label: 'Alcançar o observatório', emoji: '🔭', detail: 'O posto abandonado pode ter mapas e um rádio.', signal: 2, progress: 2, risk: 0.34 },
    { id: 'cool_path', label: 'Seguir a trilha fria', emoji: '🧊', detail: 'Um desvio mais longo evita o fluxo de lava.', progress: 1, supplies: -1, risk: 0.12 },
    { id: 'ore', label: 'Recuperar ferramentas', emoji: '⛏️', detail: 'Ferramentas antigas ajudam a abrir uma passagem.', supplies: 1, progress: 1, risk: 0.2 },
    { id: 'wait_ash', label: 'Esperar a cinza baixar', emoji: '😷', detail: 'Poupa ferimentos, mas a ilha perde tempo e recursos.', morale: -1, supplies: -1, risk: 0.06 },
  ],
  tower: [
    { id: 'antenna', label: 'Consertar a antena', emoji: '📻', detail: 'Usa peças improvisadas para mandar uma mensagem completa.', signal: 3, progress: 2, supplies: -1, risk: 0.3 },
    { id: 'rope_bridge', label: 'Montar uma ponte', emoji: '🧗', detail: 'Atravessa um abismo, mas qualquer erro é fatal.', progress: 2, risk: 0.36 },
    { id: 'lookout', label: 'Observar o horizonte', emoji: '🔭', detail: 'Procura fumaça, embarcações ou uma rota menos íngreme.', signal: 1, progress: 1, risk: 0.16 },
    { id: 'camp', label: 'Reforçar o acampamento', emoji: '⛺', detail: 'Recupera forças antes da subida final.', morale: 2, supplies: -1, risk: 0.08 },
  ],
  rescue: [
    { id: 'shoreline', label: 'Seguir pela costa', emoji: '🏝️', detail: 'A maré baixa revelou marcas de passagem.', progress: 2, signal: 1, risk: 0.22 },
    { id: 'raft_rescue', label: 'Construir uma jangada', emoji: '🛶', detail: 'Atravessa até a ilha vizinha, onde há um farol.', progress: 2, supplies: -2, risk: 0.3 },
    { id: 'fireline', label: 'Manter uma fogueira', emoji: '🔥', detail: 'O fogo precisa ficar visível durante toda a noite.', signal: 2, supplies: -1, risk: 0.15 },
    { id: 'beach_search', label: 'Vasculhar a praia', emoji: '🧭', detail: 'Encontra destroços e talvez uma rota definitiva.', supplies: 1, progress: 1, risk: 0.2 },
  ],
};

for (const biome of SCENARIOS) {
  biome.choices = [...biome.choices, ...(EXTRA_CHOICES[biome.key] ?? [])];
}

const RANDOM_EVENTS = [
  { text: '🧳 Uma mochila esquecida apareceu sob a vegetação.', supplies: 2 },
  { text: '📻 O rádio captou três segundos de uma transmissão distante.', signal: 2, progress: 1 },
  { text: '🌧️ Uma chuva pesada apagou parte das marcas do caminho.', progress: -1, morale: -1 },
  { text: '🦀 Um animal roubou parte da comida durante a madrugada.', supplies: -2 },
  { text: '🪨 Um deslizamento abriu uma passagem nova, mas feriu alguém.', progress: 2, damage: 1 },
  { text: '🌫️ A neblina dividiu o grupo por alguns minutos.', morale: -2, damage: 1 },
  { text: '🍃 O grupo encontrou frutas seguras e recuperou o ânimo.', supplies: 1, morale: 2 },
  { text: '🧭 Uma bússola enferrujada apontou para uma rota promissora.', progress: 1, signal: 1 },
  { text: '🐍 Um animal venenoso foi encontrado no acampamento.', damage: 1, morale: -1 },
  { text: '🕯️ Uma marca antiga na pedra indica que alguém já escapou dali.', progress: 2, morale: 1 },
  { text: '🌬️ Uma rajada violenta levou equipamentos pelo desfiladeiro.', supplies: -1, signal: -1 },
  { text: '🩸 A água contaminada deixou parte do grupo debilitada.', damage: 1, supplies: -1 },
  { text: '🪵 Madeira seca apareceu depois da maré e reforçou o acampamento.', supplies: 1, morale: 1 },
  { text: '⚡ Um raio atingiu um ponto alto e iluminou a direção da saída.', signal: 2, progress: 1 },
  { text: '🤝 O grupo resolveu uma discussão e voltou a trabalhar unido.', morale: 2 },
  { text: '🕳️ O chão cedeu sob os pés de alguém.', damage: 1, progress: -1 },
  { text: '🚨 Um reflexo no horizonte pode ter sido um barco.', signal: 1, progress: 1 },
  { text: '🥶 A temperatura caiu de repente durante a noite.', damage: 1, supplies: -1 },
  { text: '🌋 Um tremor mudou a paisagem e revelou uma trilha.', progress: 2, risk: 0.25 },
  { text: '🧱 Um abrigo abandonado ofereceu ferramentas úteis.', supplies: 2, morale: 1 },
  { text: '🦅 Aves seguiram o grupo na direção do litoral.', progress: 1, morale: 1 },
  { text: '💥 Um ruído distante assustou todos e consumiu tempo.', morale: -2, progress: -1 },
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

function scenarioFor(game) {
  return SCENARIOS.find(scenario => scenario.key === game.biomeKey) ?? SCENARIOS[0];
}

function currentChoices(game) {
  return game.currentChoices?.length ? game.currentChoices : scenarioFor(game).choices.slice(0, 5);
}

function option(label, value, description, emoji, extra = {}) {
  return {
    label: String(label).slice(0, 100),
    value: String(value).slice(0, 100),
    description: String(description || '').slice(0, 100) || undefined,
    emoji,
    ...extra,
  };
}

function selectRow(customId, placeholder, options, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options)
      .setDisabled(disabled),
  );
}

function nextChoices(game) {
  const biome = scenarioFor(game);
  const recent = new Set(game.recentChoices.slice(-3));
  const pool = biome.choices.filter(choice => !recent.has(choice.id));
  const source = pool.length >= 4 ? pool : biome.choices;
  const choices = [...source].sort(() => Math.random() - 0.5).slice(0, 4);

  if (game.escapeProgress >= ESCAPE_PROGRESS_TARGET) {
    choices.push({
      id: 'escape',
      label: 'Tentar fugir do bioma',
      emoji: '🚁',
      detail: 'A rota parece possível, mas uma fuga mal planejada pode deixar o grupo preso.',
      escape: true,
      progress: 0,
      risk: 0.22,
    });
  }

  return choices;
}

function choiceCounts(game, scenario) {
  return new Map(
    currentChoices(game).map(choice => [
      choice.id,
      [...game.votes.values()].filter(value => value === choice.id).length,
    ]),
  );
}

function decisionOptions(game, counts) {
  const voted = game.votes.get(game.viewerId);
  const choices = currentChoices(game).map(choice => option(
    `${choice.label}${counts.get(choice.id) ? ` • ${counts.get(choice.id)} voto(s)` : ''}`,
    `choice:${choice.id}`,
    choice.detail,
    choice.emoji,
    { default: voted === choice.id },
  ));
  const actions = PERSONAL_ACTIONS.map(action => {
    const used = game.actions?.has(game.viewerId);
    return option(
      used ? `${action.label} (usada)` : action.label,
      `action:${action.id}`,
      used ? 'Você já usou sua ação nesta rodada.' : 'Ação individual, sem alterar a votação do grupo.',
      action.emoji,
      { disabled: Boolean(used) },
    );
  });
  return [...choices, ...actions];
}

function buildLobbyPayload(game) {
  const selectedBiome = scenarioFor(game);
  const panel = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://survival-lobby-banner.png'),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# 🏕️ SOBREVIVÊNCIA: ILHA ZERO',
      'Escolham um único bioma. A expedição inteira acontecerá nele, com acontecimentos imprevisíveis e sem limite artificial de rodadas ou participantes.',
      '',
      '**Como funciona**',
      'Primeiro selecione o bioma. Depois, cada rodada apresenta escolhas renovadas; a maioria define o caminho, os recursos acabam e eventos aleatórios podem mudar tudo.',
      '',
      `**🗺️ Bioma escolhido** ${game.biomeKey ? `${selectedBiome.emoji ?? '🌍'} ${selectedBiome.biome}` : 'Ainda não escolhido'}`,
      `**👥 Participantes** ${game.players.size}`,
      playerList(game),
      '',
      `**🎯 Objetivo** Construir uma rota até o nível ${ESCAPE_PROGRESS_TARGET} e fugir de verdade.`,
      `_Criada por ${game.hostName}_`,
    ].join('\n')));

  const biomeOptions = SCENARIOS.map(biome => option(
    biome.biome,
    biome.key,
    'Ficar neste bioma até encontrar uma rota de fuga.',
    biome.choices[0]?.emoji ?? '🌍',
    { default: game.biomeKey === biome.key },
  ));
  const lobbyOptions = [
    option('Participar da expedição', 'join', 'Entrar no grupo de sobreviventes.', '🏕️'),
    option('Sair da expedição', 'leave', 'Remover seu nome antes do início.', '🚪'),
    option('Iniciar partida', 'start', 'Exige um bioma escolhido e pelo menos dois participantes.', '🚀'),
    option('Marcar participantes', 'tag', 'Mencionar os sobreviventes no canal.', '📣', { disabled: game.players.size === 0 }),
    option('Fechar expedição', 'close', 'Cancelar a expedição e remover o canal temporário.', '🛑'),
  ];
  return {
    files: [new AttachmentBuilder(assetPath('survival-lobby-banner.png'), { name: 'survival-lobby-banner.png' })],
    components: [
      panel,
      selectRow(`survival_biome:${game.id}`, 'Escolha o único bioma desta partida', biomeOptions),
      selectRow(`survival_lobby:${game.id}`, 'Ações da sala de espera', lobbyOptions),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildRoundPayload(game) {
  const scenario = scenarioFor(game);
  const counts = choiceCounts(game, scenario);
  const alive = activePlayers(game);
  const voted = game.votes.size;
  const history = game.history.slice(-2).join('\n');
  const escapeStatus = game.escapeProgress >= ESCAPE_PROGRESS_TARGET
    ? '🚁 A rota de fuga está pronta. A opção de fuga aparecerá no menu.'
    : `🧭 Progresso da rota: **${game.escapeProgress}/${ESCAPE_PROGRESS_TARGET}**`;

  const panel = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${scenario.image}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `# ${scenario.emoji ?? '🌍'} ${scenario.biome} · Rodada ${game.round + 1}`,
      `**🗺️ Bioma:** ${scenario.biome}`,
      game.currentPrompt || scenario.text,
      history ? `**Acontecimentos recentes**\n${history}` : '',
      '',
      `**Votação** ${voted}/${alive.length} sobreviventes já escolheram.`,
      `**${formatStats(game)}**`,
      `**❤️ Vida da equipe** ${teamHealthBar(game)}`,
      `**${escapeStatus}**`,
      '',
      '**🧭 Expedição**',
      playerList(game, true),
      '',
      '💬 Abra o menu e escolha uma decisão do grupo ou uma ação individual. A rodada fecha em 45s ou quando todos votarem.',
    ].filter(Boolean).join('\n')));

  return {
    components: [
      panel,
      selectRow(`survival_decision:${game.id}`, 'Escolha uma decisão ou ação individual', decisionOptions(game, counts)),
      selectRow(`survival_control:${game.id}`, 'Controles da expedição', [
        option('Ver situação', 'status', 'Abrir seus dados e o estado da equipe.', '📊'),
        option('Marcar participantes', 'tag', 'Disponível para o organizador.', '📣'),
        option('Fechar expedição', 'close', 'Disponível para o organizador.', '🛑'),
      ]),
    ],
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
    biomeKey: null,
    currentChoices: [],
    currentPrompt: null,
    escapeProgress: 0,
    recentChoices: [],
    players: new Map(),
    votes: new Map(),
    supplies: 3,
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
  const winners = currentChoices(game).filter(choice => counts.get(choice.id) === max);
  return winners[Math.floor(Math.random() * winners.length)] ?? currentChoices(game)[0];
}

function injureRandomPlayer(game, amount, events, reason) {
  const alive = activePlayers(game);
  if (!alive.length) return;
  const victim = alive[Math.floor(Math.random() * alive.length)];
  victim.hp -= amount;
  if (victim.hp <= 0) {
    victim.alive = false;
    events.push(`💀 **${playerName(victim)}** ${reason} e foi eliminado.`);
  } else {
    events.push(`🩹 **${playerName(victim)}** ${reason}. \`${healthBar(victim.hp)}\``);
  }
}

function applyRandomEvent(game, events) {
  if (Math.random() > Math.min(0.8, 0.42 + (game.round * 0.018))) return;
  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  game.supplies = Math.max(0, game.supplies + (event.supplies ?? 0));
  game.signal = Math.max(0, game.signal + (event.signal ?? 0));
  game.morale = Math.max(0, Math.min(MAX_MORALE, game.morale + (event.morale ?? 0)));
  game.escapeProgress = Math.max(0, Math.min(ESCAPE_PROGRESS_TARGET, game.escapeProgress + (event.progress ?? 0)));
  events.push(event.text);
  if (event.damage) injureRandomPlayer(game, event.damage, events, 'foi atingido pelo acontecimento');
  if (event.risk && Math.random() < event.risk) injureRandomPlayer(game, 1, events, 'se feriu no caos');
}

async function applyChoice(game, scenario, choice) {
  const events = [`A maioria escolheu **${choice.label}**.`];
  const aliveBefore = activePlayers(game);
  const unanimous = aliveBefore.length > 0
    && aliveBefore.every(player => game.votes.get(player.userId) === choice.id);

  if (choice.escape) {
    const readiness = Math.min(0.92, 0.35
      + (game.signal * 0.045)
      + (game.supplies * 0.025)
      + (game.morale * 0.03)
      + (unanimous ? 0.12 : 0));
    if (Math.random() < readiness) {
      game.result = 'won';
      game.resultImage = 'survival-rescue-banner.png';
      events.push(`🚁 A fuga funcionou: o grupo alcançou uma rota segura e deixou o bioma após ${game.round + 1} rodada(s).`);
    } else {
      game.escapeProgress = Math.max(0, game.escapeProgress - 2);
      game.supplies = Math.max(0, game.supplies - 1);
      events.push('🌊 A tentativa de fuga falhou. A rota desabou antes de o grupo conseguir sair; será preciso reconstruir o caminho.');
      injureRandomPlayer(game, 1, events, 'se feriu na fuga frustrada');
    }
  } else {
    game.supplies = Math.max(0, game.supplies + (choice.supplies ?? 0) - 1);
    game.signal = Math.max(0, game.signal + (choice.signal ?? 0));
    game.morale = Math.max(0, Math.min(MAX_MORALE, game.morale + (choice.morale ?? 0)));
    game.escapeProgress = Math.max(0, Math.min(ESCAPE_PROGRESS_TARGET, game.escapeProgress + (choice.progress ?? 0)));

    if (choice.healAll) {
      const healed = activePlayers(game).filter(player => player.hp < MAX_HP);
      healed.forEach(player => {
        player.hp = Math.min(MAX_HP, player.hp + choice.healAll);
      });
      events.push(healed.length
        ? `🧥 Roupas e cobertores protegeram **${healed.length}** sobrevivente(s).`
        : '🧥 O grupo já estava aquecido e guardou os cobertores.');
    }

    if (choice.coldDamage) injureRandomPlayer(game, choice.coldDamage, events, 'perdeu forças para o frio');

    if (unanimous) {
      game.teamStreak += 1;
      game.morale = Math.min(MAX_MORALE, game.morale + 1);
      events.push(`🤝 Decisão unânime! A equipe ganhou confiança (${game.teamStreak} em sequência).`);
      if (game.teamStreak >= 2) {
        game.supplies += 1;
        events.push('🔥 A sintonia do grupo rendeu um suprimento extra.');
      }
    } else {
      if (game.teamStreak > 0) events.push('💔 O grupo se dividiu e perdeu a sequência de cooperação.');
      game.teamStreak = 0;
    }

    const escalatingRisk = Math.min(0.86, (choice.risk ?? 0) + (game.round * 0.018) - (game.morale * 0.008));
    if (Math.random() < escalatingRisk) {
      injureRandomPlayer(game, 1, events, 'se feriu durante a decisão');
    }

    if (game.supplies === 0 && activePlayers(game).length) {
      injureRandomPlayer(game, 1, events, 'ficou sem forças por falta de suprimentos');
    }

    applyRandomEvent(game, events);
  }

  game.recentChoices.push(choice.id);
  if (game.recentChoices.length > 8) game.recentChoices.shift();
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
    game.morale = Math.min(MAX_MORALE, game.morale + 1);
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
    game.resultImage = 'survival-crash-banner.png';
  } else if (game.result === 'won') {
    game.stage = 'finished';
  } else {
    game.round += 1;
    game.currentChoices = nextChoices(game);
    game.currentPrompt = scenario.text;
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
  const selected = interaction.isStringSelectMenu() ? interaction.values[0] : choiceId;
  const game = getGame(gameId);
  if (!game || game.guildId !== interaction.guildId) {
    return interaction.reply({ content: '❌ Esta expedição não existe mais.', ephemeral: true });
  }

  if (action === 'survival_biome') {
    if (game.stage !== 'lobby') return interaction.reply({ content: '❌ O bioma não pode mais ser alterado.', ephemeral: true });
    if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas quem criou a expedição escolhe o bioma.', ephemeral: true });
    if (game.biomeKey) return interaction.reply({ content: '✅ O bioma desta partida já foi escolhido e não pode ser trocado.', ephemeral: true });
    const biome = SCENARIOS.find(item => item.key === selected);
    if (!biome) return interaction.reply({ content: '❌ Bioma inválido.', ephemeral: true });
    game.biomeKey = biome.key;
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_lobby') {
    if (selected === 'join') {
      if (game.stage !== 'lobby') return interaction.reply({ content: '❌ A partida já começou.', ephemeral: true });
      if (game.players.has(interaction.user.id)) return interaction.reply({ content: '✅ Você já está na expedição.', ephemeral: true });

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

    if (selected === 'leave') {
      if (game.stage !== 'lobby') return interaction.reply({ content: '❌ Depois que começa, não dá para abandonar a expedição.', ephemeral: true });
      if (interaction.user.id === game.hostId) return interaction.reply({ content: '❌ O organizador não pode sair.', ephemeral: true });
      if (!game.players.delete(interaction.user.id)) return interaction.reply({ content: '❌ Você ainda não entrou.', ephemeral: true });
      await interaction.channel.permissionOverwrites.delete(interaction.user.id).catch(error => {
        console.error('[SURVIVAL] Falha ao remover permissão do participante:', error.message);
      });
      return interaction.update(buildSurvivalPayload(game));
    }

    if (selected === 'start') {
      if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Apenas quem criou a expedição pode iniciá-la.', ephemeral: true });
      if (!game.biomeKey) return interaction.reply({ content: '❌ Escolha um único bioma antes de iniciar.', ephemeral: true });
      if (game.players.size < MIN_PLAYERS) return interaction.reply({ content: `❌ São necessários pelo menos ${MIN_PLAYERS} participantes.`, ephemeral: true });
      game.stage = 'round';
      game.round = 0;
      game.escapeProgress = 0;
      game.votes.clear();
      game.actions.clear();
      game.currentChoices = nextChoices(game);
      game.currentPrompt = scenarioFor(game).text;
      scheduleRound(interaction.client, game);
      await interaction.deferUpdate();
      await publishGameMessage(interaction.client, game);
      return;
    }

    if (selected === 'tag') {
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

    if (selected === 'close') {
      if (interaction.user.id !== game.hostId) {
        return interaction.reply({ content: '❌ Apenas quem criou a expedição pode fechá-la.', ephemeral: true });
      }
      await interaction.reply({ content: '🛑 Expedição fechada. O canal temporário será removido.', ephemeral: true });
      await closeSurvivalGame(game.id);
      return;
    }
  }

  if (action === 'survival_decision') {
    if (selected?.startsWith('action:')) {
      const player = game.players.get(interaction.user.id);
      if (game.stage !== 'round') return interaction.reply({ content: '❌ As ações só ficam disponíveis durante uma rodada.', ephemeral: true });
      if (!player) return interaction.reply({ content: '❌ Você precisa participar antes.', ephemeral: true });
      if (!player.alive) return interaction.reply({ content: '❌ Você foi eliminado da expedição.', ephemeral: true });
      const result = applyPersonalAction(game, player, selected.slice(7));
      if (!result.ok) return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
      if (!activePlayers(game).length) {
        await interaction.deferUpdate();
        return resolveRound(interaction.client, game);
      }
      return interaction.update(buildSurvivalPayload(game));
    }

    if (!selected?.startsWith('choice:')) return interaction.reply({ content: '❌ Decisão inválida.', ephemeral: true });
    if (game.stage !== 'round') return interaction.reply({ content: '❌ A votação não está aberta.', ephemeral: true });
    const player = game.players.get(interaction.user.id);
    if (!player) return interaction.reply({ content: '❌ Você precisa participar antes.', ephemeral: true });
    if (!player.alive) return interaction.reply({ content: '❌ Você foi eliminado da expedição.', ephemeral: true });
    const selectedChoiceId = selected.slice(7);
    if (!currentChoices(game).some(choice => choice.id === selectedChoiceId)) return interaction.reply({ content: '❌ Essa decisão não está mais disponível.', ephemeral: true });

    game.votes.set(interaction.user.id, selectedChoiceId);
    if (game.votes.size >= activePlayers(game).length) {
      await interaction.deferUpdate();
      return resolveRound(interaction.client, game);
    }
    return interaction.update(buildSurvivalPayload(game));
  }

  if (action === 'survival_control') {
    if (selected === 'status') {
      const player = game.players.get(interaction.user.id);
      const status = player
        ? `${player.alive ? '🟢 Vivo' : '⚫ Eliminado'} • ❤️ ${healthBar(player.hp)}`
        : 'Você está assistindo à expedição.';
      return interaction.reply({
        content: `**📊 Situação da expedição**\n${status}\n${formatStats(game)}\n🧭 **Rota** ${game.escapeProgress}/${ESCAPE_PROGRESS_TARGET}\n❤️ **Vida da equipe** ${teamHealthBar(game)}\n\n${playerList(game, true)}`,
        ephemeral: true,
      });
    }
    if (selected === 'tag') {
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
        content: `📣 **Expedição em andamento!** ${userIds.map(userId => `<@${userId}>`).join(' ')}`,
        allowedMentions: { users: userIds },
      });
    }
    if (selected === 'close') {
      if (interaction.user.id !== game.hostId) {
        return interaction.reply({ content: '❌ Apenas quem criou a expedição pode fechá-la.', ephemeral: true });
      }
      await interaction.reply({ content: '🛑 Expedição fechada. O canal temporário será removido.', ephemeral: true });
      await closeSurvivalGame(game.id);
      return;
    }
  }

  if (action === 'survival_join') {
    if (game.stage !== 'lobby') return interaction.reply({ content: '❌ A partida já começou.', ephemeral: true });
    if (game.players.has(interaction.user.id)) return interaction.reply({ content: '✅ Você já está na expedição.', ephemeral: true });
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
    if (!game.biomeKey) return interaction.reply({ content: '❌ Escolha um único bioma antes de iniciar.', ephemeral: true });
    if (game.players.size < MIN_PLAYERS) return interaction.reply({ content: `❌ São necessários pelo menos ${MIN_PLAYERS} participantes.`, ephemeral: true });

    game.stage = 'round';
    game.round = 0;
    game.votes.clear();
    game.actions.clear();
    game.currentChoices = nextChoices(game);
    game.currentPrompt = scenarioFor(game).text;
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
    if (!currentChoices(game).some(choice => choice.id === choiceId)) return interaction.reply({ content: '❌ Escolha inválida.', ephemeral: true });

    game.votes.set(interaction.user.id, choiceId);
    if (game.votes.size >= activePlayers(game).length) {
      await interaction.deferUpdate();
      return resolveRound(interaction.client, game);
    }
    return interaction.update(buildSurvivalPayload(game));
  }

  return interaction.reply({ content: '❌ Ação da expedição inválida.', ephemeral: true });
}
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
  TextDisplayBuilder,
} from 'discord.js';
import { fileURLToPath } from 'node:url';
import prisma from '../database/client.js';
import { getEmoji } from './emojiManager.js';

const MAX_PLAYERS = 10;
const TURN_TIME_MS = 30_000;
const LOBBY_TIME_MS = 120_000;
const MAX_TURNS = 40;
const COIN = () => getEmoji('futecoins');
const MILHAO_BANNER_PATH = fileURLToPath(new URL('../assets/milhao-banner.png', import.meta.url));
const MILHAO_BANNER_NAME = 'milhao-banner.png';

const PRIZES = [
  100,
  250,
  500,
  1_000,
  2_500,
  5_000,
  10_000,
  25_000,
  50_000,
  100_000,
  250_000,
  500_000,
  1_000_000,
];

const ANSWER_EMOJIS = ['🅰️', '🅱️', '🆑', '🆎'];
const games = new Map();
let nextGameId = 1;

// Perguntas curadas em níveis para que o prêmio cresça junto com a dificuldade.
const QUESTION_BANK = Object.freeze([
  { id: 'easy-01', tier: 0, prompt: 'Qual é a capital do Brasil?', options: ['Brasília', 'São Paulo', 'Rio de Janeiro', 'Salvador'], answer: 0 },
  { id: 'easy-02', tier: 0, prompt: 'Quantos dias tem uma semana?', options: ['5', '6', '7', '8'], answer: 2 },
  { id: 'easy-03', tier: 0, prompt: 'Qual planeta é conhecido como Planeta Vermelho?', options: ['Vênus', 'Marte', 'Júpiter', 'Mercúrio'], answer: 1 },
  { id: 'easy-04', tier: 0, prompt: 'Qual é o resultado de 5 × 6?', options: ['11', '25', '30', '35'], answer: 2 },
  { id: 'easy-05', tier: 0, prompt: 'Qual destes animais é um mamífero?', options: ['Tubarão', 'Pinguim', 'Golfinho', 'Tartaruga'], answer: 2 },
  { id: 'easy-06', tier: 0, prompt: 'A que temperatura a água congela, ao nível do mar?', options: ['0 °C', '10 °C', '50 °C', '100 °C'], answer: 0 },
  { id: 'easy-07', tier: 0, prompt: 'Quantos dias tem um ano comum?', options: ['300', '360', '365', '400'], answer: 2 },
  { id: 'easy-08', tier: 0, prompt: 'Qual é o maior planeta do Sistema Solar?', options: ['Terra', 'Saturno', 'Júpiter', 'Netuno'], answer: 2 },
  { id: 'easy-09', tier: 0, prompt: 'Qual cor resulta da mistura de azul e amarelo?', options: ['Roxo', 'Laranja', 'Verde', 'Marrom'], answer: 2 },
  { id: 'easy-10', tier: 0, prompt: 'Quantos lados tem um triângulo?', options: ['2', '3', '4', '5'], answer: 1 },
  { id: 'easy-11', tier: 0, prompt: 'Qual é a moeda oficial do Brasil?', options: ['Real', 'Peso', 'Dólar', 'Euro'], answer: 0 },
  { id: 'easy-12', tier: 0, prompt: 'O Sol é classificado como o quê?', options: ['Planeta', 'Estrela', 'Satélite', 'Cometa'], answer: 1 },
  { id: 'easy-13', tier: 0, prompt: 'Qual dia vem depois de terça-feira?', options: ['Segunda-feira', 'Quinta-feira', 'Quarta-feira', 'Sexta-feira'], answer: 2 },
  { id: 'easy-14', tier: 0, prompt: 'A que temperatura a água ferve, ao nível do mar?', options: ['50 °C', '75 °C', '100 °C', '120 °C'], answer: 2 },
  { id: 'easy-15', tier: 0, prompt: 'Qual destes animais é conhecido por botar ovos?', options: ['Cachorro', 'Galinha', 'Gato', 'Cavalo'], answer: 1 },
  { id: 'basic-01', tier: 1, prompt: 'Qual elemento químico é representado pela sigla O?', options: ['Ouro', 'Oxigênio', 'Ósmio', 'Ozônio'], answer: 1 },
  { id: 'basic-02', tier: 1, prompt: 'Quem escreveu “O Pequeno Príncipe”?', options: ['Machado de Assis', 'Júlio Verne', 'Antoine de Saint-Exupéry', 'Monteiro Lobato'], answer: 2 },
  { id: 'basic-03', tier: 1, prompt: 'Qual é o maior oceano da Terra?', options: ['Atlântico', 'Índico', 'Ártico', 'Pacífico'], answer: 3 },
  { id: 'basic-04', tier: 1, prompt: 'Qual instrumento mede a temperatura?', options: ['Barômetro', 'Termômetro', 'Higrômetro', 'Anemômetro'], answer: 1 },
  { id: 'basic-05', tier: 1, prompt: 'Em que ano o Brasil declarou sua independência?', options: ['1500', '1789', '1822', '1889'], answer: 2 },
  { id: 'basic-06', tier: 1, prompt: 'Qual é o maior órgão do corpo humano?', options: ['Fígado', 'Pele', 'Coração', 'Pulmão'], answer: 1 },
  { id: 'basic-07', tier: 1, prompt: 'Qual substância é representada pela fórmula H₂O?', options: ['Água', 'Oxigênio', 'Sal', 'Hidrogênio'], answer: 0 },
  { id: 'basic-08', tier: 1, prompt: 'Quantos meses tem um ano?', options: ['10', '11', '12', '13'], answer: 2 },
  { id: 'basic-09', tier: 1, prompt: 'Quem foi o primeiro ser humano a pisar na Lua?', options: ['Yuri Gagarin', 'Neil Armstrong', 'Buzz Aldrin', 'Alan Shepard'], answer: 1 },
  { id: 'basic-10', tier: 1, prompt: 'Qual é a capital da França?', options: ['Paris', 'Roma', 'Madri', 'Lisboa'], answer: 0 },
  { id: 'basic-11', tier: 1, prompt: 'Em qual continente fica o Egito?', options: ['África', 'Ásia', 'Europa', 'Oceania'], answer: 0 },
  { id: 'basic-12', tier: 1, prompt: 'Qual proteína dá a cor vermelha ao sangue?', options: ['Insulina', 'Queratina', 'Colágeno', 'Hemoglobina'], answer: 3 },
  { id: 'basic-13', tier: 1, prompt: 'Qual instrumento mede a pressão atmosférica?', options: ['Termômetro', 'Higrômetro', 'Barômetro', 'Anemômetro'], answer: 2 },
  { id: 'basic-14', tier: 1, prompt: 'Quem escreveu o romance “Dom Casmurro”?', options: ['José de Alencar', 'Machado de Assis', 'Lima Barreto', 'Jorge Amado'], answer: 1 },
  { id: 'basic-15', tier: 1, prompt: 'Qual é o satélite natural da Terra?', options: ['Lua', 'Marte', 'Sol', 'Vênus'], answer: 0 },
  { id: 'medium-01', tier: 2, prompt: 'Qual é o símbolo químico do ouro?', options: ['Ag', 'Au', 'Fe', 'O'], answer: 1 },
  { id: 'medium-02', tier: 2, prompt: 'Quantos lados tem um octógono?', options: ['6', '7', '8', '10'], answer: 2 },
  { id: 'medium-03', tier: 2, prompt: 'Quem pintou a Mona Lisa?', options: ['Michelangelo', 'Leonardo da Vinci', 'Van Gogh', 'Pablo Picasso'], answer: 1 },
  { id: 'medium-04', tier: 2, prompt: 'Qual é a unidade de medida da força no Sistema Internacional?', options: ['Joule', 'Watt', 'Pascal', 'Newton'], answer: 3 },
  { id: 'medium-05', tier: 2, prompt: 'Qual é o maior bioma brasileiro em extensão?', options: ['Cerrado', 'Caatinga', 'Amazônia', 'Pantanal'], answer: 2 },
  { id: 'medium-06', tier: 2, prompt: 'Aproximadamente, qual é a velocidade da luz no vácuo?', options: ['30 mil km/s', '300 mil km/s', '3 milhões km/s', '3 mil km/s'], answer: 1 },
  { id: 'medium-07', tier: 2, prompt: 'Qual é o maior deserto quente do mundo?', options: ['Gobi', 'Atacama', 'Saara', 'Kalahari'], answer: 2 },
  { id: 'medium-08', tier: 2, prompt: 'Qual é o valor aproximado do pH de uma solução neutra?', options: ['0', '5', '7', '14'], answer: 2 },
  { id: 'medium-09', tier: 2, prompt: 'Quantos estados possui o Brasil?', options: ['24', '25', '26', '27'], answer: 2 },
  { id: 'medium-10', tier: 2, prompt: 'Em qual país teve início o movimento cultural conhecido como Renascimento?', options: ['Itália', 'França', 'Grécia', 'Inglaterra'], answer: 0 },
  { id: 'medium-11', tier: 2, prompt: 'Quem escreveu “Os Lusíadas”?', options: ['Fernando Pessoa', 'Eça de Queirós', 'Gil Vicente', 'Luís de Camões'], answer: 3 },
  { id: 'medium-12', tier: 2, prompt: 'Qual é o maior país do mundo em extensão territorial?', options: ['Canadá', 'Rússia', 'China', 'Estados Unidos'], answer: 1 },
  { id: 'medium-13', tier: 2, prompt: 'Em qual camada da atmosfera se concentra a maior parte do ozônio?', options: ['Troposfera', 'Mesosfera', 'Estratosfera', 'Termosfera'], answer: 2 },
  { id: 'medium-14', tier: 2, prompt: 'Qual é o valor decimal do número binário 111?', options: ['5', '7', '8', '9'], answer: 1 },
  { id: 'medium-15', tier: 2, prompt: 'Qual é aproximadamente a aceleração da gravidade na superfície da Terra?', options: ['9,8 m/s²', '3,2 m/s²', '15 m/s²', '1 m/s²'], answer: 0 },
  { id: 'hard-01', tier: 3, prompt: 'Qual molécula carrega a informação genética dos seres vivos?', options: ['ATP', 'DNA', 'Glicose', 'Hemoglobina'], answer: 1 },
  { id: 'hard-02', tier: 3, prompt: 'Em qual país ficam as ruínas de Machu Picchu?', options: ['Chile', 'Bolívia', 'Peru', 'Colômbia'], answer: 2 },
  { id: 'hard-03', tier: 3, prompt: 'Qual foi a primeira capital do Brasil?', options: ['Salvador', 'Rio de Janeiro', 'Recife', 'Brasília'], answer: 0 },
  { id: 'hard-04', tier: 3, prompt: 'Qual processo permite que as plantas produzam seu próprio alimento?', options: ['Fermentação', 'Fotossíntese', 'Respiração', 'Osmose'], answer: 1 },
  { id: 'hard-05', tier: 3, prompt: 'Qual civilização construiu a cidade de Chichén Itzá?', options: ['Maia', 'Romana', 'Inca', 'Egípcia'], answer: 0 },
  { id: 'hard-06', tier: 3, prompt: 'Qual organela é conhecida como a usina de energia da célula?', options: ['Núcleo', 'Ribossomo', 'Mitocôndria', 'Complexo de Golgi'], answer: 2 },
  { id: 'hard-07', tier: 3, prompt: 'Qual base nitrogenada está presente no RNA, mas não no DNA?', options: ['Timina', 'Uracila', 'Guanina', 'Citosina'], answer: 1 },
  { id: 'hard-08', tier: 3, prompt: 'Em qual país está localizada a maior parte da Grande Muralha?', options: ['China', 'Mongólia', 'Coreia do Sul', 'Japão'], answer: 0 },
  { id: 'hard-09', tier: 3, prompt: 'Qual é a unidade de medida da frequência?', options: ['Newton', 'Tesla', 'Hertz', 'Watt'], answer: 2 },
  { id: 'hard-10', tier: 3, prompt: 'Em qual país está o vulcão Vesúvio?', options: ['Grécia', 'Itália', 'Islândia', 'México'], answer: 1 },
  { id: 'hard-11', tier: 3, prompt: 'Quem escreveu “Crime e Castigo”?', options: ['Liev Tolstói', 'Anton Tchékhov', 'Nikolai Gógol', 'Fiódor Dostoiévski'], answer: 3 },
  { id: 'hard-12', tier: 3, prompt: 'Qual camada rígida externa da Terra é formada pela crosta e pela parte superior do manto?', options: ['Litosfera', 'Astenosfera', 'Mesosfera', 'Endosfera'], answer: 0 },
  { id: 'hard-13', tier: 3, prompt: 'Qual é o maior órgão interno do corpo humano?', options: ['Cérebro', 'Pâncreas', 'Fígado', 'Baço'], answer: 2 },
  { id: 'hard-14', tier: 3, prompt: 'A segunda lei da termodinâmica está diretamente relacionada ao aumento de qual grandeza?', options: ['Pressão', 'Entropia', 'Massa', 'Carga elétrica'], answer: 1 },
  { id: 'hard-15', tier: 3, prompt: 'Em que ano começou a Revolução Francesa?', options: ['1789', '1804', '1815', '1776'], answer: 0 },
  { id: 'advanced-01', tier: 4, prompt: 'O que representa o número binário 1010 no sistema decimal?', options: ['8', '10', '12', '14'], answer: 1 },
  { id: 'advanced-02', tier: 4, prompt: 'Qual tratado dividiu áreas de exploração entre Portugal e Espanha em 1494?', options: ['Tratado de Versalhes', 'Tratado de Tordesilhas', 'Tratado de Utrecht', 'Tratado de Paris'], answer: 1 },
  { id: 'advanced-03', tier: 4, prompt: 'Qual cientista formulou as três leis do movimento?', options: ['Galileu Galilei', 'Isaac Newton', 'Albert Einstein', 'Niels Bohr'], answer: 1 },
  { id: 'advanced-04', tier: 4, prompt: 'Qual canal liga o Mar Mediterrâneo ao Mar Vermelho?', options: ['Canal do Panamá', 'Canal de Kiel', 'Canal de Suez', 'Canal da Mancha'], answer: 2 },
  { id: 'advanced-05', tier: 4, prompt: 'Qual é o próximo número da sequência 1, 1, 2, 3, 5, 8?', options: ['11', '12', '13', '15'], answer: 2 },
  { id: 'advanced-06', tier: 4, prompt: 'Qual princípio afirma que não é possível conhecer simultaneamente, com precisão ilimitada, a posição e o momento de uma partícula?', options: ['Princípio de Pauli', 'Princípio da incerteza de Heisenberg', 'Princípio de Arquimedes', 'Princípio de Huygens'], answer: 1 },
  { id: 'advanced-07', tier: 4, prompt: 'Qual é a maior lua de Júpiter?', options: ['Europa', 'Io', 'Ganimedes', 'Calisto'], answer: 2 },
  { id: 'advanced-08', tier: 4, prompt: 'Quem formulou o conceito de equilíbrio que leva seu sobrenome na teoria dos jogos?', options: ['John Nash', 'Adam Smith', 'Claude Shannon', 'Kurt Gödel'], answer: 0 },
  { id: 'advanced-09', tier: 4, prompt: 'Qual tratado de 1648 é associado ao fim da Guerra dos Trinta Anos?', options: ['Tratado de Tordesilhas', 'Tratado de Utrecht', 'Tratado de Versalhes', 'Paz de Vestfália'], answer: 3 },
  { id: 'advanced-10', tier: 4, prompt: 'Qual é a derivada de x² em relação a x?', options: ['x', '2x', 'x²', '2'], answer: 1 },
  { id: 'advanced-11', tier: 4, prompt: 'Qual estrutura celular é responsável pela síntese de proteínas?', options: ['Lisossomo', 'Centríolo', 'Ribossomo', 'Vacúolo'], answer: 2 },
  { id: 'advanced-12', tier: 4, prompt: 'Qual partícula elementar da luz não possui massa de repouso?', options: ['Fóton', 'Elétron', 'Próton', 'Nêutron'], answer: 0 },
  { id: 'advanced-13', tier: 4, prompt: 'Em que ano foi assinada a Magna Carta inglesa?', options: ['1066', '1215', '1492', '1688'], answer: 1 },
  { id: 'advanced-14', tier: 4, prompt: 'Quantos ossos tem, em média, o esqueleto de um adulto?', options: ['186', '196', '206', '216'], answer: 2 },
  { id: 'advanced-15', tier: 4, prompt: 'Qual é aproximadamente o número de Avogadro?', options: ['6,022 × 10²³', '9,8 × 10⁶', '3,14 × 10¹²', '1,602 × 10⁻¹⁹'], answer: 0 },
  { id: 'expert-01', tier: 5, prompt: 'Como é chamado o limite ao redor de um buraco negro além do qual nada escapa?', options: ['Singularidade', 'Horizonte de eventos', 'Disco de acreção', 'Radiação Hawking'], answer: 1 },
  { id: 'expert-02', tier: 5, prompt: 'Qual filósofo escreveu “A República”?', options: ['Aristóteles', 'Sócrates', 'Platão', 'Epicuro'], answer: 2 },
  { id: 'expert-03', tier: 5, prompt: 'Qual é o nome do processo de divisão celular que gera gametas?', options: ['Mitose', 'Meiose', 'Clonagem', 'Bipartição'], answer: 1 },
  { id: 'expert-04', tier: 5, prompt: 'Qual país foi o primeiro a lançar um satélite artificial ao espaço?', options: ['Estados Unidos', 'União Soviética', 'Alemanha', 'Japão'], answer: 1 },
  { id: 'expert-05', tier: 5, prompt: 'Na economia, o que mede o PIB?', options: ['A população economicamente ativa', 'A soma dos bens e serviços finais produzidos', 'A taxa básica de juros', 'O volume de exportações'], answer: 1 },
  { id: 'expert-06', tier: 5, prompt: 'Como é chamada a radiação teórica emitida por buracos negros devido a efeitos quânticos?', options: ['Radiação cósmica', 'Radiação Cherenkov', 'Radiação Hawking', 'Radiação síncrotron'], answer: 2 },
  { id: 'expert-07', tier: 5, prompt: 'Quem escreveu “Crítica da Razão Pura”?', options: ['Immanuel Kant', 'Friedrich Nietzsche', 'David Hume', 'René Descartes'], answer: 0 },
  { id: 'expert-08', tier: 5, prompt: 'A lei de Hubble-Lemaître descreve principalmente o quê?', options: ['A formação dos elementos', 'A evolução das espécies', 'A curvatura da luz', 'A expansão do Universo'], answer: 3 },
  { id: 'expert-09', tier: 5, prompt: 'Em economia, o que significa custo de oportunidade?', options: ['O custo de produção total', 'O valor da melhor alternativa sacrificada', 'A taxa de inflação acumulada', 'O custo de uma matéria-prima'], answer: 1 },
  { id: 'expert-10', tier: 5, prompt: 'A tecnologia CRISPR é usada principalmente para quê?', options: ['Medir ondas gravitacionais', 'Armazenar energia', 'Editar material genético', 'Mapear estrelas'], answer: 2 },
  { id: 'expert-11', tier: 5, prompt: 'Em que ano ocorreu a Batalha de Hastings?', options: ['1066', '1215', '1453', '1588'], answer: 0 },
  { id: 'expert-12', tier: 5, prompt: 'O teste criado para avaliar se uma máquina pode demonstrar comportamento inteligente é associado a quem?', options: ['John von Neumann', 'Alan Turing', 'Tim Berners-Lee', 'Norbert Wiener'], answer: 1 },
  { id: 'expert-13', tier: 5, prompt: 'Na termodinâmica, a entropia está associada principalmente a qual conceito?', options: ['Velocidade', 'Carga elétrica', 'Dispersão de energia e desordem', 'Volume'], answer: 2 },
  { id: 'expert-14', tier: 5, prompt: 'Como é chamada a antiga escrita da Mesopotâmia feita com marcas em forma de cunha?', options: ['Hieroglífica', 'Fenícia', 'Rúnica', 'Cuneiforme'], answer: 3 },
  { id: 'expert-15', tier: 5, prompt: 'Qual teorema relaciona a diferenciação e a integração?', options: ['Teorema de Pitágoras', 'Teorema Fundamental do Cálculo', 'Teorema de Bayes', 'Teorema de Noether'], answer: 1 },
]);

function formatNumber(value) {
  return Number(value).toLocaleString('pt-BR');
}

function playerName(player) {
  return player?.name ?? `<@${player?.id}>`;
}

function gameId() {
  return `${Date.now().toString(36)}${nextGameId++}`;
}

function channelKey(ctx) {
  return `${ctx.guildId}:${ctx.channelId ?? ctx.channel?.id}`;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function tierForLevel(level) {
  return Math.min(5, Math.floor(level / 2));
}

function nextQuestion(game) {
  const tier = tierForLevel(game.level);
  let candidates = QUESTION_BANK.filter(question =>
    question.tier === tier && !game.usedQuestions.has(question.id));

  if (!candidates.length) {
    for (const question of QUESTION_BANK) {
      if (question.tier === tier) game.usedQuestions.delete(question.id);
    }
    candidates = QUESTION_BANK.filter(question => question.tier === tier);
  }

  const original = candidates[Math.floor(Math.random() * candidates.length)];
  game.usedQuestions.add(original.id);

  const options = shuffle(original.options.map((label, index) => ({
    label,
    correct: index === original.answer,
  })));

  return {
    id: original.id,
    prompt: original.prompt,
    options: options.map(option => option.label),
    answer: options.findIndex(option => option.correct),
  };
}

function clearTurnTimer(game) {
  if (game.turnTimer) clearTimeout(game.turnTimer);
  game.turnTimer = null;
}

function createPlayer(ctx) {
  return {
    id: ctx.user?.id ?? ctx.author?.id,
    name: ctx.member?.displayName ?? ctx.user?.globalName ?? ctx.user?.username
      ?? ctx.author?.displayName ?? ctx.author?.username ?? 'Jogador',
    correct: 0,
    wrong: 0,
    timeouts: 0,
  };
}

function createGame(ctx) {
  const host = createPlayer(ctx);
  const game = {
    id: gameId(),
    key: channelKey(ctx),
    guildId: ctx.guildId,
    channelId: ctx.channelId ?? ctx.channel?.id,
    message: null,
    hostId: host.id,
    players: [host],
    status: 'lobby',
    level: 0,
    turnIndex: 0,
    turnNumber: 0,
    questionToken: 0,
    question: null,
    deadline: 0,
    turnTimer: null,
    lobbyTimer: null,
    usedQuestions: new Set(),
    notice: '',
  };
  games.set(game.key, game);
  return game;
}

function findGame(interaction, id) {
  const game = [...games.values()].find(candidate =>
    candidate.id === id
    && candidate.guildId === interaction.guildId
    && candidate.channelId === interaction.channelId);
  return game ?? null;
}

function v2Notice(text) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  };
}

function gameContainer(text) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder());
}

function lobbyContainer(text) {
  return new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${MILHAO_BANNER_NAME}`),
      ),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addSeparatorComponents(new SeparatorBuilder());
}

function lobbyPayload(game) {
  const players = game.players
    .map((player, index) => `${index === 0 ? '👑' : '🎤'} ${index + 1}. **${playerName(player)}**`)
    .join('\n');
  const container = lobbyContainer([
    '## 🎤 Jogo do Milhão',
    '**Sala de espera**',
    '',
    `**Participantes (${game.players.length}/${MAX_PLAYERS})**`,
    players,
    '',
    game.players.length >= 2
      ? 'A sala está pronta. O anfitrião pode iniciar a partida.'
      : 'Entre na fila. São necessários pelo menos 2 participantes.',
  ].join('\n'));

  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`milhao_join:${game.id}`)
          .setLabel('Entrar na fila')
          .setEmoji('➕')
          .setStyle(ButtonStyle.Success)
          .setDisabled(game.players.length >= MAX_PLAYERS),
        new ButtonBuilder()
          .setCustomId(`milhao_leave:${game.id}`)
          .setLabel('Sair')
          .setEmoji('↩️')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`milhao_start:${game.id}`)
          .setLabel('Começar')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(game.players.length < 2),
        new ButtonBuilder()
          .setCustomId(`milhao_cancel:${game.id}`)
          .setLabel('Cancelar')
          .setEmoji('✖️')
          .setStyle(ButtonStyle.Danger),
      ),
    ],
    files: [new AttachmentBuilder(MILHAO_BANNER_PATH, { name: MILHAO_BANNER_NAME })],
    flags: MessageFlags.IsComponentsV2,
  };
}

function scoreLine(game) {
  return game.players
    .map(player => {
      const marker = player.id === game.players[game.turnIndex]?.id ? '▶️' : '•';
      return `${marker} **${playerName(player)}** · ${player.correct} acerto${player.correct === 1 ? '' : 's'}`;
    })
    .join('\n');
}

function gamePayload(game, notice = game.notice) {
  const current = game.players[game.turnIndex];
  const question = game.question;
  const prize = PRIZES[game.level];
  const deadline = Math.floor(game.deadline / 1000);
  const noticeBlock = notice ? `> ${notice}\n\n` : '';
  const text = [
    '## 🎤 Jogo do Milhão',
    `${noticeBlock}**Pergunta ${game.level + 1}/${PRIZES.length}** · Prêmio **${formatNumber(prize)} ${COIN()}**`,
    `▶️ Vez de **${playerName(current)}**`,
    `⏱️ Tempo restante: <t:${deadline}:R>`,
    '',
    `**${question.prompt}**`,
    '',
    '**Placar**',
    scoreLine(game),
  ].join('\n');
  const container = gameContainer(text);

  const answerButtons = question.options.map((option, index) =>
    new ButtonBuilder()
      .setCustomId(`milhao_answer:${game.id}:${game.questionToken}:${index}`)
      .setLabel(option.slice(0, 80))
      .setEmoji(ANSWER_EMOJIS[index])
      .setStyle(ButtonStyle.Primary),
  );

  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(answerButtons.slice(0, 2)),
      new ActionRowBuilder().addComponents(answerButtons.slice(2)),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`milhao_leave:${game.id}`)
          .setLabel('Desistir da partida')
          .setEmoji('🚪')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

function endPayload(game) {
  const winner = game.winner;
  const title = game.result === 'champion'
    ? '🏆 Temos um milionário!'
    : game.result === 'timeout'
      ? '⏱️ Partida encerrada'
      : '🎤 Jogo encerrado';
  const winnerLine = winner
    ? `**${playerName(winner)}** terminou com **${formatNumber(game.payout)} ${COIN()}**.`
    : 'Nenhum prêmio foi distribuído.';
  const ranking = [...game.players]
    .sort((a, b) => b.correct - a.correct)
    .map((player, index) => `${index + 1}. **${playerName(player)}** · ${player.correct} acerto${player.correct === 1 ? '' : 's'}`)
    .join('\n');
  const container = gameContainer([
    `## ${title}`,
    game.endNotice ?? '',
    '',
    winnerLine,
    '',
    '**Resultado final**',
    ranking || 'A partida terminou sem participantes.',
  ].filter(Boolean).join('\n'));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function editGameMessage(game, payload, interaction = null) {
  if (interaction) return interaction.editReply(payload);
  if (game.message?.edit) return game.message.edit(payload).catch(() => null);

  const channel = game.client?.channels?.cache?.get(game.channelId)
    ?? await game.client?.channels?.fetch(game.channelId).catch(() => null);
  const message = game.messageId
    ? await channel?.messages.fetch(game.messageId).catch(() => null)
    : null;
  return message?.edit(payload).catch(() => null);
}

async function awardCoins(userId, guildId, amount) {
  if (!amount) return;
  await prisma.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, balance: amount },
    update: { balance: { increment: amount } },
  });
}

function finishGame(game, winner, result, notice, payout = 0) {
  clearTurnTimer(game);
  if (game.lobbyTimer) clearTimeout(game.lobbyTimer);
  game.status = 'done';
  game.winner = winner;
  game.result = result;
  game.endNotice = notice;
  game.payout = payout;
  games.delete(game.key);
}

function beginQuestion(game, notice = '') {
  clearTurnTimer(game);
  game.question = nextQuestion(game);
  game.questionToken += 1;
  game.deadline = Date.now() + TURN_TIME_MS;
  game.notice = notice;
  game.turnTimer = setTimeout(() => handleTimeout(game), TURN_TIME_MS + 250);
}

async function handleTimeout(game) {
  if (game.status !== 'playing') return;
  if (Date.now() < game.deadline) {
    game.turnTimer = setTimeout(() => handleTimeout(game), Math.max(250, game.deadline - Date.now() + 50));
    return;
  }

  const current = game.players[game.turnIndex];
  if (current) current.timeouts += 1;
  game.turnNumber += 1;

  if (game.turnNumber >= MAX_TURNS) {
    const winner = [...game.players].sort((a, b) => b.correct - a.correct)[0] ?? null;
    const payout = winner && winner.correct > 0
      ? PRIZES[Math.min(PRIZES.length - 1, winner.correct - 1)]
      : 0;
    if (winner && payout) await awardCoins(winner.id, game.guildId, payout).catch(() => {});
    finishGame(game, winner, 'timeout', 'O limite de rodadas foi atingido.', payout);
    await editGameMessage(game, endPayload(game));
    return;
  }

  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  beginQuestion(game, `⏰ ${playerName(current)} não respondeu a tempo. A vez passou.`);
  await editGameMessage(game, gamePayload(game));
}

function startRound(game) {
  if (game.lobbyTimer) clearTimeout(game.lobbyTimer);
  game.status = 'playing';
  game.turnIndex = 0;
  game.level = 0;
  game.turnNumber = 0;
  beginQuestion(game, 'A partida começou. Boa sorte!');
}

function scheduleLobby(game) {
  game.lobbyTimer = setTimeout(async () => {
    if (games.get(game.key) !== game || game.status !== 'lobby') return;
    if (game.players.length >= 2) {
      startRound(game);
      await editGameMessage(game, gamePayload(game));
    } else {
      finishGame(game, null, 'cancelled', 'A sala foi encerrada por falta de participantes.');
      await editGameMessage(game, endPayload(game));
    }
  }, LOBBY_TIME_MS);
}

function interactionPlayer(game, userId) {
  return game.players.find(player => player.id === userId);
}

export async function startMilhao(ctx, send) {
  if (!ctx.guildId) return send(v2Notice('❌ O Jogo do Milhão só funciona dentro de um servidor.'));
  const key = channelKey(ctx);
  if (games.has(key)) {
    return send(v2Notice('❌ Já existe uma partida do Jogo do Milhão ativa neste canal.'));
  }

  const game = createGame(ctx);
  scheduleLobby(game);
  const message = await send(lobbyPayload(game));
  if (message?.id) {
    game.message = message;
    game.messageId = message.id;
  }
  return message;
}

export async function handleMilhaoInteraction(interaction) {
  const [action, id, token, answerValue] = interaction.customId.split(':');
  const game = findGame(interaction, id);
  if (!game) return interaction.reply(v2Notice('❌ Esta partida não está mais ativa.'));

  const userId = interaction.user.id;
  const player = interactionPlayer(game, userId);

  if (action === 'milhao_join') {
    if (game.status !== 'lobby') return interaction.reply(v2Notice('❌ A partida já começou.'));
    if (player) return interaction.reply(v2Notice('ℹ️ Você já está na fila.'));
    if (game.players.length >= MAX_PLAYERS) return interaction.reply(v2Notice('❌ A fila está cheia.'));
    game.players.push({
      id: userId,
      name: interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
      correct: 0,
      wrong: 0,
      timeouts: 0,
    });
    return interaction.update(lobbyPayload(game));
  }

  if (action === 'milhao_leave') {
    if (!player) return interaction.reply(v2Notice('❌ Você não está nesta partida.'));
    if (game.status === 'lobby') {
      if (player.id === game.hostId) {
        finishGame(game, null, 'cancelled', 'O anfitrião encerrou a sala.');
        return interaction.update(endPayload(game));
      }
      game.players = game.players.filter(candidate => candidate.id !== userId);
      return interaction.update(lobbyPayload(game));
    }

    const wasCurrent = game.players[game.turnIndex]?.id === userId;
    const removedIndex = game.players.findIndex(candidate => candidate.id === userId);
    game.players.splice(removedIndex, 1);
    if (!game.players.length) {
      finishGame(game, null, 'cancelled', 'Todos os participantes saíram.');
      return interaction.update(endPayload(game));
    }
    if (removedIndex < game.turnIndex) game.turnIndex -= 1;
    if (game.turnIndex >= game.players.length) game.turnIndex = 0;
    if (wasCurrent) beginQuestion(game, `🚪 ${playerName(player)} saiu. A vez passou.`);
    return interaction.update(gamePayload(game));
  }

  if (action === 'milhao_cancel') {
    if (game.hostId !== userId) return interaction.reply(v2Notice('❌ Apenas o anfitrião pode cancelar a sala.'));
    finishGame(game, null, 'cancelled', 'A partida foi cancelada pelo anfitrião.');
    return interaction.update(endPayload(game));
  }

  if (action === 'milhao_start') {
    if (game.hostId !== userId) return interaction.reply(v2Notice('❌ Apenas o anfitrião pode iniciar a partida.'));
    if (game.status !== 'lobby') return interaction.reply(v2Notice('❌ A partida já começou.'));
    if (game.players.length < 2) return interaction.reply(v2Notice('❌ É necessário ter pelo menos 2 participantes.'));
    startRound(game);
    return interaction.update(gamePayload(game));
  }

  if (action !== 'milhao_answer') return;
  if (game.status !== 'playing') return interaction.reply(v2Notice('❌ A partida já terminou.'));
  if (!player) return interaction.reply(v2Notice('❌ Entre na fila para participar desta partida.'));
  if (game.players[game.turnIndex]?.id !== userId) {
    return interaction.reply(v2Notice(`⏳ Aguarde sua vez. Agora é a vez de **${playerName(game.players[game.turnIndex])}**.`));
  }
  if (String(token) !== String(game.questionToken)) {
    return interaction.reply(v2Notice('⚠️ Esta pergunta já foi substituída por outra.'));
  }

  const answer = Number(answerValue);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    return interaction.reply(v2Notice('❌ Resposta inválida.'));
  }

  // Reconhece o clique antes de qualquer operação de banco ou montagem de
  // resultado final, mantendo a interação dentro do prazo do Discord.
  const deferredUpdate = interaction.deferUpdate();
  clearTurnTimer(game);
  game.turnNumber += 1;

  if (answer === game.question.answer) {
    player.correct += 1;
    const earnedPrize = PRIZES[game.level];
    game.level += 1;

    if (game.level >= PRIZES.length) {
      await deferredUpdate;
      await awardCoins(player.id, game.guildId, earnedPrize).catch(() => {});
      finishGame(game, player, 'champion', `✅ ${playerName(player)} respondeu tudo corretamente.`, earnedPrize);
      return interaction.editReply(endPayload(game));
    }

    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    if (game.turnNumber >= MAX_TURNS) {
      await deferredUpdate;
      await awardCoins(player.id, game.guildId, earnedPrize).catch(() => {});
      finishGame(game, player, 'champion', `✅ ${playerName(player)} venceu ao alcançar o limite de rodadas.`, earnedPrize);
      return interaction.editReply(endPayload(game));
    }
    beginQuestion(game, `✅ ${playerName(player)} acertou e avançou para ${formatNumber(PRIZES[game.level])} ${COIN()}.`);
    await deferredUpdate;
    return interaction.editReply(gamePayload(game));
  }

  player.wrong += 1;
  if (game.turnNumber >= MAX_TURNS) {
    const winner = [...game.players].sort((a, b) => b.correct - a.correct)[0] ?? player;
    const payout = winner.correct > 0 ? PRIZES[Math.min(PRIZES.length - 1, winner.correct - 1)] : 0;
    await deferredUpdate;
    if (payout) await awardCoins(winner.id, game.guildId, payout).catch(() => {});
    finishGame(game, winner, 'timeout', `❌ ${playerName(player)} errou. A partida chegou ao limite de rodadas.`, payout);
    return interaction.editReply(endPayload(game));
  }

  game.turnIndex = (game.turnIndex + 1) % game.players.length;
  beginQuestion(game, `❌ ${playerName(player)} errou. A pergunta continua valendo ${formatNumber(PRIZES[game.level])} ${COIN()}.`);
  await deferredUpdate;
  return interaction.editReply(gamePayload(game));
}
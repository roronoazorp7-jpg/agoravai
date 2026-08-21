import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAROT_ASSETS_DIR = join(__dirname, '../../assets/tarot');
const COOLDOWN_MS = 30 * 60 * 1000;
const cooldowns = new Map();

const CARDS = [
  {
    name: 'O Louco',
    upright: 'Novos começos, liberdade e coragem para seguir por um caminho desconhecido. Confie na jornada, mas não ignore os próprios passos.',
    reversed: 'Impulsividade, falta de preparo ou uma fuga das responsabilidades. Antes de saltar, observe onde seus pés vão pousar.',
  },
  {
    name: 'O Mago',
    upright: 'Iniciativa, habilidade e poder de transformar uma ideia em realidade. Você já tem mais recursos do que imagina.',
    reversed: 'Potencial desperdiçado, manipulação ou promessas sem ação. Use sua influência com honestidade e propósito.',
  },
  {
    name: 'A Sacerdotisa',
    upright: 'Intuição, silêncio e conhecimentos que ainda não foram revelados. Nem toda resposta precisa ser buscada com pressa.',
    reversed: 'Segredos, confusão interior ou dificuldade de ouvir a própria intuição. Dê espaço ao silêncio antes de decidir.',
  },
  {
    name: 'A Imperatriz',
    upright: 'Criatividade, abundância, cuidado e crescimento. Algo está pronto para florescer se receber atenção constante.',
    reversed: 'Bloqueio criativo, excesso de proteção ou energia sendo entregue sem retorno. Cuide de si também.',
  },
  {
    name: 'O Imperador',
    upright: 'Estrutura, liderança e estabilidade. Organizar seus limites será essencial para transformar planos em algo duradouro.',
    reversed: 'Rigidez, controle excessivo ou autoridade mal utilizada. Firmeza não precisa significar dureza.',
  },
  {
    name: 'O Hierofante',
    upright: 'Tradição, aprendizado e orientação. Uma pessoa experiente ou um método já testado pode ajudar neste momento.',
    reversed: 'Regras que já não fazem sentido ou necessidade de pensar por conta própria. Questione o que foi aceito automaticamente.',
  },
  {
    name: 'Os Enamorados',
    upright: 'Escolha importante, conexão e alinhamento de valores. A melhor decisão será aquela que combina com quem você realmente é.',
    reversed: 'Indecisão, conflito de valores ou uma relação desequilibrada. Evite escolher apenas para agradar outra pessoa.',
  },
  {
    name: 'O Carro',
    upright: 'Determinação, movimento e vitória conquistada pela disciplina. Direcione suas forças para um único objetivo.',
    reversed: 'Pressa, perda de controle ou caminhos competindo entre si. Reduza a velocidade e retome as rédeas.',
  },
  {
    name: 'A Justiça',
    upright: 'Equilíbrio, verdade e consequências proporcionais. Decisões honestas agora terão peso no resultado futuro.',
    reversed: 'Injustiça, julgamento precipitado ou tentativa de escapar da responsabilidade. Olhe os fatos sem escolher lados por impulso.',
  },
  {
    name: 'O Eremita',
    upright: 'Introspecção, prudência e uma busca pessoal por respostas. A distância certa pode revelar o que o barulho escondia.',
    reversed: 'Isolamento, solidão ou excesso de análise. Recolher-se pode ajudar, mas não precisa enfrentar tudo sozinho.',
  },
  {
    name: 'A Roda da Fortuna',
    upright: 'Mudança de ciclo, oportunidade e movimento do destino. Esteja pronto para aproveitar uma virada inesperada.',
    reversed: 'Resistência à mudança ou sensação de repetição. Nem tudo está sob seu controle, mas sua reação ainda está.',
  },
  {
    name: 'A Força',
    upright: 'Coragem serena, paciência e domínio emocional. A verdadeira força virá de conduzir, não de forçar.',
    reversed: 'Insegurança, desgaste ou reações impulsivas. Recupere sua confiança antes de tentar vencer a situação.',
  },
  {
    name: 'O Enforcado',
    upright: 'Pausa, entrega e uma nova perspectiva. Suspender a ação por um momento pode revelar uma solução diferente.',
    reversed: 'Estagnação, sacrifício sem propósito ou apego a algo que já deveria ser liberado. Mudar o ângulo é necessário.',
  },
  {
    name: 'A Morte',
    upright: 'Fim de um ciclo e transformação profunda. Algo precisa terminar para que uma versão mais verdadeira possa começar.',
    reversed: 'Resistência a uma mudança inevitável ou apego ao passado. Adiar a transformação pode torná-la mais pesada.',
  },
  {
    name: 'A Temperança',
    upright: 'Harmonia, cura e equilíbrio gradual. Misture paciência com ação constante e evite decisões extremas.',
    reversed: 'Excesso, impaciência ou energia desequilibrada. Reorganize sua rotina antes de assumir mais uma carga.',
  },
  {
    name: 'O Diabo',
    upright: 'Desejo, tentação e vínculos intensos. Reconhecer o que prende você é o primeiro passo para recuperar sua liberdade.',
    reversed: 'Libertação de um padrão, vício ou relação desgastante. A corrente está mais fraca do que parece.',
  },
  {
    name: 'A Torre',
    upright: 'Ruptura, revelação e uma mudança que derruba estruturas frágeis. O impacto pode abrir espaço para algo mais honesto.',
    reversed: 'Medo de uma mudança necessária ou tensão acumulada. Quanto mais tempo a verdade for evitada, maior será o abalo.',
  },
  {
    name: 'A Estrela',
    upright: 'Esperança, inspiração e recuperação. Mesmo depois de uma fase difícil, há um caminho de renovação se formando.',
    reversed: 'Desânimo, perda de fé ou expectativas que precisam ser ajustadas. Recomece com passos pequenos e reais.',
  },
  {
    name: 'A Lua',
    upright: 'Mistério, sonhos e emoções profundas. Nem tudo está claro; confie na intuição, mas confirme o que puder.',
    reversed: 'Medos vindo à tona, ilusões se desfazendo ou uma verdade começando a aparecer. A confusão não será permanente.',
  },
  {
    name: 'O Sol',
    upright: 'Clareza, alegria e sucesso compartilhado. A resposta tende a se iluminar quando você age com transparência.',
    reversed: 'Alegria incompleta, cansaço ou uma conquista que não trouxe o esperado. Reconheça o que já deu certo.',
  },
  {
    name: 'O Julgamento',
    upright: 'Despertar, segunda chance e chamado para uma decisão definitiva. O passado pode ensinar sem continuar comandando.',
    reversed: 'Culpa, dúvida ou dificuldade de aceitar uma nova fase. Perdoar-se pode ser parte essencial da resposta.',
  },
  {
    name: 'O Mundo',
    upright: 'Conclusão, realização e fechamento de um ciclo. Você está mais perto de completar essa jornada do que imagina.',
    reversed: 'Pendência, sensação de incompletude ou dificuldade de encerrar algo. Termine o que ainda prende sua energia.',
  },
];

function drawCards(amount) {
  const available = [...CARDS];
  const drawn = [];

  for (let index = 0; index < amount; index += 1) {
    const cardIndex = Math.floor(Math.random() * available.length);
    const card = available.splice(cardIndex, 1)[0];
    drawn.push({
      ...card,
      assetIndex: CARDS.indexOf(card),
      isReversed: Math.random() < 0.3,
    });
  }

  return drawn;
}

function positionLabel(amount, index) {
  if (amount === 1) return 'Carta do momento';
  return ['Passado', 'Presente', 'Futuro'][index];
}

function buildPayload(question, cards) {
  const files = cards.map((card, index) => new AttachmentBuilder(
    join(TAROT_ASSETS_DIR, `${String(card.assetIndex).padStart(2, '0')}.jpg`),
    { name: `tarot-${index}.jpg` },
  ));

  const embeds = cards.map((card, index) => {
    const orientation = card.isReversed ? 'Invertida' : 'Normal';
    const interpretation = card.isReversed ? card.reversed : card.upright;
    return new EmbedBuilder()
      .setColor(card.isReversed ? 0x4c1d95 : 0x7f1d1d)
      .setTitle(`${positionLabel(cards.length, index)} · ${card.name}`)
      .setDescription(
        `**Pergunta:** ${question}\n\n` +
        `**Posição:** ${orientation}\n\n` +
        `${interpretation}`,
      )
      .setImage(`attachment://tarot-${index}.jpg`)
      .setFooter({ text: 'Tarô Savage · A leitura é uma reflexão, não uma certeza absoluta.' });
  });

  return { embeds, files };
}

function cooldownKey(interaction) {
  return `${interaction.guildId ?? 'dm'}:${interaction.user.id}`;
}

function remainingCooldown(key) {
  const expiresAt = cooldowns.get(key);
  if (!expiresAt) return 0;
  if (expiresAt <= Date.now()) {
    cooldowns.delete(key);
    return 0;
  }
  return expiresAt - Date.now();
}

function formatDuration(milliseconds) {
  const minutes = Math.ceil(milliseconds / 60_000);
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('tarot')
    .setDescription('Faça uma pergunta e consulte as cartas do tarô')
    .addStringOption(option => option
      .setName('pergunta')
      .setDescription('A pergunta que você quer fazer às cartas')
      .setRequired(true)
      .setMaxLength(500))
    .addStringOption(option => option
      .setName('tiragem')
      .setDescription('Escolha quantas cartas serão reveladas')
      .setRequired(false)
      .addChoices(
        { name: '1 carta — resposta do momento', value: '1' },
        { name: '3 cartas — passado, presente e futuro', value: '3' },
      )),
  name: 'tarot',
  aliases: ['tarô', 'taro'],

  async execute(interaction) {
    const key = cooldownKey(interaction);
    const remaining = remainingCooldown(key);
    if (remaining > 0) {
      return interaction.reply({
        content: `🔮 As cartas precisam de um intervalo para se reorganizar. Tente novamente em **${formatDuration(remaining)}**.`,
        ephemeral: true,
      });
    }

    const question = interaction.options.getString('pergunta', true).trim();
    const amount = Number(interaction.options.getString('tiragem') ?? '1');
    const cards = drawCards(amount === 3 ? 3 : 1);
    cooldowns.set(key, Date.now() + COOLDOWN_MS);

    return interaction.reply(buildPayload(question, cards));
  },

  async executePrefix(message) {
    const question = message.content
      .replace(/^savage\s+(?:tarô|tarot|taro)\s*/i, '')
      .trim();
    if (!question) {
      return message.reply('🔮 Use `savage tarot <sua pergunta>` para consultar as cartas.');
    }

    const key = `${message.guildId ?? 'dm'}:${message.author.id}`;
    const remaining = remainingCooldown(key);
    if (remaining > 0) {
      return message.reply(`🔮 As cartas precisam de um intervalo. Tente novamente em **${formatDuration(remaining)}**.`);
    }

    const cards = drawCards(1);
    cooldowns.set(key, Date.now() + COOLDOWN_MS);
    return message.reply(buildPayload(question.slice(0, 500), cards));
  },
};
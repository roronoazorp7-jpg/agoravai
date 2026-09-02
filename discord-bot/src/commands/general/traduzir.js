import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';
import { isGroqConfigured, translateText } from '../../utils/aiManager.js';

const MAX_TEXT_LENGTH = 2_000;
const DEFAULT_LANGUAGE = 'inglês';

const LANGUAGE_ALIASES = new Map([
  ['pt', 'português'],
  ['pt-br', 'português'],
  ['portugues', 'português'],
  ['português', 'português'],
  ['en', 'inglês'],
  ['eng', 'inglês'],
  ['ingles', 'inglês'],
  ['inglês', 'inglês'],
  ['es', 'espanhol'],
  ['espanhol', 'espanhol'],
  ['fr', 'francês'],
  ['frances', 'francês'],
  ['francês', 'francês'],
  ['de', 'alemão'],
  ['alemao', 'alemão'],
  ['alemão', 'alemão'],
  ['it', 'italiano'],
  ['italiano', 'italiano'],
  ['ja', 'japonês'],
  ['japones', 'japonês'],
  ['japonês', 'japonês'],
  ['ko', 'coreano'],
  ['coreano', 'coreano'],
]);

function resolveLanguage(value) {
  if (!value) return DEFAULT_LANGUAGE;
  return LANGUAGE_ALIASES.get(value.trim().toLowerCase()) ?? value.trim();
}

function successPayload(language, translated) {
  return buildUtilityV2({
    text: `## Tradução para ${language}\n\n${translated}`,
  });
}

function parsePrefixArgs(args) {
  if (!args.length) return { language: DEFAULT_LANGUAGE, text: '' };
  const possibleLanguage = resolveLanguage(args[0]);
  const hasLanguage = LANGUAGE_ALIASES.has(args[0].trim().toLowerCase());
  return {
    language: hasLanguage ? possibleLanguage : DEFAULT_LANGUAGE,
    text: (hasLanguage ? args.slice(1) : args).join(' ').trim(),
  };
}

async function runTranslation(text, language) {
  if (!text) throw new Error('informe o texto que deseja traduzir');
  if (text.length > MAX_TEXT_LENGTH) throw new Error('o texto pode ter no máximo 2.000 caracteres');
  if (!isGroqConfigured()) throw new Error('a tradução está temporariamente indisponível');
  return translateText({ text, targetLanguage: language });
}

export default {
  data: new SlashCommandBuilder()
    .setName('traduzir')
    .setDescription('Traduz um texto para outro idioma')
    .addStringOption(option =>
      option
        .setName('texto')
        .setDescription('Texto que será traduzido')
        .setMaxLength(MAX_TEXT_LENGTH)
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('idioma')
        .setDescription('Idioma de destino; inglês é o padrão')
        .addChoices(
          { name: 'Inglês', value: 'inglês' },
          { name: 'Português', value: 'português' },
          { name: 'Espanhol', value: 'espanhol' },
          { name: 'Francês', value: 'francês' },
          { name: 'Alemão', value: 'alemão' },
          { name: 'Italiano', value: 'italiano' },
          { name: 'Japonês', value: 'japonês' },
          { name: 'Coreano', value: 'coreano' },
        )
        .setRequired(false),
    ),
  name: 'traduzir',
  aliases: ['translate', 'traducao', 'tradução'],

  async execute(interaction) {
    const text = interaction.options.getString('texto');
    const language = interaction.options.getString('idioma') ?? DEFAULT_LANGUAGE;
    await interaction.deferReply();

    try {
      const translated = await runTranslation(text, language);
      return interaction.editReply(successPayload(language, translated));
    } catch (error) {
      return interaction.editReply({ content: `❌ Não consegui traduzir: ${error.message}.` });
    }
  },

  async executePrefix(message, args) {
    const { language, text } = parsePrefixArgs(args);
    try {
      const translated = await runTranslation(text, language);
      return message.reply(successPayload(language, translated));
    } catch (error) {
      return message.reply(`❌ Não consegui traduzir: ${error.message}. Exemplo: \`savage traduzir en bom dia\``);
    }
  },
};
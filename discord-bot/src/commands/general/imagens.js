import { randomUUID } from 'crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js';

const GOOGLE_IMAGES_URL = 'https://www.google.com/search?tbm=isch&hl=pt-BR&safe=active&q=';
const SESSION_TTL_MS = 15 * 60 * 1000;
const sessions = new Map();

function makeToken() {
  return randomUUID().replaceAll('-', '').slice(0, 18);
}

function decodeGoogleValue(value) {
  if (!value) return null;

  let decoded = value
    .replaceAll('&amp;', '&')
    .replaceAll('\\u0026', '&')
    .replaceAll('\\/', '/');

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Alguns resultados têm percentuais incompletos. O valor original ainda
    // pode ser um URL válido, então seguimos com ele.
  }

  return decoded
    .replaceAll('&amp;', '&')
    .replaceAll('\\u0026', '&')
    .replaceAll('\\/', '/');
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return 'Google Imagens';
  }
}

function cleanTitle(value, query, index) {
  const title = String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title && title.length <= 180) return title;
  return `${query} · resultado ${index + 1}`;
}

function parseImageResults(html, query, searchUrl) {
  const results = [];
  const seen = new Set();

  // Os cards do Google usam links imgres com a imagem original e a página
  // de origem codificadas nos parâmetros da URL.
  const imgresPattern = /https:\/\/www\.google\.com\/imgres\?([^"'<>\\\s]+)/g;
  for (const match of html.matchAll(imgresPattern)) {
    const params = new URLSearchParams(
      match[1]
        .replaceAll('&amp;', '&')
        .replaceAll('\\u0026', '&')
        .replaceAll('\\/', '/'),
    );
    const imageUrl = decodeGoogleValue(params.get('imgurl'));
    const sourceUrl = decodeGoogleValue(params.get('imgrefurl')) ?? searchUrl;
    const title = decodeGoogleValue(params.get('imgtitle'));

    if (!isHttpUrl(imageUrl) || seen.has(imageUrl)) continue;
    seen.add(imageUrl);
    results.push({
      imageUrl,
      sourceUrl: isHttpUrl(sourceUrl) ? sourceUrl : searchUrl,
      title: cleanTitle(title, query, results.length),
    });
  }

  // Fallback para o thumbnail do Google quando o formato do HTML mudar.
  if (results.length < 2) {
    const thumbnailPattern = /https:\/\/encrypted-tbn\d\.gstatic\.com\/images\?[^"'<>\\\s]+/g;
    for (const match of html.matchAll(thumbnailPattern)) {
      const imageUrl = decodeGoogleValue(match[0]);
      if (!isHttpUrl(imageUrl) || seen.has(imageUrl)) continue;
      seen.add(imageUrl);
      results.push({
        imageUrl,
        sourceUrl: searchUrl,
        title: cleanTitle(null, query, results.length),
      });
    }
  }

  return results.slice(0, 50);
}

async function searchGoogleImages(query) {
  const searchUrl = `${GOOGLE_IMAGES_URL}${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
    },
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Google retornou HTTP ${response.status}`);
  }

  const html = await response.text();
  if (/unusual traffic|captcha|before you continue|consent\.google/i.test(html)) {
    throw new Error('O Google solicitou uma verificação antes de mostrar os resultados.');
  }

  const results = parseImageResults(html, query, searchUrl);
  if (!results.length) {
    throw new Error('Nenhuma imagem foi encontrada ou o formato do Google mudou.');
  }

  return { searchUrl, results };
}

function getSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function buildButtons(session) {
  const current = session.results[session.index];
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`imgsearch:prev:${session.token}`)
      .setLabel('Anterior')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.index === 0),
    new ButtonBuilder()
      .setLabel('Imagem')
      .setEmoji('🖼️')
      .setStyle(ButtonStyle.Link)
      .setURL(current.imageUrl),
    new ButtonBuilder()
      .setCustomId(`imgsearch:close:${session.token}`)
      .setLabel('Fechar')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setLabel('Fonte')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Link)
      .setURL(current.sourceUrl),
    new ButtonBuilder()
      .setCustomId(`imgsearch:next:${session.token}`)
      .setLabel('Próxima')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.index >= session.results.length - 1),
  );
}

function buildPayload(session) {
  const current = session.results[session.index];
  const source = hostnameFromUrl(current.sourceUrl);
  const embed = new EmbedBuilder()
    .setColor(0x4285f4)
    .setTitle('Resultados de imagens')
    .setDescription(
      `Pesquisa por **${session.query}**\n` +
      `Resultado **${session.index + 1} de ${session.results.length}** · ${source}`,
    )
    .setImage(current.imageUrl)
    .setURL(session.searchUrl)
    .setFooter({ text: 'Google Imagens · use os botões para navegar' });

  return {
    embeds: [embed],
    components: [buildButtons(session)],
  };
}

async function executeSearch(reply, query) {
  const { searchUrl, results } = await searchGoogleImages(query);
  const session = {
    token: makeToken(),
    ownerId: reply.user?.id ?? reply.author.id,
    query,
    searchUrl,
    results,
    index: 0,
    createdAt: Date.now(),
  };
  sessions.set(session.token, session);
  return { session, payload: buildPayload(session) };
}

function missingQueryMessage() {
  return 'Use uma pesquisa depois do comando. Exemplo: `/imagens gatos pretos` ou `savage imagens gatos pretos`.';
}

export async function handleImageSearchInteraction(interaction) {
  const [, action, token] = interaction.customId.split(':');
  const session = getSession(token);

  if (!session) {
    return interaction.update({
      content: '❌ Esta pesquisa expirou. Faça uma nova busca com `/imagens`.',
      embeds: [],
      components: [],
    });
  }

  if (interaction.user.id !== session.ownerId) {
    return interaction.reply({
      content: '🔒 Apenas quem iniciou esta pesquisa pode usar os botões.',
      ephemeral: true,
    });
  }

  if (action === 'close') {
    sessions.delete(token);
    return interaction.update({
      content: '✅ Pesquisa encerrada.',
      embeds: [],
      components: [],
    });
  }

  if (action === 'prev') session.index = Math.max(0, session.index - 1);
  if (action === 'next') session.index = Math.min(session.results.length - 1, session.index + 1);
  return interaction.update(buildPayload(session));
}

async function runSearch(interactionOrMessage, query) {
  if (!query) {
    return interactionOrMessage.reply({ content: missingQueryMessage() });
  }

  try {
    if (interactionOrMessage.isChatInputCommand?.()) {
      await interactionOrMessage.deferReply();
      const { payload } = await executeSearch(interactionOrMessage, query);
      return interactionOrMessage.editReply(payload);
    }

    await interactionOrMessage.channel.sendTyping().catch(() => {});
    const { payload } = await executeSearch(interactionOrMessage, query);
    return interactionOrMessage.reply(payload);
  } catch (error) {
    console.error('[GOOGLE IMAGENS]', error?.message ?? error);
    const message = '❌ Não consegui carregar as imagens do Google agora. O Google pode ter bloqueado a consulta temporariamente; tente novamente em alguns segundos.';
    if (interactionOrMessage.isChatInputCommand?.()) {
      if (interactionOrMessage.deferred || interactionOrMessage.replied) {
        return interactionOrMessage.editReply({ content: message, embeds: [], components: [] });
      }
    }
    return interactionOrMessage.reply({ content: message });
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('imagens')
    .setDescription('Pesquisa imagens no Google e navega pelos resultados')
    .addStringOption(option =>
      option
        .setName('pesquisa')
        .setDescription('O que você quer pesquisar')
        .setRequired(true),
    ),
  name: 'imagens',
  aliases: ['imagem', 'img', 'google'],
  async execute(interaction) {
    return runSearch(interaction, interaction.options.getString('pesquisa', true).trim());
  },
  async executePrefix(message, args) {
    return runSearch(message, args.join(' ').trim());
  },
};
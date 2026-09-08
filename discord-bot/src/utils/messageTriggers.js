import { createWriteStream } from 'fs';
import { mkdir, rename, stat, unlink } from 'fs/promises';
import { basename, dirname, extname, join } from 'path';
import { fileURLToPath } from 'url';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from 'discord.js';
import prisma from '../database/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIGGER_DIR = join(__dirname, '../assets/triggers');
const MAX_FILE_SIZE = 500 * 1024 * 1024;
const ALLOWED_TYPES = /^(image|video|audio)\//i;
const TYPE_EXTENSIONS = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
};

function normalizeKeyword(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesTriggerKeyword(content, keyword) {
  const normalizedContent = normalizeKeyword(content);
  const normalizedKeyword = normalizeKeyword(keyword);
  if (!normalizedContent || !normalizedKeyword) return false;

  const keywordPattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedKeyword)}(?=$|[^\\p{L}\\p{N}])`,
    'u',
  );
  return keywordPattern.test(normalizedContent);
}

export function parseTriggerKeywords(value) {
  return [...new Set(
    String(value ?? '')
      .split(/\r?\n/)
      .map(normalizeKeyword)
      .filter(Boolean),
  )].slice(0, 50);
}

function getStoredTriggerKeywords(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];

  // Accept records created by older versions that stored the keywords as JSON.
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseTriggerKeywords(parsed.join('\n'));
    } catch {
      // Fall through to the regular line-based parser.
    }
  }

  // The current panel saves one keyword per line. Keep compatibility with
  // older records that used comma or semicolon separated keywords.
  const legacySeparated = raw.includes('\n') ? raw : raw.replace(/[;,]\s+/g, '\n');
  return parseTriggerKeywords(legacySeparated);
}

function safeFileName(value) {
  const clean = basename(String(value || 'resposta.bin'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
  return clean || 'resposta.bin';
}

export function getTriggerFileName(trigger) {
  const name = safeFileName(trigger?.responseName);
  const mimeType = String(trigger?.responseType ?? '').split(';', 1)[0].toLowerCase();
  const extension = TYPE_EXTENSIONS[mimeType] ?? '';
  if (extension && (!extname(name) || extname(name).toLowerCase() === '.bin')) {
    return `${name.replace(/\.bin$/i, '')}${extension}`;
  }
  return extname(name) ? name : `${name}${extension}`;
}

function shouldRefreshStoredFile(trigger, size) {
  if (!size || size <= 64) return true;
  if (String(trigger?.responseType ?? '').startsWith('video/') && size < 1024) return true;
  return false;
}

function getMediaTypeFromUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.endsWith('.mp4')) return 'video/mp4';
    if (pathname.endsWith('.webm')) return 'video/webm';
    if (pathname.endsWith('.mov')) return 'video/quicktime';
    if (pathname.endsWith('.mkv')) return 'video/x-matroska';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.mp3')) return 'audio/mpeg';
    if (pathname.endsWith('.ogg')) return 'audio/ogg';
    if (pathname.endsWith('.wav')) return 'audio/wav';
  } catch {
    // Invalid URLs are rejected by the fetch path.
  }
  return '';
}

function cleanUrlCandidate(value) {
  return String(value ?? '')
    .replaceAll('\\/', '/')
    .replaceAll('\\u002F', '/')
    .replaceAll('&amp;', '&')
    .trim()
    .replace(/[),.;]+$/g, '');
}

function extractMediaCandidates(text) {
  const source = String(text ?? '');
  const candidates = [];
  const add = value => {
    const url = cleanUrlCandidate(value);
    if (/^https?:\/\//i.test(url) && !candidates.includes(url)) candidates.push(url);
  };

  for (const match of source.matchAll(/(?:downloadAddr|playAddr|videoUrl|contentUrl|og:video(?::url)?)["'\s:=]+["']([^"']+)["']/gi)) {
    add(match[1]);
  }
  for (const match of source.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    add(match[0]);
  }
  return candidates.slice(0, 8);
}

async function resolveTriggerMediaSource(url, expectedType, depth = 0, visited = new Set()) {
  if (!url || depth > 2 || visited.has(url)) return null;
  visited.add(url);

  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; SavageBot/1.0)',
      accept: '*/*',
    },
  }).catch(() => null);
  if (!response?.ok || !response.body) return null;

  const responseType = String(response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    .toLowerCase();
  const fallbackType = String(expectedType ?? '').split(';', 1)[0].toLowerCase();
  const urlType = getMediaTypeFromUrl(url);
  if (ALLOWED_TYPES.test(responseType)) {
    return { url, contentType: responseType };
  }
  if (responseType === 'application/octet-stream' && ALLOWED_TYPES.test(fallbackType)) {
    return { url, contentType: fallbackType };
  }
  if ((!responseType || responseType === 'application/octet-stream' || responseType === 'text/plain')
    && ALLOWED_TYPES.test(urlType)) {
    return { url, contentType: urlType };
  }

  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 2 * 1024 * 1024) return null;
  const body = await response.text().catch(() => '');
  for (const candidate of extractMediaCandidates(body)) {
    const resolved = await resolveTriggerMediaSource(candidate, fallbackType, depth + 1, visited);
    if (resolved) return resolved;
  }
  return null;
}

function displayName(trigger) {
  return trigger.name?.trim() || trigger.responseName || 'Sem apelido';
}

function formatSize(size) {
  if (!size) return 'tamanho desconhecido';
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function triggerBackRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('trigger_back')
      .setLabel('← Voltar às Funções')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function listTriggers(guildId) {
  return prisma.messageTrigger.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function buildTriggerConfigPayload(guildId) {
  const triggers = await listTriggers(guildId);
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `**Gatilhos** — ${triggers.length} gatilho(s) ativo(s)`,
      'Painel › Funções › Gatilhos',
      '',
      'Quando alguém escrever uma palavra ou frase que contenha uma palavra-chave, o bot responde automaticamente com o arquivo salvo somente neste servidor.',
      '',
      triggers.length
        ? triggers.map((trigger, index) => [
          `**${index + 1}. ${displayName(trigger)}**`,
          `Palavras-chave: ${getStoredTriggerKeywords(trigger.keywords).join(', ')}`,
          `Arquivo: ${trigger.responseName} · ${formatSize(trigger.responseSize)}`,
        ].join('\n')).join('\n\n')
        : '*Nenhum gatilho. Adicione o primeiro abaixo.*',
    ].join('\n')),
  );

  const rows = [];
  if (triggers.length > 0) {
    const options = triggers.slice(0, 25).map(trigger =>
      new StringSelectMenuOptionBuilder()
        .setLabel(displayName(trigger).slice(0, 100))
        .setDescription(getStoredTriggerKeywords(trigger.keywords).join(', ').slice(0, 100))
        .setValue(trigger.id),
    );
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('trigger_delete_select')
        .setPlaceholder('Selecione um gatilho para excluir')
        .addOptions(options),
    ));
  }

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('trigger_add')
      .setLabel('Adicionar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('trigger_refresh')
      .setLabel('Atualizar')
      .setStyle(ButtonStyle.Secondary),
  ));
  rows.push(triggerBackRow());

  return {
    components: [container, ...rows],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function buildTriggerModal() {
  const nameInput = new TextInputBuilder()
    .setCustomId('trigger_name')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(80)
    .setPlaceholder('Ex: Boas-vindas');

  const keywordsInput = new TextInputBuilder()
    .setCustomId('trigger_keywords')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)
    .setPlaceholder('Uma por linha. Ex:\nboa noite\nbom dia');

  const fileInput = new FileUploadBuilder()
    .setCustomId('trigger_file')
    .setMinValues(1)
    .setMaxValues(1)
    .setRequired(true);

  return new ModalBuilder()
    .setCustomId('trigger_add_modal')
    .setTitle('Novo gatilho')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Apelido (opcional)')
        .setTextInputComponent(nameInput),
      new LabelBuilder()
        .setLabel('Palavras-chave')
        .setDescription('Uma por linha. Qualquer uma dispara o mesmo arquivo.')
        .setTextInputComponent(keywordsInput),
      new LabelBuilder()
        .setLabel('Arquivo de resposta')
        .setDescription('Vídeo, gif, imagem ou áudio. Limite de 500 MB.')
        .setFileUploadComponent(fileInput),
    );
}

async function saveAttachment(guildId, triggerId, attachment, fileName) {
  if (!attachment?.url) throw new Error('Arquivo não encontrado.');
  if (attachment.size && attachment.size > MAX_FILE_SIZE) {
    throw new Error('O arquivo excede o limite de 500 MB.');
  }
  if (attachment.contentType && !ALLOWED_TYPES.test(attachment.contentType)) {
    throw new Error('O arquivo precisa ser um vídeo, gif, imagem ou áudio.');
  }

  const folder = join(TRIGGER_DIR, guildId);
  const storageKey = `${guildId}/${triggerId}-${safeFileName(fileName)}`;
  const target = join(TRIGGER_DIR, storageKey);
  const temp = `${target}.part`;
  await mkdir(folder, { recursive: true });

  try {
    const response = await fetch(attachment.url);
    if (!response.ok || !response.body) throw new Error(`download HTTP ${response.status}`);

    let total = 0;
    const limiter = new Transform({
      transform(chunk, encoding, callback) {
        total += chunk.length;
        if (total > MAX_FILE_SIZE) {
          callback(new Error('O arquivo excede o limite de 500 MB.'));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(temp));
    await rename(temp, target);
    if (String(attachment.contentType ?? '').startsWith('video/') && total < 1024) {
      throw new Error('O download retornou um vídeo inválido ou incompleto.');
    }
    return { storageKey, size: total };
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

export async function getTriggerFile(trigger) {
  if (trigger.storageKey) {
    const storedPath = join(TRIGGER_DIR, trigger.storageKey);
    const storedSize = await stat(storedPath)
      .then(fileStat => fileStat.size)
      .catch(() => null);
    if (storedSize !== null && !shouldRefreshStoredFile(trigger, storedSize)) return storedPath;
    if (storedSize !== null) await unlink(storedPath).catch(() => {});
  }

  if (!trigger.responseUrl) return null;
  const source = await resolveTriggerMediaSource(
    trigger.responseUrl,
    trigger.responseType,
  );
  if (!source) return null;
  const saved = await saveAttachment(
    trigger.guildId,
    trigger.id,
    {
      url: source.url,
      size: trigger.responseSize,
      contentType: source.contentType,
    },
    trigger.responseName,
  );
  await prisma.messageTrigger.update({
    where: { id: trigger.id },
    data: {
      storageKey: saved.storageKey,
      responseType: source.contentType,
      responseSize: saved.size,
    },
  }).catch(() => {});
  return join(TRIGGER_DIR, saved.storageKey);
}

export async function handleTriggerButton(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Apenas administradores podem configurar os gatilhos.', flags: 64 });
  }

  if (interaction.customId === 'trigger_add') {
    return interaction.showModal(buildTriggerModal());
  }

  if (interaction.customId === 'trigger_refresh') {
    return interaction.update(await buildTriggerConfigPayload(interaction.guildId));
  }

  if (interaction.customId === 'trigger_delete_select') {
    const triggerId = interaction.values?.[0];
    const trigger = await prisma.messageTrigger.findFirst({
      where: { id: triggerId, guildId: interaction.guildId },
    });
    if (!trigger) return interaction.update(await buildTriggerConfigPayload(interaction.guildId));

    if (trigger.storageKey) {
      await unlink(join(TRIGGER_DIR, trigger.storageKey)).catch(() => {});
    }
    await prisma.messageTrigger.delete({ where: { id: trigger.id } });
    return interaction.update(await buildTriggerConfigPayload(interaction.guildId));
  }
}

export async function handleTriggerModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const name = interaction.fields.getTextInputValue('trigger_name')?.trim() || '';
  const keywordText = interaction.fields.getTextInputValue('trigger_keywords') || '';
  const keywords = parseTriggerKeywords(keywordText);
  const files = interaction.fields.getUploadedFiles('trigger_file', true);
  const attachment = files?.first();

  if (!keywords.length) {
    return interaction.editReply('❌ Adicione pelo menos uma palavra-chave.');
  }
  if (!attachment) {
    return interaction.editReply('❌ Envie um arquivo de resposta.');
  }
  if (attachment.size > MAX_FILE_SIZE) {
    return interaction.editReply('❌ O arquivo excede o limite de 500 MB.');
  }
  if (attachment.contentType && !ALLOWED_TYPES.test(attachment.contentType)) {
    return interaction.editReply('❌ O arquivo precisa ser um vídeo, gif, imagem ou áudio.');
  }

  const trigger = await prisma.messageTrigger.create({
    data: {
      guildId: interaction.guildId,
      name,
      keywords: keywords.join('\n'),
      responseUrl: attachment.url,
      responseName: safeFileName(attachment.name),
      responseType: attachment.contentType || null,
      responseSize: attachment.size || null,
    },
  });

  try {
    const saved = await saveAttachment(
      interaction.guildId,
      trigger.id,
      attachment,
      attachment.name,
    );
    await prisma.messageTrigger.update({
      where: { id: trigger.id },
      data: { storageKey: saved.storageKey, responseSize: saved.size },
    });
  } catch (error) {
    await prisma.messageTrigger.delete({ where: { id: trigger.id } }).catch(() => {});
    return interaction.editReply(`❌ Não consegui salvar o arquivo: ${error.message}`);
  }

  return interaction.editReply(
    `✅ Gatilho **${name || 'sem apelido'}** criado com ${keywords.length} palavra(s)-chave. Ele já está ativo neste servidor.`,
  );
}

export async function findMatchingTrigger(guildId, content) {
  if (!normalizeKeyword(content)) return null;
  const triggers = await listTriggers(guildId);
  return triggers.find(trigger => trigger.keywords
    && getStoredTriggerKeywords(trigger.keywords)
    .some(keyword => matchesTriggerKeyword(content, keyword))) ?? null;
}

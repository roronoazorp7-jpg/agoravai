import { askAI } from './aiManager.js';

const GOOGLE_TTS_URL = 'https://translate.google.com/translate_tts';
const MAX_TTS_CHUNK_LENGTH = 180;
const MAX_SPEECH_LENGTH = 1_500;

function splitSpeechText(text) {
  const normalized = String(text ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<@&?\d+>|<#\d+>|<@!?\d+>/g, '')
    .replace(/[*_~`>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SPEECH_LENGTH);

  if (!normalized) return [];

  const chunks = [];
  let remaining = normalized;
  while (remaining.length > MAX_TTS_CHUNK_LENGTH) {
    const boundary = remaining.slice(0, MAX_TTS_CHUNK_LENGTH + 1).lastIndexOf(' ');
    const cutAt = boundary > 40 ? boundary : MAX_TTS_CHUNK_LENGTH;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function synthesizeChunk(chunk) {
  const url = new URL(GOOGLE_TTS_URL);
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('tl', 'pt-BR');
  url.searchParams.set('q', chunk);

  const response = await fetch(url, {
    headers: {
      Accept: 'audio/mpeg',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Google TTS retornou HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('audio')) {
    throw new Error('Google TTS não retornou áudio');
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function textToSpeech(text) {
  const chunks = splitSpeechText(text);
  if (!chunks.length) throw new Error('Não há texto falável');

  const audioParts = [];
  for (const chunk of chunks) {
    audioParts.push(await synthesizeChunk(chunk));
  }
  return Buffer.concat(audioParts);
}

export async function answerWithVoice({ message, prompt }) {
  const answer = await askAI({
    guildId: message.guildId,
    userId: message.author.id,
    prompt,
    serverName: message.guild?.name,
  });

  try {
    const audio = await textToSpeech(answer);
    return { answer, audio };
  } catch (error) {
    error.aiAnswer = answer;
    throw error;
  }
}
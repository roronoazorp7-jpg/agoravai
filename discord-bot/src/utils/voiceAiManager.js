import { askAI } from './aiManager.js';

const ELEVENLABS_TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const DEFAULT_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';
const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
const MAX_TTS_CHUNK_LENGTH = 1_800;
const MAX_SPEECH_LENGTH = 1_500;

export function isVoiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

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
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const response = await fetch(`${ELEVENLABS_TTS_URL}/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: chunk,
      model_id: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL_ID,
      output_format: 'mp3_44100_128',
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ElevenLabs retornou HTTP ${response.status}: ${detail.slice(0, 220)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('audio')) {
    throw new Error('ElevenLabs não retornou áudio MP3');
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function textToSpeech(text) {
  if (!isVoiceConfigured()) {
    throw new Error('ELEVENLABS_API_KEY não configurada');
  }

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
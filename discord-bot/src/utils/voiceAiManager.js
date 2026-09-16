import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { askAI } from './aiManager.js';

// A resposta de voz usa exclusivamente XTTS-v2 e uma amostra local autorizada.
const XTTS_SCRIPT = resolve(
  process.env.XTTS_SCRIPT?.trim() || join(process.cwd(), 'scripts', 'xtts_worker.py'),
);
const XTTS_SPEAKER_WAV = resolve(
  process.env.XTTS_SPEAKER_WAV?.trim() || join(process.cwd(), 'assets', 'tts', 'xtts-speaker.wav'),
);
const XTTS_PYTHON = process.env.XTTS_PYTHON?.trim()
  || process.env.PYTHON_BIN?.trim()
  || process.env.PIPER_PYTHON?.trim()
  || 'python3';
const XTTS_USE_GPU = process.env.XTTS_USE_GPU?.trim() || 'false';
const XTTS_CACHE_DIR = resolve(
  process.env.XTTS_CACHE_DIR?.trim() || join(process.cwd(), 'data', 'tts', 'xtts-cache'),
);
const MAX_TTS_CHUNK_LENGTH = 1_800;
const MAX_SPEECH_LENGTH = 1_500;
const XTTS_SYNTHESIS_TIMEOUT_MS = 180_000;
const FFMPEG_TIMEOUT_MS = 45_000;

let xttsWorkerState = null;

export function isVoiceConfigured() {
  return process.env.VOICE_TTS_DISABLED?.trim().toLowerCase() !== 'true';
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

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      const error = new Error(`${command} excedeu o tempo limite`);
      error.code = 'PROCESS_TIMEOUT';
      rejectProcess(error);
    }, timeoutMs);

    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      clearTimeout(timer);
      rejectProcess(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        const error = new Error(`${command} encerrou com código ${code}: ${Buffer.concat(stderr).toString().slice(0, 500)}`);
        error.code = 'PROCESS_ERROR';
        rejectProcess(error);
        return;
      }
      resolveProcess();
    });

    child.stdin.end(input);
  });
}

function rejectXttsWorker(state, error) {
  if (xttsWorkerState === state) xttsWorkerState = null;
  while (state.pending.length) {
    state.pending.shift().reject(error);
  }
}

function getXttsWorker() {
  if (xttsWorkerState) return xttsWorkerState;

  const child = spawn(XTTS_PYTHON, [XTTS_SCRIPT], {
    env: {
      ...process.env,
      XTTS_SPEAKER_WAV,
      XTTS_USE_GPU,
      XDG_CACHE_HOME: XTTS_CACHE_DIR,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const state = {
    child,
    buffer: '',
    pending: [],
    settled: false,
  };
  xttsWorkerState = state;

  child.stdout.on('data', chunk => {
    state.buffer += chunk.toString();
    let newlineIndex = state.buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = state.buffer.slice(0, newlineIndex).trim();
      state.buffer = state.buffer.slice(newlineIndex + 1);
      newlineIndex = state.buffer.indexOf('\n');
      if (!line) continue;

      let response;
      try {
        response = JSON.parse(line);
      } catch {
        continue;
      }

      const pending = state.pending.findIndex(item => item.id === response.id);
      if (pending < 0) continue;
      const request = state.pending.splice(pending, 1)[0];
      if (response.ok) request.resolve(response);
      else request.reject(new Error(response.error || 'XTTS falhou ao gerar o áudio'));
    }
  });

  child.stderr.on('data', chunk => {
    const message = chunk.toString().trim();
    if (message) console.error(`[XTTS] ${message}`);
  });

  child.once('error', error => {
    if (!state.settled) {
      state.settled = true;
      rejectXttsWorker(state, error);
    }
  });
  child.once('close', code => {
    if (!state.settled) {
      state.settled = true;
      rejectXttsWorker(state, new Error(`XTTS encerrou com código ${code}`));
    }
  });

  return state;
}

async function synthesizeXttsChunk(chunk) {
  if (!await fileExists(XTTS_SPEAKER_WAV)) {
    const error = new Error(
      `Amostra do XTTS não encontrada em ${XTTS_SPEAKER_WAV}. ` +
      'Configure XTTS_SPEAKER_WAV com um WAV limpo de 6 a 15 segundos.',
    );
    error.code = 'XTTS_SPEAKER_MISSING';
    throw error;
  }

  const state = getXttsWorker();
  const workDir = await mkdtemp(join(tmpdir(), 'savage-xtts-'));
  const wavPath = join(workDir, 'speech.wav');
  const id = randomUUID();

  try {
    await new Promise((resolveRequest, rejectRequest) => {
      state.pending.push({ id, resolve: resolveRequest, reject: rejectRequest });
      state.child.stdin.write(`${JSON.stringify({ id, text: chunk, outputPath: wavPath })}\n`, error => {
        if (error) rejectRequest(error);
      });
      setTimeout(() => {
        const index = state.pending.findIndex(item => item.id === id);
        if (index >= 0) {
          state.pending.splice(index, 1);
          const error = new Error('XTTS excedeu o tempo limite de síntese');
          error.code = 'XTTS_TIMEOUT';
          rejectRequest(error);
        }
      }, XTTS_SYNTHESIS_TIMEOUT_MS).unref();
    });

    const audio = await readFile(wavPath);
    if (!audio.length) throw new Error('XTTS gerou um WAV vazio');
    return audio;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function convertWavToMp3(wav, outputPath) {
  const workDir = await mkdtemp(join(tmpdir(), 'savage-mp3-'));
  const wavPath = join(workDir, 'speech.wav');
  try {
    await writeFile(wavPath, wav);
    await runProcess(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        wavPath,
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '128k',
        outputPath,
      ],
      '',
      FFMPEG_TIMEOUT_MS,
    );
    return readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function textToSpeech(text) {
  if (!isVoiceConfigured()) {
    throw new Error('VOICE_TTS_DISABLED está ativado');
  }

  const chunks = splitSpeechText(text);
  if (!chunks.length) throw new Error('Não há texto falável');

  const chunk = chunks[0];
  const wav = await synthesizeXttsChunk(chunk);
  const outputPath = join(tmpdir(), `savage-xtts-${randomUUID()}.mp3`);
  try {
    return await convertWavToMp3(wav, outputPath);
  } finally {
    await rm(outputPath, { force: true }).catch(() => {});
  }
}

export async function answerWithVoice({ message, prompt }) {
  const answer = await askAI({
    guildId: message.guildId,
    userId: message.author.id,
    prompt,
    serverName: message.guild?.name,
    voice: true,
  });

  try {
    const audio = await textToSpeech(answer);
    return { answer, audio };
  } catch (error) {
    error.aiAnswer = answer;
    throw error;
  }
}
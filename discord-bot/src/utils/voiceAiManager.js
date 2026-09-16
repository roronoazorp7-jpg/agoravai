import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { askAI } from './aiManager.js';

// Voz feminina pt-BR Dii, distribuída pela TigreGotico sob CC BY-NC-ND 4.0.
// O uso deve continuar não comercial e a atribuição da licença deve ser mantida.
const PIPER_MODEL_NAME = process.env.PIPER_MODEL_NAME?.trim() || 'dii_pt-BR';
const PIPER_MODEL_DIR = resolve(
  process.env.PIPER_MODEL_DIR?.trim() || join(process.cwd(), 'data', 'tts'),
);
const PIPER_PYTHON = resolve(
  process.env.PIPER_PYTHON?.trim() || join(process.cwd(), '.venv', 'bin', 'python'),
);
const PIPER_MODEL_BASE_URL = process.env.PIPER_MODEL_BASE_URL?.trim()
  || 'https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii/resolve/main';
const EDGE_TTS_VOICE = process.env.EDGE_TTS_VOICE?.trim() || 'pt-BR-FranciscaNeural';
const MAX_TTS_CHUNK_LENGTH = 1_800;
const MAX_SPEECH_LENGTH = 1_500;
const PIPER_DOWNLOAD_TIMEOUT_MS = 120_000;
const PIPER_SYNTHESIS_TIMEOUT_MS = 45_000;

let piperModelPromise = null;

export function isVoiceConfigured() {
  return process.env.PIPER_TTS_DISABLED?.trim().toLowerCase() !== 'true';
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

function modelPaths() {
  return {
    model: join(PIPER_MODEL_DIR, `${PIPER_MODEL_NAME}.onnx`),
    config: join(PIPER_MODEL_DIR, `${PIPER_MODEL_NAME}.onnx.json`),
  };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadModelFile(fileName, destination) {
  const response = await fetch(`${PIPER_MODEL_BASE_URL}/${fileName}`, {
    signal: AbortSignal.timeout(PIPER_DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Piper não conseguiu baixar ${fileName}: HTTP ${response.status}`);
  }

  const temporaryPath = `${destination}.${randomUUID()}.part`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function ensurePiperModel() {
  const paths = modelPaths();
  if (await fileExists(paths.model) && await fileExists(paths.config)) return paths;

  if (!piperModelPromise) {
    piperModelPromise = (async () => {
      await mkdir(PIPER_MODEL_DIR, { recursive: true });
      if (!await fileExists(paths.config)) {
        await downloadModelFile(`${PIPER_MODEL_NAME}.onnx.json`, paths.config);
      }
      if (!await fileExists(paths.model)) {
        await downloadModelFile(`${PIPER_MODEL_NAME}.onnx`, paths.model);
      }
      return paths;
    })().catch(error => {
      piperModelPromise = null;
      error.code = error.code || 'PIPER_MODEL_ERROR';
      throw error;
    });
  }

  return piperModelPromise;
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
      error.code = 'PIPER_TIMEOUT';
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
        error.code = 'PIPER_PROCESS_ERROR';
        rejectProcess(error);
        return;
      }
      resolveProcess();
    });

    child.stdin.end(input);
  });
}

async function synthesizeChunk(chunk) {
  const paths = await ensurePiperModel();
  const workDir = await mkdtemp(join(tmpdir(), 'savage-piper-'));
  const wavPath = join(workDir, 'speech.wav');

  try {
    await runProcess(
      PIPER_PYTHON,
      [
        '-m',
        'piper',
        '-m',
        PIPER_MODEL_NAME,
        '--data-dir',
        dirname(paths.model),
        '-f',
        wavPath,
      ],
      `${chunk}\n`,
      PIPER_SYNTHESIS_TIMEOUT_MS,
    );

    const audio = await readFile(wavPath);
    if (!audio.length) throw new Error('Piper gerou um arquivo WAV vazio');
    return audio;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function synthesizeNeuralChunk(chunk) {
  const workDir = await mkdtemp(join(tmpdir(), 'savage-edge-tts-'));
  const outputPath = join(workDir, 'speech.mp3');

  try {
    await runProcess(
      PIPER_PYTHON,
      [
        '-m',
        'edge_tts',
        '--voice',
        EDGE_TTS_VOICE,
        '--rate',
        '+0%',
        '--pitch',
        '+0Hz',
        '--text',
        chunk,
        '--write-media',
        outputPath,
      ],
      '',
      PIPER_SYNTHESIS_TIMEOUT_MS,
    );

    const audio = await readFile(outputPath);
    if (!audio.length) throw new Error('Edge TTS gerou um arquivo MP3 vazio');
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
      PIPER_SYNTHESIS_TIMEOUT_MS,
    );
    return readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function textToSpeech(text) {
  if (!isVoiceConfigured()) {
    throw new Error('PIPER_TTS_DISABLED está ativado');
  }

  const chunks = splitSpeechText(text);
  if (!chunks.length) throw new Error('Não há texto falável');

  const chunk = chunks[0];
  try {
    return await synthesizeNeuralChunk(chunk);
  } catch {
    // O Piper local mantém a resposta disponível quando o serviço neural
    // estiver temporariamente indisponível ou sem acesso à internet.
  }

  const wav = await synthesizeChunk(chunk);
  const outputPath = join(tmpdir(), `savage-${randomUUID()}.mp3`);
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
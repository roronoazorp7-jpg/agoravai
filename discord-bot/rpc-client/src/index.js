import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const IPC_VERSION = 1;
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const MAX_PIPE_INDEX = 10;
const RECONNECT_DELAY_MS = 4_000;
const CONNECTION_TIMEOUT_MS = 1_500;
const CONFIG_FILE = path.resolve('rpc.config.json');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2).replaceAll('-', '');
    if (key === 'clear' || key === 'once') {
      args[key] = true;
      continue;
    }
    args[key] = argv[index + 1] ?? '';
    index += 1;
  }
  return args;
}

function parseDotEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

async function loadLocalEnv() {
  try {
    return parseDotEnv(await readFile(path.resolve('.env'), 'utf8'));
  } catch {
    return {};
  }
}

async function loadConfig() {
  const envFile = await loadLocalEnv();
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(CONFIG_FILE, 'utf8'));
  } catch {}

  const env = { ...envFile, ...process.env };
  const args = parseArgs(process.argv.slice(2));
  const buttonsFromEnv = [
    ['RPC_BUTTON_1_LABEL', 'RPC_BUTTON_1_URL'],
    ['RPC_BUTTON_2_LABEL', 'RPC_BUTTON_2_URL'],
  ]
    .map(([labelKey, urlKey]) => ({
      label: env[labelKey]?.trim(),
      url: env[urlKey]?.trim(),
    }))
    .filter(button => button.label && button.url);

  const source = {
    clientId: args.clientid || fileConfig.clientId || env.DISCORD_APPLICATION_ID,
    details: args.details || fileConfig.details || env.RPC_DETAILS || 'Savagge',
    state: args.state || fileConfig.state || env.RPC_STATE || 'Explorando o servidor',
    largeImageKey: args.largeimage || fileConfig.largeImageKey || env.RPC_LARGE_IMAGE || '',
    largeImageText: args.largetext || fileConfig.largeImageText || env.RPC_LARGE_TEXT || '',
    smallImageKey: args.smallimage || fileConfig.smallImageKey || env.RPC_SMALL_IMAGE || '',
    smallImageText: args.smalltext || fileConfig.smallImageText || env.RPC_SMALL_TEXT || '',
    timer: args.timer === undefined
      ? (fileConfig.timer ?? env.RPC_TIMER !== 'false')
      : args.timer !== 'false',
    buttons: Array.isArray(fileConfig.buttons) && fileConfig.buttons.length
      ? fileConfig.buttons
      : buttonsFromEnv,
    clear: Boolean(args.clear),
    once: Boolean(args.once),
  };

  return source;
}

function limit(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildActivity(config) {
  const activity = {
    type: 0,
    details: limit(config.details, 128),
    state: limit(config.state, 128),
    instance: true,
  };

  if (config.timer) activity.timestamps = { start: Date.now() };

  const assets = {};
  if (config.largeImageKey) assets.large_image = limit(config.largeImageKey, 32);
  if (config.largeImageText) assets.large_text = limit(config.largeImageText, 128);
  if (config.smallImageKey) assets.small_image = limit(config.smallImageKey, 32);
  if (config.smallImageText) assets.small_text = limit(config.smallImageText, 128);
  if (Object.keys(assets).length) activity.assets = assets;

  const buttons = (config.buttons ?? [])
    .filter(button => button?.label && validHttpUrl(button.url))
    .slice(0, 2)
    .map(button => ({
      label: limit(button.label, 32),
      url: button.url,
    }));
  if (buttons.length) activity.buttons = buttons;

  return activity;
}

function pipeNames() {
  const names = [];
  for (let index = 0; index < MAX_PIPE_INDEX; index += 1) {
    if (process.platform === 'win32') {
      names.push(`\\\\?\\pipe\\discord-ipc-${index}`);
      continue;
    }

    names.push(`/tmp/discord-ipc-${index}`);
    if (process.env.XDG_RUNTIME_DIR) {
      names.push(path.join(process.env.XDG_RUNTIME_DIR, `discord-ipc-${index}`));
    }
    if (process.platform === 'darwin' && process.env.HOME) {
      names.push(path.join(
        process.env.HOME,
        'Library/Application Support/discord',
        `discord-ipc-${index}`,
      ));
    }
  }
  return [...new Set(names)];
}

function connectToPipe(pipeName) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(pipeName);
    let settled = false;

    const fail = error => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(CONNECTION_TIMEOUT_MS, () => {
      fail(new Error(`timeout em ${pipeName}`));
    });
    socket.once('error', fail);
    socket.once('connect', () => {
      if (settled) return;
      settled = true;
      socket.setTimeout(0);
      socket.removeListener('error', fail);
      resolve(socket);
    });
  });
}

class DiscordIpcClient {
  constructor(clientId) {
    this.clientId = clientId;
    this.socket = null;
    this.pending = Buffer.alloc(0);
    this.connectedPipe = null;
  }

  async connect() {
    let lastError = null;
    for (const pipeName of pipeNames()) {
      try {
        const socket = await connectToPipe(pipeName);
        this.socket = socket;
        this.connectedPipe = pipeName;
        socket.on('data', chunk => this.handleData(chunk));
        socket.on('close', () => {
          this.socket = null;
          this.connectedPipe = null;
        });
        socket.on('error', error => {
          console.warn(`[RPC] conexão interrompida: ${error.message}`);
        });
        this.send(OP_HANDSHAKE, { v: IPC_VERSION, client_id: this.clientId });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      'Discord Desktop não encontrado. Abra o aplicativo Discord antes de iniciar o RPC.'
      + (lastError ? ` (${lastError.message})` : ''),
    );
  }

  handleData(chunk) {
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 8) {
      const opcode = this.pending.readUInt32LE(0);
      const length = this.pending.readUInt32LE(4);
      if (this.pending.length < 8 + length) return;
      const body = this.pending.subarray(8, 8 + length).toString('utf8');
      this.pending = this.pending.subarray(8 + length);
      try {
        const payload = JSON.parse(body);
        if (payload.evt === 'ERROR') {
          console.warn(`[RPC] Discord retornou erro: ${payload.data?.message ?? 'desconhecido'}`);
        } else if (opcode === OP_FRAME && payload.evt === 'READY') {
          console.log('[RPC] Discord Desktop aceitou a conexão.');
        }
      } catch {
        console.warn('[RPC] resposta inválida recebida do Discord.');
      }
    }
  }

  send(opcode, payload) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('RPC sem conexão IPC.');
    }
    const body = Buffer.from(JSON.stringify(payload));
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(body.length, 4);
    this.socket.write(Buffer.concat([header, body]));
  }

  setActivity(activity) {
    this.send(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: randomUUID(),
    });
  }

  clearActivity() {
    this.send(OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity: null },
      nonce: randomUUID(),
    });
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.end();
    this.socket = null;
    this.connectedPipe = null;
  }
}

function printUsage() {
  console.log([
    'Uso:',
    '  1. Copie .env.example para .env e informe DISCORD_APPLICATION_ID.',
    '  2. Abra o Discord Desktop.',
    '  3. Execute: npm start',
    '',
    'Opções:',
    '  --client-id ID       Sobrescreve o ID da aplicação.',
    '  --details TEXTO      Título da atividade.',
    '  --state TEXTO        Estado exibido abaixo do título.',
    '  --clear              Remove o RPC e encerra.',
    '  --once               Publica uma vez e encerra.',
  ].join('\n'));
}

async function main() {
  const config = await loadConfig();
  if (!config.clientId || config.clientId.includes('cole_o_id')) {
    printUsage();
    throw new Error('DISCORD_APPLICATION_ID não foi configurado.');
  }

  const client = new DiscordIpcClient(config.clientId);
  let stopping = false;

  const stop = () => {
    if (stopping) return;
    stopping = true;
    try {
      if (client.socket && !config.once) client.clearActivity();
    } catch {}
    client.close();
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    try {
      await client.connect();
      if (config.clear) {
        client.clearActivity();
        console.log('[RPC] atividade removida.');
        stop();
        return;
      }

      client.setActivity(buildActivity(config));
      console.log(`[RPC] ativo pelo pipe ${client.connectedPipe}. Pressione Ctrl+C para sair.`);
      if (config.once) {
        stop();
        return;
      }

      await new Promise(resolve => {
        const check = setInterval(() => {
          if (!client.socket) {
            clearInterval(check);
            resolve();
          }
        }, 500);
      });
      if (!stopping) {
        console.log(`[RPC] Discord fechado. Tentando reconectar em ${RECONNECT_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    } catch (error) {
      if (config.once || config.clear) {
        stop();
        throw error;
      }
      console.warn(`[RPC] ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
    }
  }
}

main().catch(error => {
  console.error(`[RPC] ${error.message}`);
  process.exitCode = 1;
});
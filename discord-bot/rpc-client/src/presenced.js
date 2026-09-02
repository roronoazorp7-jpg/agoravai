import dgram from 'node:dgram';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const IPC_VERSION = 1;
const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const MAX_PIPE_INDEX = 10;
const IPC_TIMEOUT_MS = 1_500;
const CONSOLE_TIMEOUT_MS = 1_200;
const RECONNECT_DELAY_MS = 4_000;
const CONFIG_FILE = path.resolve('presenced.config.json');

const DEFAULT_CONFIG = {
  clientId: '',
  pollInterval: 10,
  consoleClients: 'all',
  presence: {
    useCommonFormat: true,
    resetTimeOnAppChange: true,
    commonFormat: {
      displayType: 2,
      appName: 'console_name',
      details1: 'app_name',
      details2: 'info_network',
      imageBigText: 'app_name',
      imageBigType: 'image_app',
      imageSmallText: 'info_firmware',
      imageSmallType: 'image_console',
    },
    ps3Format: {},
    wiiuFormat: {},
  },
  clientConfig: {
    ps3: {
      address: '',
      networkName: 'PSN',
      networkNameFull: 'PlayStation Network',
      networkId: '{anon-user}',
      useCelsius: true,
    },
    wiiu: {
      udpPort: 5005,
      firmwareVer: '{unknown-ver}',
      hardwareText: 'IBM Espresso | AMD Latte',
    },
  },
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2).replaceAll('-', '');
    if (['once', 'clear', 'dryrun'].includes(key)) {
      args[key] = true;
      continue;
    }
    args[key] = argv[index + 1] ?? '';
    index += 1;
  }
  return args;
}

function merge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) &&
        base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = merge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return {};
  }
}

async function loadConfig() {
  const args = parseArgs(process.argv.slice(2));
  const fileConfig = await readJson(args.config || CONFIG_FILE);
  const env = process.env;
  const config = merge(DEFAULT_CONFIG, fileConfig);

  config.clientId = args.clientid || config.clientId || env.DISCORD_APPLICATION_ID || '';
  config.pollInterval = Math.max(
    2,
    Number(args.pollinterval || config.pollInterval || env.PRESENCED_POLL_INTERVAL || 10),
  );

  const consoles = args.consoles || config.consoleClients || env.PRESENCED_CONSOLES || 'all';
  config.consoleClients = Array.isArray(consoles)
    ? consoles
    : String(consoles).toLowerCase() === 'all'
      ? ['PS3', 'WiiU']
      : String(consoles).split(',').map(item => item.trim()).filter(Boolean);

  config.clientConfig.ps3.address =
    args.ps3address || config.clientConfig.ps3.address || env.PRESENCED_PS3_ADDRESS || '';
  config.clientConfig.wiiu.udpPort = Number(
    args.wiiuport || config.clientConfig.wiiu.udpPort || env.PRESENCED_WIIU_UDP_PORT || 5005,
  );

  return {
    ...config,
    once: Boolean(args.once),
    clear: Boolean(args.clear),
    dryRun: Boolean(args.dryrun),
  };
}

function limit(value, max = 128) {
  return String(value ?? '').trim().slice(0, max);
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function anchorText(html, href) {
  const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(
    `<a[^>]+href=["']${escapedHref}["'][^>]*>([\\s\\S]*?)<\\/a>`,
    'i',
  ));
  return stripHtml(match?.[1] ?? '');
}

function firstNumber(value) {
  const match = String(value ?? '').match(/\d+/);
  return match?.[0] ?? '';
}

export function parsePs3Sman(html) {
  const content = String(html ?? '');
  if (!content.includes('id="content"') && !content.includes("id='content'")) return null;

  let titleId = 'XMB';
  let titleName = 'XMB';
  if (!content.includes('/browser.ps3$slaunch')) {
    const gameMatch = content.match(/<a[^>]+target=["']_blank["'][^>]*>([\s\S]*?)<\/a>/i);
    if (gameMatch) {
      titleId = stripHtml(gameMatch[1]);
      const afterGameLink = content.slice((gameMatch.index ?? 0) + gameMatch[0].length);
      titleName = stripHtml(afterGameLink.match(/>([^<>]+)</)?.[1] ?? '') || titleId;
      titleName = titleName.replace(/\s+\d{2}\.\d{2}\s*$/, '').trim();
    } else {
      titleId = 'PS1';
      titleName = 'PlayStation Classics';
    }
  }

  const cpuText = anchorText(content, '/cpursx.ps3?up');
  const tempText = anchorText(content, '/cpursx.ps3?dn');
  const fanText = anchorText(content, '/cpursx.ps3?mode');
  const firmwareText = anchorText(content, '/setup.ps3');
  const cpuC = firstNumber(cpuText.match(/CPU.*?(\d+)\s*C/i)?.[1]);
  const rsxC = firstNumber(cpuText.match(/RSX.*?(\d+)\s*C/i)?.[1]);
  const cpuF = firstNumber(tempText.match(/CPU.*?(\d+)\s*F/i)?.[1]);
  const rsxF = firstNumber(tempText.match(/RSX.*?(\d+)\s*F/i)?.[1]);
  const firmware = firmwareText.match(/(\d\.\d{2}\s+\w+)/)?.[1] ?? '';

  return {
    titleId,
    titleName,
    cpuTemp: { c: cpuC, f: cpuF },
    rsxTemp: { c: rsxC, f: rsxF },
    fanSpeed: firstNumber(fanText),
    firmware,
  };
}

async function fetchText(url, timeout = CONSOLE_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Presenced/1.0' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

class PS3Client {
  constructor(config, presenceConfig) {
    this.config = config;
    this.presenceConfig = presenceConfig;
    this.data = null;
    this.oldTitleId = null;
    this.appStartTime = 0;
  }

  async poll() {
    if (!this.config.address) {
      this.data = null;
      return false;
    }

    try {
      const html = await fetchText(`http://${this.config.address}/cpursx.ps3?/sman.ps3`);
      const data = parsePs3Sman(html);
      if (!data) throw new Error('página WebMAN sem conteúdo');
      if (!this.appStartTime || (
        this.presenceConfig.resetTimeOnAppChange && this.oldTitleId !== data.titleId
      )) {
        this.appStartTime = Math.floor(Date.now() / 1000);
      }
      this.oldTitleId = data.titleId;
      this.data = data;
      return true;
    } catch {
      this.data = null;
      return false;
    }
  }

  getRPCData() {
    if (!this.data) return null;
    const useCelsius = this.config.useCelsius !== false;
    const tempUnit = useCelsius ? 'c' : 'f';
    const format = this.presenceConfig.format;
    const text = {
      console_name: () => 'PlayStation 3',
      app_name: () => this.data.titleName,
      network_name: () => this.config.networkNameFull,
      info_firmware: () => `GameOS: ${this.data.firmware}`,
      info_network: () => `${this.config.networkName}: ${this.config.networkId}`,
      info_hardware: () =>
        `Cell: ${this.data.cpuTemp[tempUnit]}°${tempUnit.toUpperCase()} | `
        + `RSX: ${this.data.rsxTemp[tempUnit]}°${tempUnit.toUpperCase()}`,
    };
    return buildRPCData(format, text, {
      image_console: () => 'ps3',
      image_network: () => this.config.networkName === 'PSN' ? 'playstation' : 'unknown',
      image_app: () => this.config.appImage || 'unknown',
    }, this.appStartTime);
  }
}

function toEpoch(seconds, dst = 0) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return Math.floor(Date.now() / 1000);
  const offset = dst ? new Date().getTimezoneOffset() * -60 : 0;
  return Math.floor(value - offset);
}

function pollWiiU(port) {
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = data => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve(data);
    };
    socket.once('error', () => finish(null));
    socket.on('message', message => {
      try {
        const value = JSON.parse(message.toString('utf8'));
        if (value.sender !== 'Wii U') return;
        finish({
          longTitleName: value.long,
          shortTitleName: value.app,
          networkId: value.nnid || '{anon-user}',
          network: value.img || 'uk',
          time: toEpoch(value.time, value.dst),
        });
      } catch {}
    });
    socket.bind(port);
    setTimeout(() => finish(null), CONSOLE_TIMEOUT_MS);
  });
}

class WiiUClient {
  constructor(config, presenceConfig) {
    this.config = config;
    this.presenceConfig = presenceConfig;
    this.data = null;
    this.appStartTime = 0;
  }

  async poll() {
    const data = await pollWiiU(this.config.udpPort);
    if (!data) {
      this.data = null;
      return false;
    }
    if (!this.appStartTime || this.presenceConfig.resetTimeOnAppChange &&
        this.data?.longTitleName !== data.longTitleName) {
      this.appStartTime = data.time;
    }
    this.data = data;
    return true;
  }

  getRPCData() {
    if (!this.data) return null;
    const format = this.presenceConfig.format;
    const networkName = this.data.network === 'nn'
      ? 'Nintendo Network'
      : this.data.network === 'pn'
        ? 'Pretendo Network'
        : 'Unknown';
    const networkIdLabel = this.data.network === 'nn'
      ? 'NNID'
      : this.data.network === 'pn'
        ? 'PNID'
        : 'NID';
    const text = {
      console_name: () => 'Wii U',
      app_name: () => this.data.shortTitleName,
      network_name: () => networkName,
      info_firmware: () => `CafeOS: ${this.config.firmwareVer}`,
      info_network: () => `${networkIdLabel}: ${this.data.networkId}`,
      info_hardware: () => this.config.hardwareText,
    };
    return buildRPCData(format, text, {
      image_console: () => 'wiiu',
      image_network: () => this.data.network === 'nn'
        ? 'nintendo'
        : this.data.network === 'pn' ? 'pretendo' : 'unknown',
      image_app: () => this.config.appImage || 'unknown',
    }, this.appStartTime);
  }
}

function buildRPCData(format, textRules, imageRules, startTime) {
  const resolve = (value, rules) => {
    if (!value) return null;
    return rules[value] ? limit(rules[value]()) : limit(value);
  };
  return {
    startTime,
    displayType: Number(format.displayType) || 2,
    name: resolve(format.appName, textRules) || 'Presenced',
    details: resolve(format.details1, textRules),
    state: resolve(format.details2, textRules),
    largeText: resolve(format.imageBigText, textRules),
    largeImage: resolve(format.imageBigType, imageRules),
    smallText: resolve(format.imageSmallText, textRules),
    smallImage: resolve(format.imageSmallType, imageRules),
  };
}

function presenceFormat(config, clientName) {
  const common = config.presence.commonFormat ?? {};
  const specific = clientName === 'PS3'
    ? config.presence.ps3Format
    : config.presence.wiiuFormat;
  return {
    ...common,
    ...(config.presence.useCommonFormat ? {} : specific ?? {}),
  };
}

function pipeNames() {
  const names = [];
  for (let index = 0; index < MAX_PIPE_INDEX; index += 1) {
    if (process.platform === 'win32') names.push(`\\\\?\\pipe\\discord-ipc-${index}`);
    else names.push(`/tmp/discord-ipc-${index}`);
  }
  if (process.env.XDG_RUNTIME_DIR) {
    for (let index = 0; index < MAX_PIPE_INDEX; index += 1) {
      names.push(path.join(process.env.XDG_RUNTIME_DIR, `discord-ipc-${index}`));
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
    socket.setTimeout(IPC_TIMEOUT_MS, () => fail(new Error(`timeout em ${pipeName}`)));
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
        socket.on('error', error => console.warn(`[Presenced] RPC: ${error.message}`));
        this.send(OP_HANDSHAKE, { v: IPC_VERSION, client_id: this.clientId });
        return;
      } catch {}
    }
    throw new Error('Discord Desktop não encontrado. Abra o Discord antes de iniciar o Presenced.');
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
          console.warn(`[Presenced] Discord recusou RPC: ${payload.data?.message ?? 'desconhecido'}`);
        } else if (opcode === OP_FRAME && payload.evt === 'READY') {
          console.log('[Presenced] Discord Desktop aceitou a conexão.');
        }
      } catch {}
    }
  }

  send(opcode, payload) {
    if (!this.socket || this.socket.destroyed) throw new Error('RPC sem conexão IPC.');
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
    this.setActivity(null);
  }

  close() {
    if (this.socket && !this.socket.destroyed) this.socket.end();
    this.socket = null;
    this.connectedPipe = null;
  }
}

function toActivity(data) {
  const activity = {
    type: 0,
    details: limit(data.details),
    state: limit(data.state),
    instance: true,
  };
  if (data.startTime) activity.timestamps = { start: data.startTime * 1000 };
  const assets = {};
  if (data.largeImage) assets.large_image = limit(data.largeImage, 32);
  if (data.largeText) assets.large_text = limit(data.largeText);
  if (data.smallImage) assets.small_image = limit(data.smallImage, 32);
  if (data.smallText) assets.small_text = limit(data.smallText);
  if (Object.keys(assets).length) activity.assets = assets;
  return activity;
}

function createClients(config) {
  const clients = [];
  const selected = new Set(config.consoleClients);
  if (selected.has('PS3')) {
    const clientConfig = config.clientConfig.ps3;
    clients.push(new PS3Client(clientConfig, {
      resetTimeOnAppChange: config.presence.resetTimeOnAppChange,
      format: presenceFormat(config, 'PS3'),
    }));
  }
  if (selected.has('WiiU')) {
    const clientConfig = config.clientConfig.wiiu;
    clients.push(new WiiUClient(clientConfig, {
      resetTimeOnAppChange: config.presence.resetTimeOnAppChange,
      format: presenceFormat(config, 'WiiU'),
    }));
  }
  return clients;
}

function printUsage() {
  console.log([
    'Presenced — Rich Presence automático para PS3 e Wii U',
    '',
    'Uso:',
    '  1. Copie presenced.config.example.json para presenced.config.json.',
    '  2. Informe clientId e o endereço do PS3, se for usar PS3.',
    '  3. Abra o Discord Desktop.',
    '  4. Execute: npm run presenced',
    '',
    'Opções:',
    '  --config CAMINHO       Usa outro arquivo JSON.',
    '  --ps3-address IP       Sobrescreve o IP do PS3.',
    '  --wiiu-port PORTA      Sobrescreve a porta UDP do Wii U.',
    '  --consoles PS3,WiiU    Seleciona os consoles monitorados.',
    '  --once                 Faz uma leitura e encerra.',
    '  --dry-run              Mostra os dados sem conectar ao Discord.',
    '  --clear                Remove a atividade e encerra.',
  ].join('\n'));
}

export async function runPresenced(config = null) {
  const settings = config ?? await loadConfig();
  if (!settings.clientId && !settings.dryRun) {
    printUsage();
    throw new Error('DISCORD_APPLICATION_ID/clientId não foi configurado.');
  }

  const ipc = settings.dryRun ? null : new DiscordIpcClient(settings.clientId);
  if (settings.clear) {
    if (ipc) {
      await ipc.connect();
      try {
        ipc.clearActivity();
        console.log('[Presenced] atividade removida.');
      } finally {
        ipc.close();
      }
    }
    return;
  }

  const clients = createClients(settings);
  if (!clients.length) throw new Error('Nenhum console válido foi selecionado.');
  let stopping = false;
  let active = false;

  const stop = () => {
    if (stopping) return;
    stopping = true;
    try {
      if (ipc && active) ipc.clearActivity();
    } catch {}
    ipc?.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    const results = await Promise.all(clients.map(async client => ({
      client,
      active: await client.poll(),
    })));
    const current = results.find(item => item.active)?.client ?? null;
    const data = current?.getRPCData() ?? null;

    if (settings.dryRun) {
      console.log(JSON.stringify(data, null, 2));
      if (settings.once) break;
    } else {
      try {
        if (!ipc.socket) await ipc.connect();
        if (data) {
          ipc.setActivity(toActivity(data));
          active = true;
          console.log(`[Presenced] ${data.name}: ${data.details ?? ''}`);
        } else if (active) {
          ipc.clearActivity();
          active = false;
          console.log('[Presenced] nenhum console ativo; atividade removida.');
        }
        if (settings.once) break;
      } catch (error) {
        console.warn(`[Presenced] ${error.message}`);
        if (settings.once || settings.clear) throw error;
        await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
    await new Promise(resolve => setTimeout(resolve, settings.pollInterval * 1000));
  }

  stop();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPresenced().catch(error => {
    console.error(`[Presenced] ${error.message}`);
    process.exitCode = 1;
  });
}
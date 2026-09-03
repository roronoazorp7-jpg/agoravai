import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const LOCAL_EMOJI_DIR = fileURLToPath(new URL('../../assets/emojis/', import.meta.url));
const FISHING_ART_DIR = fileURLToPath(new URL('../../assets/fishing/', import.meta.url));
const MAX_APPLICATION_EMOJI_BYTES = 256 * 1024;

const REQUIRED_EMOJIS = [
  // ── Originais ──────────────────────────────────────────────────────────────
  { name: 'f_3bat',              sourceId: '1420292544255889451', animated: true,  fallback: '🦇' },
  { name: 'c_flymoney',          sourceId: '997485969303420978',  animated: false, fallback: '💸' },
  // ── Moeda principal (usada em todo o bot) ───────────────────────────────────
  { name: 'emoji_1',             sourceId: '1516993823665033286', animated: true,  fallback: '🪙' },
  // ── Painel principal ────────────────────────────────────────────────────────
  { name: 'rx_bran',             sourceId: '1531143576556277780', animated: false, fallback: '🪽' },
  { name: 's7aaranha',           sourceId: '1527850818743697440', animated: false, fallback: '🕷️' },
  // ── Economia (/daily, /work, /top) ──────────────────────────────────────────
  { name: 'futecoins',           sourceId: '1526801406378508358', animated: false, fallback: '🪙' },
  { name: 'calendario',          sourceId: '1526801404851781742', animated: false, fallback: '📅' },
  { name: '4branco_estrela',     sourceId: '1526801408307761303', animated: false, fallback: '⭐' },
  { name: 'relogio',             sourceId: '1526801409595412644', animated: false, fallback: '⏰' },
  // ── Jogos (Mines / Blackjack) ────────────────────────────────────────────────
  { name: 'p_bom',               sourceId: '997485486803271720',  animated: false, fallback: '💣' },
  { name: 'Diamante',            sourceId: '1482392803299430451', animated: true,  fallback: '💎' },
  { name: '05_angels',           sourceId: '1511082383095365752', animated: false, fallback: '<:05_angels:1511082383095365752>' },
  { name: 'dinheiro_kingbuxx',   sourceId: '1452430513519198281', animated: false, fallback: '💰' },
  // ── Loja ────────────────────────────────────────────────────────────────────
  { name: 'carrinho',            sourceId: '1384004945820516432', animated: false, fallback: '🛒' },
  { name: '01_angels',           sourceId: '1507552059682197504', animated: false, fallback: '😇' },
  { name: '01_angels_animated',  sourceId: '1508985653642395728', animated: true,  fallback: '✨' },
  { name: 'shop_category',       asset: 'shop-category.webp',      mime: 'image/webp', fallback: '🖤' },
  // ── Pesca ────────────────────────────────────────────────────────────────────
  { name: 'fish_common',    asset: 'fish-common.png',    mime: 'image/png',  fallback: '🐟' },
  { name: 'fish_seal',      asset: 'fish-seal.png',      mime: 'image/png',  fallback: '🦭' },
  { name: 'fish_legendary', asset: 'fish-legendary.gif', mime: 'image/gif', animated: true, fallback: '🐉' },
  { name: 'fish_rod',       asset: 'fish-rod.png',       mime: 'image/png',  fallback: '🎣' },
  { name: 'fish_shark',     asset: 'fish-shark.png',     mime: 'image/png',  fallback: '🦈' },
  { name: 'fish_piranha',   asset: 'piranha-rubra.png',  assetDir: 'fishing', mime: 'image/png',  removeBackground: true, fallback: '🐡' },
  { name: 'fish_betta',     asset: 'betta-fogo.png',     assetDir: 'fishing', mime: 'image/png',  removeBackground: true, fallback: '🐠' },
  { name: 'fish_marlin',    asset: 'marlin-neon.png',    assetDir: 'fishing', mime: 'image/png',  removeBackground: true, fallback: '🐟' },
  { name: 'fish_lobster',   asset: 'lobster.jpg',        assetDir: 'fishing', mime: 'image/jpeg', removeBackground: true, fallback: '🦞' },
  { name: 'fish_starfish',  asset: 'starfish.jpg',       assetDir: 'fishing', mime: 'image/jpeg', removeBackground: true, fallback: '⭐' },
  { name: 'fish_octopus',   asset: 'octopus.jpg',        assetDir: 'fishing', mime: 'image/jpeg', removeBackground: true, fallback: '🐙' },
  { name: 'fish_turtle',    asset: 'turtle.jpg',         assetDir: 'fishing', mime: 'image/jpeg', removeBackground: true, fallback: '🐢' },
  { name: 'fish_orca',      asset: 'orca.jpg',           assetDir: 'fishing', mime: 'image/jpeg', removeBackground: true, fallback: '🐋' },
  { name: 'fish_shark_angry', asset: 'shark-angry.png',  assetDir: 'fishing', mime: 'image/png',  removeBackground: true, fallback: '🦈' },
  // ── Interações dos pets ─────────────────────────────────────────────────────
  { name: 'pet_heart', asset: 'pet-heart.png', mime: 'image/png', fallback: '❤️' },
  { name: 'pet_time',  asset: 'pet-time.png',  mime: 'image/png', fallback: '⏱️' },
  { name: 'pet_food',  asset: 'pet-food.png',  mime: 'image/png', fallback: '🌮' },
  { name: 'pet_ball',  asset: 'pet-ball.png',  mime: 'image/png', fallback: '🎾' },
  { name: 'pet_value',   asset: 'pet-value.webp',   mime: 'image/webp', fallback: '▶️' },
  { name: 'pet_balance', asset: 'pet-balance.webp', mime: 'image/webp', fallback: '💲' },
  // ── Tellonym ────────────────────────────────────────────────────────────────
  { name: 'tell_paperplane', asset: 'tell-paperplane.png', mime: 'image/png', fallback: '💬' },
  { name: 'tell_message',    asset: 'tell-message.png',    mime: 'image/png', fallback: '💭' },
  { name: 'tell_hearts',     asset: 'tell-hearts.png',     mime: 'image/png',  fallback: '🗨️' },
  // ── Moderação ────────────────────────────────────────────────────────────────
  { name: 'mod_heart', asset: 'mod-heart.png', mime: 'image/png', fallback: '❤️' },
];

const cache = new Map();

function cdnUrl(id, animated) {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
}

function fmt(emoji) {
  return emoji.animated
    ? `<a:${emoji.name}:${emoji.id}>`
    : `<:${emoji.name}:${emoji.id}>`;
}

function isWhite(pixel) {
  const [r, g, b, alpha] = pixel;
  return alpha === 0
    || (r >= 228 && g >= 228 && b >= 228 && Math.max(r, g, b) - Math.min(r, g, b) < 48);
}

function removeConnectedWhiteBackground(canvas) {
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue = [];

  const addIfBackground = (x, y) => {
    const index = y * width + x;
    if (visited[index]) return;
    const offset = index * 4;
    if (!isWhite(data.subarray(offset, offset + 4))) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    addIfBackground(x, 0);
    addIfBackground(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addIfBackground(0, y);
    addIfBackground(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    data[index * 4 + 3] = 0;
    if (x > 0) addIfBackground(x - 1, y);
    if (x < width - 1) addIfBackground(x + 1, y);
    if (y > 0) addIfBackground(x, y - 1);
    if (y < height - 1) addIfBackground(x, y + 1);
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

async function prepareEmojiAsset(buffer, mime, animated = false, removeBackground = false) {
  if (animated) {
    return { buffer, mime };
  }

  const image = await loadImage(buffer);
  const source = createCanvas(image.width, image.height);
  source.getContext('2d').drawImage(image, 0, 0);
  if (removeBackground) removeConnectedWhiteBackground(source);

  if (!removeBackground && buffer.length <= MAX_APPLICATION_EMOJI_BYTES) {
    return { buffer, mime };
  }

  const size = 128;
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const scale = Math.min(size / source.width, size / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  context.drawImage(source, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height);
  return { buffer: canvas.toBuffer('image/png'), mime: 'image/png' };
}

async function readEmojiAsset(def) {
  const assetDir = def.assetDir === 'fishing' ? FISHING_ART_DIR : LOCAL_EMOJI_DIR;
  const buffer = await readFile(path.join(assetDir, def.asset));
  return prepareEmojiAsset(buffer, def.mime, def.animated, def.removeBackground);
}

async function hasTransparentPixels(buffer) {
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) return true;
  }
  return false;
}

async function recreateTransparentEmoji(client, found, def) {
  const current = await fetch(found.imageURL());
  if (!current.ok) throw new Error(`HTTP ${current.status} ao verificar emoji atual`);
  const currentBuffer = Buffer.from(await current.arrayBuffer());
  if (await hasTransparentPixels(currentBuffer)) return found;

  const { buffer, mime } = await readEmojiAsset(def);
  await found.delete();
  return client.application.emojis.create({
    name: def.name,
    attachment: `data:${mime};base64,${buffer.toString('base64')}`,
  });
}

export async function initEmojis(client) {
  try {
    const existing = await client.application.emojis.fetch();

    for (const def of REQUIRED_EMOJIS) {
      const found = existing.find(e => e.name === def.name);

      if (found) {
        if (def.removeBackground) {
          try {
            const synced = await recreateTransparentEmoji(client, found, def);
            cache.set(def.name, fmt(synced));
            if (synced.id !== found.id) console.log(`✅ Emoji recriado sem fundo na aplicação: ${def.name}`);
          } catch (err) {
            console.warn(`⚠️  Falha ao sincronizar fundo do emoji ${def.name}:`, err.message);
            cache.set(def.name, fmt(found));
          }
        } else {
          cache.set(def.name, fmt(found));
        }
        continue;
      }

      try {
        let buf;
        let mime = def.mime;
        if (def.asset) {
          ({ buffer: buf, mime } = await readEmojiAsset(def));
        } else {
          const url = cdnUrl(def.sourceId, def.animated);
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          buf = Buffer.from(await resp.arrayBuffer());
          mime = `image/${def.animated ? 'gif' : 'png'}`;
        }
        if (!def.asset) {
          ({ buffer: buf, mime } = await prepareEmojiAsset(buf, mime, def.animated));
        }
        const b64 = `data:${mime};base64,${buf.toString('base64')}`;

        const created = await client.application.emojis.create({ name: def.name, attachment: b64 });
        cache.set(def.name, fmt(created));
        console.log(`✅ Emoji registrado na aplicação: ${def.name}`);
      } catch (err) {
        console.warn(`⚠️  Falha ao registrar emoji ${def.name}:`, err.message);
        cache.set(def.name, def.fallback ?? '🔹');
      }
    }
  } catch (err) {
    console.warn('⚠️  Falha ao inicializar application emojis:', err.message);
    for (const def of REQUIRED_EMOJIS) {
      cache.set(def.name, def.fallback ?? '🔹');
    }
  }
}

export function getEmoji(name) {
  const def = REQUIRED_EMOJIS.find(item => item.name === name);
  return cache.get(name) ?? def?.fallback ?? '🔹';
}

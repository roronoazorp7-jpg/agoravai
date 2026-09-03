import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, basename } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { createServer } from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const RINGS_DIR  = join(__dirname, '../assets/rings');
const BANNERS_DIR = join(__dirname, '../../data/banners');
const STORED_BANNER_PREFIX = '__stored__';
const MAX_BANNER_BYTES = 20 * 1024 * 1024;

export const WALLET_BACKGROUNDS = [
  { key: 'wbg_galaxy',   name: '🌌 Galáxia Roxa',    emoji: '🌌', url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=900&q=90' },
  { key: 'wbg_neon',     name: '🏙️ Cidade Neon',     emoji: '🏙️', url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=900&q=90' },
  { key: 'wbg_ocean',    name: '🌊 Oceano Profundo',  emoji: '🌊', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=900&q=90' },
  { key: 'wbg_sakura',   name: '🌸 Sakura',           emoji: '🌸', url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=900&q=90' },
  { key: 'wbg_aurora',   name: '✨ Aurora Boreal',    emoji: '✨', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=900&q=90' },
  { key: 'wbg_sunset',   name: '🌅 Pôr do Sol',      emoji: '🌅', url: 'https://images.unsplash.com/photo-1495344517868-8ebaf0a2044a?w=900&q=90' },
  { key: 'wbg_forest',   name: '🌲 Floresta Mágica', emoji: '🌲', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=900&q=90' },
  { key: 'wbg_dark',     name: '🖤 Escuridão',        emoji: '🖤', url: 'https://images.unsplash.com/photo-1475274047050-1d0c0975864c?w=900&q=90' },
  { key: 'wbg_roses',    name: '🌹 Rosas',            emoji: '🌹', url: 'https://images.unsplash.com/photo-1490750967868-88df5691cc2c?w=900&q=90' },
  { key: 'wbg_stars',    name: '⭐ Estrelas',         emoji: '⭐', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900&q=90' },
  { key: 'wbg_rain',     name: '🌧️ Chuva Neon',      emoji: '🌧️', url: 'https://images.unsplash.com/photo-1428592953211-077101b2021b?w=900&q=90' },
  { key: 'wbg_anime',    name: '🎌 Japão Noturno',   emoji: '🎌', url: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=900&q=90' },
  { key: 'wbg_smoke',    name: '💜 Fumaça Roxa',     emoji: '💜', url: 'https://images.unsplash.com/photo-1550159930-40066082a4fc?w=900&q=90' },
  { key: 'wbg_city',     name: '🌃 Cidade à Noite',  emoji: '🌃', url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=900&q=90' },
  { key: 'wbg_cyber',    name: '🔷 Cyber Azul',      emoji: '🔷', url: 'https://images.unsplash.com/photo-1580927752452-89d86da3fa0a?w=900&q=90' },
  { key: 'wbg_pastel',   name: '🩷 Pastel Suave',    emoji: '🩷', url: 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=900&q=90' },
  { key: 'wbg_clouds',   name: '☁️ Céu de Nuvens',  emoji: '☁️', url: 'https://images.unsplash.com/photo-1501630834273-4b5604d2ee31?w=900&q=90' },
  { key: 'wbg_abstract', name: '🎨 Abstrato',        emoji: '🎨', url: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=900&q=90' },
  { key: 'wbg_winter',   name: '❄️ Inverno',         emoji: '❄️', url: 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?w=900&q=90' },
  { key: 'wbg_gold',     name: '✨ Glitter Dourado', emoji: '✨', url: 'https://images.unsplash.com/photo-1533158307587-828f0a76ef46?w=900&q=90' },
];

// Banners estáticos removidos — todos os banners são criados pelo painel de admin.
export const BANNERS = [];

// ── Discord CDN URL refresh ─────────────────────────────────────────────────
// URLs do Discord CDN expiram (parâmetro ?ex=HEX_TIMESTAMP).
// URLs antigas (sem ?ex) também são revogadas pelo Discord.
// Esta função renova via API oficial: POST /attachments/refresh-urls

function isDiscordAttachmentUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'cdn.discordapp.com' || parsed.hostname === 'media.discordapp.net')
      && parsed.pathname.includes('/attachments/')
    );
  } catch {
    return false;
  }
}

function isStoredBannerRef(value) {
  return typeof value === 'string' && value.startsWith(STORED_BANNER_PREFIX);
}

function isExpiredOrStale(url) {
  try {
    const ex = new URL(url).searchParams.get('ex');
    if (!ex) return true; // formato antigo sem expiração = provavelmente quebrado
    const expiryMs = parseInt(ex, 16) * 1000;
    return Date.now() > expiryMs - 5 * 60 * 1000; // renova se expira em <5 min
  } catch { return true; }
}

async function refreshDiscordUrl(url) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) return url;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://discord.com/api/v10/attachments/refresh-urls', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bot ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ attachment_urls: [url] }),
    });
    if (!res.ok) {
      console.warn(`[banner] refresh-urls HTTP ${res.status}`);
      return url;
    }
    const data = await res.json();
    return data.refreshed_urls?.[0]?.refreshed ?? url;
  } catch (e) {
    console.warn('[banner] refresh-urls erro:', e.message);
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

function bannerExtension(contentType, sourceUrl) {
  const mime = contentType.split(';', 1)[0].toLowerCase();
  const byMime = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
  };
  if (byMime[mime]) return byMime[mime];

  try {
    const extension = new URL(sourceUrl).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
    if (extension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(extension)) {
      return extension === 'jpeg' ? 'jpg' : extension;
    }
  } catch {}

  return 'jpg';
}

function bannerFileStem(key) {
  const safe = String(key || 'banner')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return safe || 'banner';
}

/**
 * Downloads an image to the bot's persistent banner directory.
 * The returned reference is safe to store in the database and never expires.
 */
export async function cacheBannerImage(sourceUrl, key) {
  if (!sourceUrl || isStoredBannerRef(sourceUrl)) return sourceUrl;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SavageBot/1.0)' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`Tipo inválido: ${contentType || 'desconhecido'}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error('arquivo vazio');
    if (bytes.length > MAX_BANNER_BYTES) throw new Error('imagem maior que 20 MB');

    await mkdir(BANNERS_DIR, { recursive: true });
    const filename = `${bannerFileStem(key)}.${bannerExtension(contentType, sourceUrl)}`;
    await writeFile(join(BANNERS_DIR, filename), bytes);
    return `${STORED_BANNER_PREFIX}${filename}`;
  } catch (error) {
    console.warn(`[banner] não foi possível salvar cópia local: ${error.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Banner URL helpers ──────────────────────────────────────────────────────
// Always rebuild from the CURRENT domain so stale stored URLs never break.
function getBannerBaseUrl() {
  const configured = process.env.BANNER_PUBLIC_BASE_URL
    || process.env.RAILWAY_PUBLIC_DOMAIN
    || process.env.REPLIT_DEV_DOMAIN
    || process.env.REPLIT_DOMAINS?.split(',').filter(Boolean)[0]
    || process.env.API_BASE_URL;
  if (configured) {
    return /^https?:\/\//i.test(configured)
      ? configured.replace(/\/$/, '')
      : `https://${configured}`;
  }
  return null;
}

// Accepts:
//   - '__local__<filename>'  → file stored on our server
//   - '<filename>'           → bare filename stored by new criar-banner
//   - 'https://...'          → old full URL: extract filename, rebuild with current domain
//                              but only if it points to our own server
export function buildBannerUrl(stored) {
  if (!stored) return null;

  // Permanent copy served by this bot.
  if (isStoredBannerRef(stored)) {
    const filename = stored.slice(STORED_BANNER_PREFIX.length);
    const base = getBannerBaseUrl();
    return base && filename ? `${base}/media/banners/${encodeURIComponent(filename)}` : null;
  }

  // New format: bare filename (no protocol, no __local__ prefix)
  if (!stored.startsWith('http') && !stored.startsWith('__local__')) {
    const base = getBannerBaseUrl();
    return base ? `${base}/api/public/banners/${stored}` : null;
  }

  // Static banners stored with __local__ prefix
  if (stored.startsWith('__local__')) {
    const filename = stored.replace('__local__', '');
    const base = getBannerBaseUrl();
    return base ? `${base}/api/public/banners/${filename}` : null;
  }

  // Old format: full URL — if it's our own server, extract filename and rebuild
  try {
    const url = new URL(stored);
    const isOwnServer = url.pathname.includes('/api/public/banners/');
    if (isOwnServer) {
      const filename = url.pathname.split('/').pop();
      const base = getBannerBaseUrl();
      return base ? `${base}/api/public/banners/${filename}` : stored;
    }
  } catch {}

  // External URL (Unsplash, Discord CDN, etc.) — use as-is
  return stored;
}

export function getBanner(key) {
  const b = BANNERS.find(b => b.key === key) ?? null;
  if (!b) return null;
  return { ...b, imageUrl: buildBannerUrl(b.imageUrl) };
}

export async function resolveBanner(key, guildId) {
  if (!key) return null;
  // Banners personalizados do servidor têm prioridade sobre os estáticos: se um
  // admin criar um banner cuja chave coincida com a de um banner padrão (ex: "fogo"),
  // o personalizado do servidor deve ser o exibido/equipado — nunca o padrão global.
  if (guildId) {
    try {
      const { default: prisma } = await import('../database/client.js');
      const custom = await prisma.customBanner.findFirst({ where: { key, guildId, active: true } });
      if (custom) return buildCustomBannerResult(custom, prisma);
    } catch (e) {
      console.error('[banner] resolveBanner erro:', e.message);
    }
  }
  const staticB = getBanner(key);
  if (staticB) return staticB;
  return null;
}

async function buildCustomBannerResult(custom, prisma) {
  try {
    if (isStoredBannerRef(custom.imageUrl)) {
      return {
        key:         custom.key,
        name:        custom.name,
        description: custom.description ?? '',
        price:       custom.price,
        imageUrl:    buildBannerUrl(custom.imageUrl),
        gradient:    [custom.gradient1, custom.gradient2],
        emoji:       custom.emoji,
        isCustom:    true,
      };
    }

    let imageUrl = buildBannerUrl(custom.imageUrl);

    // Renova URLs do Discord CDN que expiraram ou usam formato antigo
    if (isDiscordAttachmentUrl(imageUrl) && isExpiredOrStale(imageUrl)) {
      const refreshed = await refreshDiscordUrl(imageUrl);
      if (refreshed && refreshed !== imageUrl) {
        // Salva URL renovada no BD para evitar chamada extra da próxima vez
        try {
          await prisma.customBanner.update({
            where: { id: custom.id },
            data:  { imageUrl: refreshed },
          });
        } catch {}
        imageUrl = refreshed;
        console.log(`[banner] URL renovada: ${custom.key}`);
      }
    }

    // Migra banners antigos para uma cópia local. Mesmo que o link do Discord
    // ainda esteja válido, a cópia evita que ele volte a expirar depois.
    const storedRef = await cacheBannerImage(imageUrl, `${custom.guildId}_${custom.key}`);
    if (storedRef) {
      try {
        await prisma.customBanner.update({
          where: { id: custom.id },
          data: { imageUrl: storedRef },
        });
        imageUrl = buildBannerUrl(storedRef);
      } catch {}
    }

    return {
      key:         custom.key,
      name:        custom.name,
      description: custom.description ?? '',
      price:       custom.price,
      imageUrl,
      gradient:    [custom.gradient1, custom.gradient2],
      emoji:       custom.emoji,
      isCustom:    true,
    };
  } catch (e) {
    console.error('[banner] resolveBanner erro:', e.message);
    return null;
  }
}

const bannerMimeTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Serves cached banners from the same public Railway service as the bot.
 * This keeps Discord embeds independent from expiring CDN attachment URLs.
 */
export function startBannerServer() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0) return null;

  const root = resolve(BANNERS_DIR);
  const server = createServer(async (request, response) => {
    const requestUrl = request.url ? new URL(request.url, 'http://localhost') : null;
    if (request.method !== 'GET' || !requestUrl?.pathname.startsWith('/media/banners/')) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }

    let filename;
    try {
      filename = basename(decodeURIComponent(requestUrl.pathname.slice('/media/banners/'.length)));
    } catch {
      response.statusCode = 400;
      response.end('Bad request');
      return;
    }
    if (!filename || filename.includes('..')) {
      response.statusCode = 400;
      response.end('Bad request');
      return;
    }

    const filePath = resolve(root, filename);
    if (!filePath.startsWith(`${root}/`)) {
      response.statusCode = 400;
      response.end('Bad request');
      return;
    }

    try {
      const file = await readFile(filePath);
      const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
      response.setHeader('Content-Type', bannerMimeTypes[extension] || 'application/octet-stream');
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      response.end(file);
    } catch {
      response.statusCode = 404;
      response.end('Not found');
    }
  });

  server.on('error', error => {
    console.error('[banner] servidor de arquivos:', error.message);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[banner] arquivos locais disponíveis na porta ${port}`);
  });
  return server;
}

// Todas as cores também são molduras elaboradas em imagem real (relevo 3D, gemas,
// cristais, metal) — não existe mais versão "básica" desenhada em vetor simples.
// O campo `image` aponta para o arquivo em src/assets/rings/ usado como moldura.
export const RING_PRESETS = [
  { key: 'roxo',      label: 'Roxo Espinhado',  emoji: '🟣', c1: '#c084fc', c2: '#7c3aed', image: 'roxo.png' },
  { key: 'azul',      label: 'Gelo Azul',       emoji: '🔵', c1: '#60a5fa', c2: '#2563eb', image: 'azul.png' },
  { key: 'verde',     label: 'Vinha Esmeralda', emoji: '🟢', c1: '#4ade80', c2: '#16a34a', image: 'verde.png' },
  { key: 'vermelho',  label: 'Relâmpago Carmesim', emoji: '🔴', c1: '#f87171', c2: '#dc2626', image: 'vermelho.png' },
  { key: 'rosa',      label: 'Rosas e Pérolas', emoji: '🩷', c1: '#f9a8d4', c2: '#ec4899', image: 'rosa.png' },
  { key: 'dourado',   label: 'Filigrana Dourada', emoji: '🟡', c1: '#fde68a', c2: '#d97706', image: 'dourado.png' },
  { key: 'ciano',     label: 'Cristal Ciano',   emoji: '🩵', c1: '#67e8f9', c2: '#0891b2', image: 'ciano.png' },
  { key: 'branco',    label: 'Cromo Prateado',  emoji: '⚪', c1: '#f8fafc', c2: '#94a3b8', image: 'branco.png' },
  { key: 'arco_iris', label: 'Prisma Arco-íris', emoji: '🌈', c1: '#f472b6', c2: '#3b82f6', image: 'arco_iris.png' },
  { key: 'preto',     label: 'Metal Sombrio',   emoji: '⚫', c1: '#6b7280', c2: '#111827', image: 'preto.png' },
];

export function getRing(key) {
  return RING_PRESETS.find(r => r.key === key) ?? null;
}

// ─── 🖼️ Molduras (frames com desenho, não apenas cor) ─────────────────────────
// Prefixo "frame:" distingue uma moldura de uma cor sólida/preset no mesmo campo
// (activeRing / walletRing), sem precisar de coluna extra no banco.
// As molduras premium reaproveitam as mesmas imagens base (mesmo acabamento em relevo
// real), mas ganham um extra de ornamento desenhado por cima (`extra`) para se
// diferenciarem visualmente da cor comum e justificarem o nome.
export const FRAME_PRESETS = [
  { key: 'ouro_cravejado', label: 'Ouro Cravejado',    emoji: '✨', c1: '#fde68a', c2: '#b45309', image: 'dourado.png',  extra: 'studs' },
  { key: 'gelo_duplo',     label: 'Gelo Duplo',        emoji: '❄️', c1: '#bae6fd', c2: '#0284c7', image: 'azul.png',     extra: 'double' },
  { key: 'fogo_tribal',    label: 'Fúria Carmesim',    emoji: '🔥', c1: '#fca5a5', c2: '#b91c1c', image: 'vermelho.png', extra: 'dashed' },
  { key: 'estelar',        label: 'Trono Estelar',     emoji: '🌟', c1: '#e9d5ff', c2: '#7c3aed', image: 'roxo.png',     extra: 'stars' },
  { key: 'esmeralda_real', label: 'Esmeralda Real',    emoji: '💚', c1: '#86efac', c2: '#15803d', image: 'verde.png',    extra: 'double' },
  { key: 'sombrio',        label: 'Cromo Sombrio',     emoji: '🖤', c1: '#9ca3af', c2: '#111827', image: 'preto.png',    extra: 'studs' },
];

// Molduras exclusivas para usuários com um cargo VIP ativo no servidor.
// O prefixo próprio evita colisões com as molduras comuns no mesmo campo.
export const VIP_FRAME_PRESETS = [
  { key: 'angela',   label: 'Angela Dourada',  emoji: '👑', c1: '#ffe27a', c2: '#d88b00', image: 'angela_avatar.webp' },
  { key: 'prophesy', label: 'Olho da Profecia', emoji: '🔮', c1: '#f0a0ff', c2: '#8c1fc7', image: 'eye_of_prophesy.webp' },
  { key: 'venom',    label: 'Venom',            emoji: '🕷️', c1: '#a86cff', c2: '#37008c', image: 'marvel_snap_venom.webp' },
  { key: 'gallica',  label: 'Gallica',          emoji: '🌊', c1: '#b9f7ff', c2: '#167d95', image: 'gallica.webp' },
  { key: 'celestial', label: 'Asas Celestiais', emoji: '🪽', c1: '#dbeafe', c2: '#2563eb', image: 'asas_celestiais.png' },
  { key: 'carmesim',  label: 'Risco Carmesim',  emoji: '🩸', c1: '#f87171', c2: '#991b1b', image: 'risco_carmesim.png' },
];

export function getFrame(value) {
  if (!value || !value.startsWith('frame:')) return null;
  const key = value.slice('frame:'.length);
  return FRAME_PRESETS.find(f => f.key === key) ?? null;
}

export function getVipFrame(value) {
  if (!value || !value.startsWith('vipframe:')) return null;
  const key = value.slice('vipframe:'.length);
  return VIP_FRAME_PRESETS.find(f => f.key === key) ?? null;
}

export function getRingColors(activeRing) {
  if (!activeRing) return { c1: '#c084fc', c2: '#7c3aed' };
  const frame = getFrame(activeRing);
  if (frame) return { c1: frame.c1, c2: frame.c2 };
  const vipFrame = getVipFrame(activeRing);
  if (vipFrame) return { c1: vipFrame.c1, c2: vipFrame.c2 };
  if (activeRing.startsWith('#')) return { c1: activeRing, c2: activeRing };
  const preset = getRing(activeRing);
  return preset ? { c1: preset.c1, c2: preset.c2 } : { c1: '#c084fc', c2: '#7c3aed' };
}

function drawStar(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const outerAngle = (-90 + i * 72) * Math.PI / 180;
    const innerAngle = (-90 + i * 72 + 36) * Math.PI / 180;
    ctx.lineTo(Math.cos(outerAngle) * size, Math.sin(outerAngle) * size);
    ctx.lineTo(Math.cos(innerAngle) * size * 0.45, Math.sin(innerAngle) * size * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

// Gema com brilho radial (efeito 3D) — usada nas molduras "cravejadas"
function drawGem(ctx, x, y, size, color) {
  ctx.save();
  const grad = ctx.createRadialGradient(x - size * 0.35, y - size * 0.35, 0.4, x, y, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.38, color);
  grad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
  ctx.stroke();
  // Brilho pequeno
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(x - size * 0.32, y - size * 0.32, size * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Diamante facetado — usado nas molduras "duplas"
function drawDiamond(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createLinearGradient(0, -size, 0, size);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -size); ctx.lineTo(size * 0.72, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.72, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// Flourish ornamental (arabesco) no topo da moldura, estilo "coroa" de Pinterest
function drawFlourish(ctx, x, y, c1, c2) {
  ctx.save();
  ctx.translate(x, y);
  const grad = ctx.createLinearGradient(-16, 0, 16, 0);
  grad.addColorStop(0, c1); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, c2);
  ctx.strokeStyle = grad; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-16, 6);
  ctx.quadraticCurveTo(-8, -10, 0, -3);
  ctx.quadraticCurveTo(8, -10, 16, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, 8);
  ctx.quadraticCurveTo(-5, 0, 0, 4);
  ctx.quadraticCurveTo(5, 0, 10, 8);
  ctx.stroke();
  drawGem(ctx, 0, -4, 4.2, c2);
  ctx.restore();
}

// ─── 🖼️ Cache de imagens de moldura com chroma-key (remove o fundo/buraco pretos) ──
// As imagens são geradas em um "vazio preto puro"; removemos com flood-fill (não um
// threshold global) para não apagar partes escuras que fazem parte do próprio desenho
// (ex.: sombras do metal cromado). Só o preto CONECTADO à borda ou ao centro vira
// transparente — o resto do relevo/gemas permanece intacto.
const ringImageCache = new Map();

const BLACK_THRESHOLD = 42;

function luma(data, idx) {
  return (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
}

async function getKeyedRingImage(fileName) {
  if (ringImageCache.has(fileName)) return ringImageCache.get(fileName);

  const img    = await loadImage(join(RINGS_DIR, fileName));
  const size   = Math.max(img.width, img.height);
  const canvas = createCanvas(size, size);
  const c      = canvas.getContext('2d');
  c.drawImage(img, 0, 0, size, size);

  const imgData = c.getImageData(0, 0, size, size);
  const data    = imgData.data;
  const cx0 = size / 2, cy0 = size / 2;

  // 1) Remove o fundo (vazio preto) externo: flood-fill a partir da borda,
  //    seguindo apenas pixels escuros conectados (não afeta sombras internas
  //    isoladas dentro do próprio desenho da moldura).
  const visited = new Uint8Array(size * size);
  const queue   = [];
  for (let x = 0; x < size; x++) { queue.push(x, 0); queue.push(x, size - 1); }
  for (let y = 0; y < size; y++) { queue.push(0, y); queue.push(size - 1, y); }

  while (queue.length) {
    const y = queue.pop(), x = queue.pop();
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const vIdx = y * size + x;
    if (visited[vIdx]) continue;
    const pIdx = vIdx * 4;
    if (luma(data, pIdx) >= BLACK_THRESHOLD) continue;
    visited[vIdx] = 1;
    data[pIdx + 3] = 0;
    queue.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  // 2) Descobre o raio real do buraco central via varredura radial (ignora
  //    reflexos/brilhos que cruzam o buraco, usando um percentil baixo das
  //    distâncias medidas em várias direções ao invés de flood-fill, que
  //    falha quando um brilho interrompe a conectividade do buraco).
  const angleSamples = 360;
  const boundaryAt   = new Float32Array(angleSamples);
  const maxScan = size * 0.42;
  const minHole = size * 0.14, maxHole = size * 0.36;
  for (let a = 0; a < angleSamples; a++) {
    const ang = (a / angleSamples) * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let dist = maxHole;
    for (let d = 4; d < maxScan; d += 2) {
      const x = Math.round(cx0 + dx * d), y = Math.round(cy0 + dy * d);
      if (x < 0 || y < 0 || x >= size || y >= size) break;
      const pIdx = (y * size + x) * 4;
      if (luma(data, pIdx) >= BLACK_THRESHOLD) { dist = d; break; }
    }
    boundaryAt[a] = Math.min(Math.max(dist, minHole), maxHole);
  }
  const sortedForMedian = Array.from(boundaryAt).sort((a, b) => a - b);
  const holeRadius = sortedForMedian[Math.floor(angleSamples * 0.5)];

  // 3) Força a transparência do buraco central seguindo o contorno REAL da
  //    moldura em cada direção (não um círculo perfeito) — assim pontas de
  //    espinhos/cristais que avançam mais para o centro ficam preservadas,
  //    e não sobra nenhuma faixa preta entre o avatar e a moldura.
  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const dy2 = y - cy0;
    for (let x = 0; x < size; x++) {
      const dx2 = x - cx0;
      const dist = Math.hypot(dx2, dy2);
      if (dist > maxHole) continue;
      let ang = Math.atan2(dy2, dx2);
      if (ang < 0) ang += twoPi;
      const aIdx = Math.round((ang / twoPi) * angleSamples) % angleSamples;
      const boundary = boundaryAt[aIdx];
      if (dist <= boundary * 1.03) {
        data[(y * size + x) * 4 + 3] = 0;
      }
    }
  }

  c.putImageData(imgData, 0, 0);

  // 4) Detecta o raio externo real da moldura: o pixel visível mais distante
  //    do centro após todo o processamento de transparência.
  let outerRadius = holeRadius * 1.5; // fallback mínimo
  for (let y = 0; y < size; y++) {
    const dy2 = y - cy0;
    for (let x = 0; x < size; x++) {
      if (data[(y * size + x) * 4 + 3] === 0) continue;
      const d = Math.hypot(x - cx0, dy2);
      if (d > outerRadius) outerRadius = d;
    }
  }

  const result = { canvas, size, holeRadius, outerRadius };
  ringImageCache.set(fileName, result);
  return result;
}

/**
 * Desenha a argola/moldura do avatar em qualquer canvas (perfil ou carteira).
 * Toda argola (cor/preset, hex customizada ou moldura "frame:...") usa uma imagem
 * real de moldura ornamentada (metal/gemas/cristais em relevo 3D) — não existe mais
 * versão "básica" desenhada em vetor simples. Molduras premium (`extra`) ganham um
 * ornamento extra desenhado por cima para se diferenciar da cor comum.
 */
export async function drawAvatarRing(ctx, cx, cy, r, ringValue) {
  const frame    = getFrame(ringValue);
  const vipFrame = !frame ? getVipFrame(ringValue) : null;
  const preset   = !frame && !vipFrame && ringValue ? getRing(ringValue) : null;
  const fileName = frame?.image ?? vipFrame?.image ?? preset?.image ?? 'roxo.png';
  const extra    = frame?.extra ?? null;
  const { c1, c2 } = getRingColors(ringValue);

  try {
    const { canvas: ringCanvas, size, outerRadius } = await getKeyedRingImage(fileName);
    // Normalise ring size to match "Fúria Carmesim" (vermelho.png, outerRadius≈414).
    // Clamp each ring's detected outer radius to ±8% of the reference so that compact
    // wreaths (verde, outer≈247) are scaled up and spiky rings (azul, outer≈455) are
    // scaled down — all landing at roughly the same band width as the reference.
    const REF_OUTER   = 414;                                         // vermelho reference
    // As molduras VIP recebidas têm dimensões menores e precisam ser ampliadas
    // pelo raio real; aplicar o clamp das molduras antigas deixaria a arte quase
    // invisível ao redor do avatar.
    const clampedOuter = vipFrame
      ? Math.max(outerRadius, 1)
      : Math.min(Math.max(outerRadius, REF_OUTER * 0.85), REF_OUTER * 1.05);
    const targetOuter  = r + 30;                                     // outer edge 30px past avatar
    const scale    = targetOuter / clampedOuter;
    const drawSize = size * scale;

    ctx.save();
    ctx.drawImage(ringCanvas, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
    ctx.restore();
  } catch (e) {
    console.error(`[ring] Falha ao desenhar imagem da argola "${fileName}":`, e?.stack || e);
    const fallbackGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    fallbackGrad.addColorStop(0, c1);
    fallbackGrad.addColorStop(1, c2);
    ctx.save();
    ctx.strokeStyle = fallbackGrad;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  if (!extra) return;

  // ── Ornamento extra (só nas molduras premium, para diferenciar da cor comum) ──
  const simpleGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  simpleGrad.addColorStop(0, c1);
  simpleGrad.addColorStop(1, c2);

  ctx.save();
  ctx.shadowColor = c2;
  ctx.shadowBlur  = 10;
  const style = extra;
  if (style === 'double') {
    ctx.strokeStyle = simpleGrad; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();
    const diamondCount = 4;
    for (let i = 0; i < diamondCount; i++) {
      const ang = (i / diamondCount) * Math.PI * 2 + Math.PI / 4;
      const dx  = cx + Math.cos(ang) * (r + 6), dy = cy + Math.sin(ang) * (r + 6);
      drawDiamond(ctx, dx, dy, 8, i % 2 === 0 ? c1 : c2);
    }
    const gemCount = 8;
    for (let i = 0; i < gemCount; i++) {
      const ang = (i / gemCount) * Math.PI * 2;
      const gx  = cx + Math.cos(ang) * (r - 4), gy = cy + Math.sin(ang) * (r - 4);
      if (i % 2 === 0) drawGem(ctx, gx, gy, 2.6, '#ffffff');
    }
  } else if (style === 'dashed') {
    // Chamas triangulares ao redor do anel (estilo "fogo tribal")
    const spikeCount = 18;
    for (let i = 0; i < spikeCount; i++) {
      const ang    = (i / spikeCount) * Math.PI * 2;
      const baseR  = r + 6, tipR = i % 2 === 0 ? r + 19 : r + 14;
      const bx1 = cx + Math.cos(ang - 0.09) * baseR, by1 = cy + Math.sin(ang - 0.09) * baseR;
      const bx2 = cx + Math.cos(ang + 0.09) * baseR, by2 = cy + Math.sin(ang + 0.09) * baseR;
      const midAng = ang + 0.02;
      const cxr = cx + Math.cos(midAng) * (baseR + (tipR - baseR) * 0.5) + Math.cos(midAng + Math.PI / 2) * 3;
      const cyr = cy + Math.sin(midAng) * (baseR + (tipR - baseR) * 0.5) + Math.sin(midAng + Math.PI / 2) * 3;
      const tx = cx + Math.cos(ang) * tipR, ty = cy + Math.sin(ang) * tipR;
      ctx.beginPath();
      ctx.moveTo(bx1, by1);
      ctx.quadraticCurveTo(cxr, cyr, tx, ty);
      ctx.lineTo(bx2, by2);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? c1 : c2;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
  } else if (style === 'studs') {
    const studCount = 14;
    for (let i = 0; i < studCount; i++) {
      const ang = (i / studCount) * Math.PI * 2;
      const sx  = cx + Math.cos(ang) * (r + 6), sy = cy + Math.sin(ang) * (r + 6);
      drawGem(ctx, sx, sy, 6.5, i % 2 === 0 ? c1 : c2);
    }
    // Pequenos cravos internos alternados
    for (let i = 0; i < studCount; i++) {
      const ang = (i / studCount) * Math.PI * 2 + Math.PI / studCount;
      const sx  = cx + Math.cos(ang) * (r - 3), sy = cy + Math.sin(ang) * (r - 3);
      drawGem(ctx, sx, sy, 2.4, '#fff8dc');
    }
  } else if (style === 'stars') {
    const starCount = 10;
    for (let i = 0; i < starCount; i++) {
      const ang = (i / starCount) * Math.PI * 2;
      const sx  = cx + Math.cos(ang) * (r + 9), sy = cy + Math.sin(ang) * (r + 9);
      drawStar(ctx, sx, sy, 7.5, i % 2 === 0 ? c1 : c2);
    }
    // Pontinhos cintilantes entre as estrelas
    for (let i = 0; i < starCount; i++) {
      const ang = (i / starCount) * Math.PI * 2 + Math.PI / starCount;
      const sx  = cx + Math.cos(ang) * (r + 15), sy = cy + Math.sin(ang) * (r + 15);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(sx, sy, 1.7, 0, Math.PI * 2); ctx.fill();
    }
  }

  ctx.restore();
}

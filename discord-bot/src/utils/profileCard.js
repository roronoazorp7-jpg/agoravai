import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { resolveBanner, getRingColors, drawAvatarRing } from './shopData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const FONTS_DIR  = join(__dirname, '../../fonts');

GlobalFonts.register(readFileSync(join(FONTS_DIR, 'Roboto-Regular.ttf')), 'BotFont');
GlobalFonts.register(readFileSync(join(FONTS_DIR, 'Roboto-Bold.ttf')),    'BotFont');

const FONT = 'BotFont';
const W = 800, H = 600;

// ─── Badges ───────────────────────────────────────────────────────────────────
export const BADGE_DEFS = [
  { key: 'vip',           defaultEmoji: '💎', name: 'VIP',           description: 'Saldo total ≥ 50.000',  color: 'rgba(88,166,255,0.85)'  },
  { key: 'rico',          defaultEmoji: '💰', name: 'Rico',          description: 'Saldo total ≥ 10.000',  color: 'rgba(253,224,71,0.85)'  },
  { key: 'poupador',      defaultEmoji: '🪙', name: 'Poupador',      description: 'Saldo total ≥ 5.000',   color: 'rgba(200,180,60,0.80)'  },
  { key: 'colecionador',  defaultEmoji: '🏆', name: 'Colecionador',  description: '10+ itens comprados',   color: 'rgba(157,78,221,0.85)'  },
  { key: 'comprador',     defaultEmoji: '🛍️', name: 'Comprador',     description: '5+ itens comprados',    color: 'rgba(130,60,200,0.80)'  },
  { key: 'mascote',       defaultEmoji: '🐾', name: 'Mascote',       description: 'Pet ativo equipado',    color: 'rgba(87,242,135,0.80)'  },
  { key: 'estiloso',      defaultEmoji: '🎨', name: 'Estiloso',      description: 'Banner equipado',       color: 'rgba(255,107,107,0.80)' },
  { key: 'personalizado', defaultEmoji: '💠', name: 'Personalizado', description: 'Argola personalizada',  color: 'rgba(100,200,220,0.80)' },
];

export function computeEarnedBadgeKeys({ balance, bank, purchases, activePet, activeBanner, activeRing }) {
  const keys  = [];
  const total = (balance ?? 0) + (bank ?? 0);
  if      (total >= 50000) keys.push('vip');
  else if (total >= 10000) keys.push('rico');
  else if (total >= 5000)  keys.push('poupador');
  if      (purchases >= 10) keys.push('colecionador');
  else if (purchases >= 5)  keys.push('comprador');
  if (activePet)                           keys.push('mascote');
  if (activeBanner)                        keys.push('estiloso');
  if (activeRing && activeRing !== 'roxo') keys.push('personalizado');
  return keys;
}

export function computeLevel(xp) {
  // A cada nível a meta cresce um pouco; isso mantém a progressão visível
  // sem deixar que usuários ativos subam dezenas de níveis em poucos dias.
  const totalXp = Math.max(0, Number(xp) || 0);
  let level = 1;
  let spent = 0;
  let needed = 300;
  while (totalXp >= spent + needed) {
    spent += needed;
    level += 1;
    needed = 300 + (level - 1) * 100;
  }
  return { level, current: totalXp - spent, needed };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);          ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);          ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fmtCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// Retorna true se a cor for escura (luminância < 128)
// Suporta: hex (#000, #000000, #00000088), rgb(...), rgba(...), named (black/white)
function isColorDark(color) {
  if (!color) return false;
  try {
    const s = String(color).trim().toLowerCase();
    // Named colors
    if (s === 'black' || s === 'transparent') return true;
    if (s === 'white') return false;
    let r, g, b;
    // rgb() / rgba()
    const rgbM = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbM) {
      [r, g, b] = [Number(rgbM[1]), Number(rgbM[2]), Number(rgbM[3])];
      return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    }
    // Hex
    const hex = s.replace(/^#/, '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else { return false; }
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  } catch { return false; }
}

// ── Cache de imagens (evita re-fetch para frames de GIF animado) ─────────────
const _imgCache = new Map(); // url → Image
const _IMG_CACHE_MAX = 120;

async function loadUrl(url, timeoutMs = 7000) {
  if (_imgCache.has(url)) return _imgCache.get(url);
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const img = await loadImage(Buffer.from(await r.arrayBuffer()));
    if (_imgCache.size >= _IMG_CACHE_MAX) {
      // Remove o mais antigo
      _imgCache.delete(_imgCache.keys().next().value);
    }
    _imgCache.set(url, img);
    return img;
  } finally { clearTimeout(timer); }
}

function parseCustomEmoji(e) {
  const m = e?.match(/<a?:\w+:(\d{10,20})>/);
  return m ? `https://cdn.discordapp.com/emojis/${m[1]}.png` : null;
}

// Tenta múltiplos CDNs para máxima confiabilidade
async function loadEmojiImg(emoji) {
  if (!emoji) return null;
  const cu = parseCustomEmoji(emoji);
  if (cu) try { return await loadUrl(cu, 5000); } catch {}
  const cp = [...emoji].map(c => c.codePointAt(0).toString(16)).filter(c => c !== 'fe0f').join('-');
  const cdns = [
    `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${cp}.png`,
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cp}.png`,
  ];
  for (const url of cdns) {
    try { return await loadUrl(url, 5000); } catch {}
  }
  return null;
}

function tokenizeBio(text) {
  const re = /<a?:\w+:\d{10,20}>|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?)*/gu;
  const tokens = []; let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) tokens.push({ type: 'text', value: text.slice(last, m.index) });
    tokens.push({ type: 'emoji', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

async function drawBioWithEmojis(ctx, text, x, y, maxW, lineH, emojiSz) {
  const tokens = tokenizeBio(text);
  const cache  = new Map();
  await Promise.all(tokens.filter(t => t.type === 'emoji').map(async t => {
    const img = await loadEmojiImg(t.value).catch(() => null);
    if (img) cache.set(t.value, img);
  }));
  const SW = ctx.measureText(' ').width;
  const items = [];
  for (const tok of tokens) {
    if (tok.type === 'emoji') { items.push({ kind: 'emoji', value: tok.value, width: emojiSz + 2 }); continue; }
    for (const p of tok.value.split(/(\s+)/)) {
      if (!p) continue;
      items.push(/^\s+$/.test(p)
        ? { kind: 'space', value: p, width: SW * p.length }
        : { kind: 'word',  value: p, width: ctx.measureText(p).width });
    }
  }
  const lines = []; let cur = [], curW = 0;
  for (const item of items) {
    if (item.kind === 'space') { cur.push(item); curW += item.width; continue; }
    if (curW + item.width > maxW && cur.length) {
      while (cur.length && cur.at(-1).kind === 'space') cur.pop();
      lines.push(cur); cur = []; curW = 0;
    }
    cur.push(item); curW += item.width;
  }
  if (cur.length) { while (cur.length && cur.at(-1).kind === 'space') cur.pop(); lines.push(cur); }
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    const lineW = line.reduce((total, item) => total + item.width, 0);
    let cx = x + Math.max(0, (maxW - lineW) / 2);
    for (const item of line) {
      if (item.kind === 'emoji') {
        const img = cache.get(item.value);
        if (img) ctx.drawImage(img, cx, y - emojiSz + 3, emojiSz, emojiSz);
        else ctx.fillText(item.value, cx, y);
        cx += item.width;
      } else if (item.kind === 'space') { cx += item.width; }
      else { ctx.fillText(item.value, cx, y); cx += item.width; }
    }
    y += lineH;
  }
  ctx.restore();
  return y;
}

// ─── Ícone circular: fundo gradiente + emoji por cima ──────────────────────────

function drawIconBg(ctx, x, y, sz, c1, c2) {
  const g = ctx.createLinearGradient(x, y, x + sz, y + sz);
  g.addColorStop(0, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x + sz / 2, y + sz / 2, sz / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#171717';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSlotPattern(ctx, x, y, w, h) {
  ctx.save();
  ctx.strokeStyle = 'rgba(120,120,120,0.16)';
  ctx.lineWidth = 1.4;
  for (let ox = x + 18; ox < x + w - 8; ox += 58) {
    for (let oy = y + 12; oy < y + h - 4; oy += 24) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + 4);
      ctx.lineTo(ox + 8, oy);
      ctx.lineTo(ox + 16, oy + 4);
      ctx.lineTo(ox + 8, oy + 9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy + 4);
      ctx.lineTo(ox, oy + 13);
      ctx.lineTo(ox + 8, oy + 18);
      ctx.lineTo(ox + 8, oy + 9);
      ctx.moveTo(ox + 16, oy + 4);
      ctx.lineTo(ox + 16, oy + 13);
      ctx.lineTo(ox + 8, oy + 18);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Ícones canvas de fallback (usados se o emoji não carregar)
function fallbackCoin(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2;
  for (let i = 2; i >= 0; i--) {
    const off = i * sz * 0.06;
    ctx.fillStyle = i === 0 ? '#FFD700' : `rgba(255,200,50,${0.6 + i * 0.15})`;
    ctx.beginPath(); ctx.ellipse(cx, cy - off, sz * 0.28, sz * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(180,130,0,0.4)'; ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${Math.floor(sz * 0.32)}px BotFont`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('$', cx, cy + sz * 0.06);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function fallbackStar(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2, R = sz * 0.30, r2 = R * 0.42;
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rl = i % 2 === 0 ? R : r2;
    i === 0 ? ctx.moveTo(cx + rl * Math.cos(a), cy + rl * Math.sin(a))
            : ctx.lineTo(cx + rl * Math.cos(a), cy + rl * Math.sin(a));
  }
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(220,160,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
}

function fallbackMedal(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2;
  // Ribbon
  ctx.fillStyle = '#FF6B6B';
  ctx.beginPath();
  ctx.moveTo(cx - sz * 0.10, cy - sz * 0.30);
  ctx.lineTo(cx + sz * 0.10, cy - sz * 0.30);
  ctx.lineTo(cx + sz * 0.06, cy - sz * 0.04);
  ctx.lineTo(cx, cy - sz * 0.10);
  ctx.lineTo(cx - sz * 0.06, cy - sz * 0.04);
  ctx.closePath(); ctx.fill();
  // Gold circle
  const grad = ctx.createRadialGradient(cx, cy + sz * 0.08, 0, cx, cy + sz * 0.08, sz * 0.20);
  grad.addColorStop(0, '#FFD700'); grad.addColorStop(1, '#F59E0B');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy + sz * 0.08, sz * 0.20, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `bold ${Math.floor(sz * 0.22)}px BotFont`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', cx, cy + sz * 0.08);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function fallbackThumb(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  roundRect(ctx, cx - sz * 0.06, cy - sz * 0.04, sz * 0.24, sz * 0.26, sz * 0.05); ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - sz * 0.17, sz * 0.14, Math.PI * 0.75, Math.PI * 1.75);
  ctx.lineTo(cx - sz * 0.08, cy - sz * 0.04); ctx.lineTo(cx - sz * 0.06, cy - sz * 0.04);
  ctx.closePath(); ctx.fill();
  roundRect(ctx, cx - sz * 0.24, cy + sz * 0.02, sz * 0.18, sz * 0.24, sz * 0.04); ctx.fill();
  // Stars
  ctx.fillStyle = '#FFD700';
  for (let i = 0; i < 3; i++) {
    const sx = cx - sz * 0.15 + i * sz * 0.14, sy = cy - sz * 0.32;
    ctx.font = `${Math.floor(sz * 0.18)}px BotFont`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', sx, sy);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function fallbackDove(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  // Body
  ctx.beginPath(); ctx.ellipse(cx - sz * 0.04, cy + sz * 0.05, sz * 0.22, sz * 0.14, -0.2, 0, Math.PI * 2); ctx.fill();
  // Wing
  ctx.beginPath();
  ctx.moveTo(cx - sz * 0.20, cy);
  ctx.bezierCurveTo(cx - sz * 0.10, cy - sz * 0.28, cx + sz * 0.18, cy - sz * 0.22, cx + sz * 0.12, cy + sz * 0.02);
  ctx.closePath(); ctx.fill();
  // Head
  ctx.beginPath(); ctx.arc(cx + sz * 0.14, cy - sz * 0.04, sz * 0.09, 0, Math.PI * 2); ctx.fill();
  // Heart
  ctx.fillStyle = '#FF6B9D';
  ctx.font = `${Math.floor(sz * 0.22)}px BotFont`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('♥', cx - sz * 0.06, cy + sz * 0.30);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function fallbackBff(ctx, x, y, sz) {
  const cx = x + sz / 2, cy = y + sz / 2;
  // BFF charm/pendant
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy - sz * 0.12, sz * 0.10, 0, Math.PI * 2); ctx.stroke();
  // Chain
  ctx.beginPath(); ctx.moveTo(cx, cy - sz * 0.22); ctx.lineTo(cx, cy - sz * 0.30); ctx.stroke();
  // Heart
  const hw = sz * 0.19;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.save(); ctx.translate(cx, cy + sz * 0.10);
  ctx.beginPath();
  ctx.moveTo(0, hw * 0.6);
  ctx.bezierCurveTo(hw * 1.1, -hw * 0.2, hw * 1.1, -hw * 0.9, 0, -hw * 0.35);
  ctx.bezierCurveTo(-hw * 1.1, -hw * 0.9, -hw * 1.1, -hw * 0.2, 0, hw * 0.6);
  ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#CE93D8';
  ctx.font = `bold ${Math.floor(sz * 0.14)}px BotFont`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BF', cx, cy + sz * 0.10);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// Config de cada stat: emoji para tentar carregar + cores do bg + fallback canvas
const STAT_ICON_CONFIGS = [
  { emoji: '🌍', c1: '#20cbd1', c2: '#149846', fallback: fallbackDove   }, // Nível
  { emoji: '⭐', c1: '#9a4be8', c2: '#5c25ba', fallback: fallbackStar   }, // XP
  { emoji: '🌟', c1: '#ffb84c', c2: '#e27720', fallback: fallbackMedal  }, // Reps
  { emoji: '💲', c1: '#ffd267', c2: '#e3a526', fallback: fallbackCoin   }, // Coins
  { emoji: '💗', c1: '#ff9dba', c2: '#ee4b72', fallback: fallbackDove   }, // Casado
  { emoji: '🌟', c1: '#2786ef', c2: '#0c3caa', fallback: fallbackBff    }, // Amigo
];

// ─── Gerador principal ────────────────────────────────────────────────────────

export async function generateProfileCard({
  username, avatarUrl, balance, bank, activeBanner, purchases,
  activeRing, ringBorderColor = null, activePet, guildBadgeEmojis = {}, guildId = null,
  marriedToName = null, bestFriendName = null, bio = null,
  cardBg1 = null, cardBg2 = null, cardPanelColor = null,
  xp = 0, reps = 0,
  // Parâmetros internos para geração de GIF animado:
  _bannerImage = null,   // Image já carregada — pula o loadUrl do banner
  _returnCanvas = false, // se true, retorna o canvas em vez de PNG buffer
}) {
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const banner = _bannerImage ? null : await resolveBanner(activeBanner, guildId);
  const { c1: rc1, c2: rc2 } = getRingColors(activeRing ?? null);
  const { level, current: xpCurrent, needed: xpNeeded } = computeLevel(xp);
  const earnedKeys = computeEarnedBadgeKeys({
    balance, bank, purchases, activePet, activeBanner, activeRing,
  });

  const darkCard = isColorDark(cardBg1);
  const darkPanel = isColorDark(cardPanelColor);
  const statIconImgs = await Promise.all(
    STAT_ICON_CONFIGS.map(ic => loadEmojiImg(ic.emoji).catch(() => null)),
  );
  const badgeIconImgs = await Promise.all(
    earnedKeys.map(key => {
      const badge = BADGE_DEFS.find(b => b.key === key);
      const emoji = guildBadgeEmojis[key] ?? badge?.defaultEmoji ?? '🏅';
      return loadEmojiImg(emoji).catch(() => null);
    }),
  );

  // ── Corpo branco da referência, mantendo as cores personalizadas do usuário ─
  if (cardBg1 && cardBg2) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, cardBg1); g.addColorStop(1, cardBg2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = cardBg1 ?? '#ffffff';
  }
  ctx.fillRect(0, 0, W, H);

  // ── Banner largo com cantos arredondados na base ────────────────────────────
  const BANNER_H = 245;
  const drawBannerImage = (img) => {
    const scale = Math.max(W / img.width, BANNER_H / img.height);
    const sw = img.width * scale, sh = img.height * scale;
    ctx.save();
    roundRect(ctx, 0, 0, W, BANNER_H, 30);
    ctx.clip();
    ctx.drawImage(img, (W - sw) / 2, (BANNER_H - sh) / 2, sw, sh);
    ctx.restore();
  };
  const drawBannerGradient = (colors) => {
    const [bg1, bg2] = colors;
    const g = ctx.createLinearGradient(0, 0, W, BANNER_H);
    g.addColorStop(0, bg1); g.addColorStop(1, bg2);
    ctx.save();
    roundRect(ctx, 0, 0, W, BANNER_H, 30);
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, BANNER_H);
    ctx.restore();
  };

  if (_bannerImage) {
    drawBannerImage(_bannerImage);
  } else if (banner) {
    try {
      drawBannerImage(await loadUrl(banner.imageUrl));
    } catch {
      drawBannerGradient(banner.gradient ?? ['#f3a8d0', '#a7b9ff']);
    }
  } else {
    drawBannerGradient(['#f3a8d0', '#a7b9ff']);
  }

  // Pequeno brilho suave para aproximar o acabamento pastel da referência.
  ctx.save();
  roundRect(ctx, 0, 0, W, BANNER_H, 30);
  ctx.clip();
  const bannerGlow = ctx.createLinearGradient(0, 0, W, BANNER_H);
  bannerGlow.addColorStop(0, 'rgba(255,255,255,0.22)');
  bannerGlow.addColorStop(0.55, 'rgba(255,255,255,0)');
  bannerGlow.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = bannerGlow;
  ctx.fillRect(0, 0, W, BANNER_H);
  ctx.restore();

  // ── Avatar à esquerda, sobrepondo o banner ─────────────────────────────────
  const AV_CX = 160, AV_CY = BANNER_H, AV_R = 100;
  ctx.fillStyle = ringBorderColor ?? '#e5e5e5';
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R + 12, 0, Math.PI * 2);
  ctx.fill();
  if (activeRing) await drawAvatarRing(ctx, AV_CX, AV_CY, AV_R + 4, activeRing);

  ctx.save();
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R, 0, Math.PI * 2);
  ctx.clip();
  try {
    ctx.drawImage(await loadUrl(avatarUrl), AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
  } catch {
    ctx.fillStyle = '#8e44ad';
    ctx.fillRect(AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
  }
  ctx.restore();

  // Pet pequeno sobre a foto, como um item equipado.
  if (activePet) {
    const px = AV_CX + AV_R * 0.68, py = AV_CY + AV_R * 0.68;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 21, 0, Math.PI * 2); ctx.fill();
    const pg = ctx.createLinearGradient(px - 20, py - 20, px + 20, py + 20);
    pg.addColorStop(0, rc1); pg.addColorStop(1, rc2);
    ctx.strokeStyle = pg; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 19, 0, Math.PI * 2); ctx.stroke();
    const pi = await loadEmojiImg(activePet);
    if (pi) ctx.drawImage(pi, px - 13, py - 13, 26, 26);
  }

  // ── Nome e bio em cápsulas ──────────────────────────────────────────────────
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillStyle = darkCard ? '#ffffff' : '#050505';
  ctx.fillText(username, 298, 302);

  ctx.fillStyle = darkCard ? 'rgba(255,255,255,0.18)' : '#e8e8e8';
  roundRect(ctx, 598, 253, 177, 45, 16); ctx.fill();
  for (let i = 0; i < earnedKeys.length; i++) {
    const badge = BADGE_DEFS.find(b => b.key === earnedKeys[i]);
    const bx = 609 + i * 32;
    const by = 261;
    ctx.fillStyle = badge?.color ?? 'rgba(150,150,150,0.75)';
    ctx.beginPath();
    ctx.arc(bx + 15, by + 15, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darkCard ? 'rgba(255,255,255,0.7)' : 'rgba(30,30,30,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const badgeImg = badgeIconImgs[i];
    if (badgeImg) {
      ctx.drawImage(badgeImg, bx + 5, by + 5, 20, 20);
    } else {
      ctx.font = `16px ${FONT}`;
      ctx.fillStyle = darkCard ? '#ffffff' : '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        guildBadgeEmojis[earnedKeys[i]] ?? badge?.defaultEmoji ?? '🏅',
        bx + 15,
        by + 15,
      );
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const bioText = bio ?? 'Use k!sobremim <msg> para alterar!';
  roundRect(ctx, 255, 310, 520, 45, 20);
  ctx.fillStyle = darkCard ? 'rgba(255,255,255,0.16)' : '#dedede';
  ctx.fill();
  ctx.fillStyle = darkCard ? '#ffffff' : '#111111';
  ctx.font = `20px ${FONT}`;
  await drawBioWithEmojis(ctx, bioText, 255, 339, 495, 24, 19);

  // ── Slots de itens à esquerda ──────────────────────────────────────────────
  const slotData = [
    { label: 'SLOT VAZIO', emoji: null },
    { label: activePet ? 'PET EQUIPADO' : 'SLOT VAZIO', emoji: activePet ?? null },
    { label: 'SLOT VAZIO', emoji: null },
  ];
  const slotIconImgs = await Promise.all(
    slotData.map(slot => loadEmojiImg(slot.emoji).catch(() => null)),
  );

  ctx.strokeStyle = 'rgba(160,160,160,0.52)';
  ctx.lineWidth = 1;
  roundRect(ctx, 39, 378, 220, 204, 26); ctx.stroke();
  for (let i = 0; i < slotData.length; i++) {
    const sx = 55, sy = 398 + i * 52, sw = 188, sh = 43;
    ctx.fillStyle = '#e3e3e3';
    roundRect(ctx, sx, sy, sw, sh, 16); ctx.fill();
    drawSlotPattern(ctx, sx, sy, sw, sh);
    const icon = slotIconImgs[i];
    if (icon) {
      ctx.drawImage(icon, sx + 12, sy + 7, 29, 29);
      ctx.font = `bold 12px ${FONT}`;
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.fillText(slotData[i].label, sx + 48, sy + 27);
    } else {
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillStyle = '#222222';
      ctx.textAlign = 'center';
      ctx.fillText(slotData[i].label, sx + sw / 2, sy + 27);
    }
  }
  ctx.textAlign = 'left';

  // ── Seis cápsulas de estatísticas no grid da referência ─────────────────────
  const statsData = [
    { text: `Level: ${level}` },
    { text: `XP ${xpCurrent}/${xpNeeded}` },
    { text: `Reputação: ${reps}` },
    { text: fmtCompact(balance ?? 0) },
    { text: marriedToName ?? 'Nenhum' },
    { text: bestFriendName ?? 'Nenhum' },
  ];
  const PILL_W = 233, PILL_H = 58, GAP_X = 23, GAP_Y = 10;
  const ISZ = 58;

  for (let i = 0; i < statsData.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const cX = 288 + col * (PILL_W + GAP_X);
    const cY = 388 + row * (PILL_H + GAP_Y);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = cardPanelColor ?? '#dedede';
    roundRect(ctx, cX, cY, PILL_W, PILL_H, PILL_H / 2); ctx.fill();
    ctx.restore();

    const icCfg = STAT_ICON_CONFIGS[i];
    const iX = cX, iY = cY;
    drawIconBg(ctx, iX, iY, ISZ, icCfg.c1, icCfg.c2);
    const emojiImg = statIconImgs[i];
    if (emojiImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(iX + ISZ / 2, iY + ISZ / 2, ISZ / 2 - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(emojiImg, iX + 7, iY + 7, ISZ - 14, ISZ - 14);
      ctx.restore();
    } else {
      ctx.save(); icCfg.fallback(ctx, iX, iY, ISZ); ctx.restore();
    }

    const maxW = PILL_W - ISZ - 14;
    let statText = statsData[i].text;
    ctx.font = `bold 21px ${FONT}`;
    while (statText.length > 1 && ctx.measureText(statText).width > maxW) {
      statText = statText.slice(0, -1);
    }
    ctx.fillStyle = darkPanel ? '#ffffff' : '#111111';
    ctx.textAlign = 'left';
    ctx.fillText(statText, cX + ISZ + 14, cY + 37);

    if (i === 1) {
      const barX = cX + ISZ + 14;
      const barY = cY + 44;
      const barW = maxW;
      const barH = 6;
      const progress = Math.min(1, Math.max(0, xpNeeded ? xpCurrent / xpNeeded : 0));
      ctx.fillStyle = darkPanel ? 'rgba(255,255,255,0.24)' : 'rgba(40,40,40,0.16)';
      roundRect(ctx, barX, barY, barW, barH, barH / 2); ctx.fill();
      if (progress > 0) {
        ctx.fillStyle = '#8b5cf6';
        roundRect(ctx, barX, barY, Math.max(barH, barW * progress), barH, barH / 2); ctx.fill();
      }
    }
  }

  ctx.textAlign = 'left';
  if (_returnCanvas) return canvas;
  return canvas.toBuffer('image/png');
}

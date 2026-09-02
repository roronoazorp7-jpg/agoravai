import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { drawAvatarRing } from './shopData.js';

const __ecoFilename = fileURLToPath(import.meta.url);
const __ecoDir      = dirname(__ecoFilename);
const _bjDir   = join(__ecoDir, '../assets');
const _ecoDir  = join(__ecoDir, '../assets');
const _fontsDir = join(__ecoDir, '../../fonts');
const _rankingBackgroundPath = join(_ecoDir, 'ranking-background.jpg');

GlobalFonts.register(readFileSync(join(_fontsDir, 'Roboto-Regular.ttf')), 'BotFont');
GlobalFonts.register(readFileSync(join(_fontsDir, 'Roboto-Bold.ttf')),    'BotFont');

const FONT = 'BotFont';

function fmt(n) { return Number(n).toLocaleString('pt-BR'); }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Sparkle / star decoration ────────────────────────────────────────────────

function drawSparkle(ctx, x, y, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, size * 0.5, size * 0.12, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─── Angel feather ────────────────────────────────────────────────────────────
function drawFeather(ctx, x, y, dir, alpha = 0.18) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const quillLen = 80;
  const barbs    = 12;
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth   = 1;
  // Central quill
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dir * 14, y + quillLen);
  ctx.stroke();
  for (let i = 1; i <= barbs; i++) {
    const t  = i / barbs;
    const qx = x + dir * 14 * t;
    const qy = y + quillLen * t;
    const sp = 6 + t * 22;
    // Leading barb
    ctx.beginPath();
    ctx.moveTo(qx, qy);
    ctx.quadraticCurveTo(qx + dir * sp * 0.7, qy - 4, qx + dir * sp, qy + 4);
    ctx.stroke();
    // Trailing barb (shorter)
    ctx.beginPath();
    ctx.moveTo(qx, qy);
    ctx.quadraticCurveTo(qx - dir * sp * 0.3, qy - 3, qx - dir * sp * 0.45, qy + 3);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Divine light rays from top ───────────────────────────────────────────────
function drawDivineRays(ctx, W, H) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const cx = W / 2, cy = -30;
  const rays = 10;
  for (let i = 0; i < rays; i++) {
    const angle  = -Math.PI / 2 + (i - (rays - 1) / 2) * 0.19;
    const spread = 0.045;
    const grad   = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * H * 1.8, cy + Math.sin(angle) * H * 1.8);
    grad.addColorStop(0,   'rgba(200,185,255,0.18)');
    grad.addColorStop(0.5, 'rgba(160,130,230,0.06)');
    grad.addColorStop(1,   'rgba(100,80,200,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle - spread) * H * 2.2, cy + Math.sin(angle - spread) * H * 2.2);
    ctx.lineTo(cx + Math.cos(angle + spread) * H * 2.2, cy + Math.sin(angle + spread) * H * 2.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// ─── Tiny stars ───────────────────────────────────────────────────────────────
function drawStars(ctx, W, H) {
  const stars = [
    [55,28],[W-50,22],[80,H-30],[W-70,H-28],[W/2+160,18],[W/2-155,20],
    [W/2,15],[30,H/2-40],[W-30,H/2+20],[W/2+280,H-22],[W/2-260,H-18],
    [140,38],[W-140,35],[W/2+80,H-12],[W/2-90,H-14]
  ];
  for (const [sx, sy] of stars) {
    ctx.save();
    ctx.fillStyle = 'rgba(220,210,255,0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─── Playing card (clean realistic style matching reference) ─────────────────

// ─── Suit shape drawn with canvas paths (no Unicode dependency) ───────────────
function drawSuit(ctx, cx, cy, suit, size, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  if (suit === '♥') {
    const s = size * 0.52;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.5, cy, cx - s * 1.5, cy - s * 1.1, cx, cy - s * 0.3);
    ctx.bezierCurveTo(cx + s * 1.5, cy - s * 1.1, cx + s * 1.5, cy, cx, cy + s * 0.9);
    ctx.fill();
  } else if (suit === '♦') {
    const s = size * 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s * 0.65, cy);
    ctx.lineTo(cx, cy + s);
    ctx.lineTo(cx - s * 0.65, cy);
    ctx.closePath();
    ctx.fill();
  } else if (suit === '♠') {
    const s = size * 0.48;
    // Inverted heart (top bulb)
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.4);
    ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.3, cx - s * 1.5, cy - s * 1.4, cx, cy - s * 0.6);
    ctx.bezierCurveTo(cx + s * 1.5, cy - s * 1.4, cx + s * 1.5, cy - s * 0.3, cx, cy + s * 0.4);
    ctx.fill();
    // Stem + base
    const stemW = s * 0.25, stemH = s * 0.65;
    ctx.fillRect(cx - stemW / 2, cy + s * 0.4, stemW, stemH);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.7, cy + s * 0.4 + stemH);
    ctx.lineTo(cx + s * 0.7, cy + s * 0.4 + stemH);
    ctx.lineTo(cx, cy + s * 0.4 + stemH - s * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (suit === '♣') {
    const r = size * 0.3;
    // Three circles
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.85, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.9, cy + r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.9, cy + r * 0.3, r, 0, Math.PI * 2); ctx.fill();
    // Stem
    const sw = r * 0.38;
    ctx.fillRect(cx - sw / 2, cy + r * 0.6, sw, r * 0.85);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy + r * 1.45);
    ctx.lineTo(cx + r * 0.7, cy + r * 1.45);
    ctx.lineTo(cx, cy + r * 1.1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCard(ctx, x, y, rank, suit, scale = 1) {
  const cw = Math.round(78 * scale), ch = Math.round(108 * scale), cr = Math.round(10 * scale);
  const isRed = suit === '♥' || suit === '♦';
  const col   = isRed ? '#CC2222' : '#111111';

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4;

  // White card body
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, x, y, cw, ch, cr); ctx.fill();

  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
  roundRect(ctx, x, y, cw, ch, cr); ctx.stroke();

  const fs = Math.round(15 * scale);

  // Top-left rank
  ctx.fillStyle = col;
  ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(rank, x + Math.round(6 * scale), y + Math.round(18 * scale));
  // Top-left suit (small path)
  drawSuit(ctx, x + Math.round(10 * scale), y + Math.round(28 * scale), suit, Math.round(7 * scale), col);

  // Center large suit
  drawSuit(ctx, x + cw / 2, y + ch / 2, suit, Math.round(22 * scale), col);

  // Bottom-right (rotated 180°)
  ctx.save();
  ctx.translate(x + cw, y + ch);
  ctx.rotate(Math.PI);
  ctx.fillStyle = col;
  ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText(rank, Math.round(6 * scale), Math.round(18 * scale));
  drawSuit(ctx, Math.round(10 * scale), Math.round(28 * scale), suit, Math.round(7 * scale), col);
  ctx.restore();
}

// ─── Cute background helper ───────────────────────────────────────────────────

function drawCuteBg(ctx, W, H, colors) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.5, colors[1]);
  g.addColorStop(1, colors[2]);
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fill();

  // Polka dot decoration
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let dx = 20; dx < W; dx += 40) {
    for (let dy = 20; dy < H; dy += 40) {
      ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawCuteHeader(ctx, W, text, textColor, bgColor) {
  const g = ctx.createLinearGradient(0, 0, W, 52);
  g.addColorStop(0, bgColor);
  g.addColorStop(1, bgColor + 'bb');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, W, 52, 20); ctx.fill();
  ctx.fillRect(0, 30, W, 22);

  ctx.fillStyle = textColor;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, 33);
}

function drawResultBanner(ctx, W, cy, text, bgFrom, bgTo, textColor) {
  const bw = 320, bh = 52, bx = W / 2 - bw / 2;
  const g = ctx.createLinearGradient(bx, cy, bx + bw, cy + bh);
  g.addColorStop(0, bgFrom);
  g.addColorStop(1, bgTo);
  ctx.fillStyle = g;
  roundRect(ctx, bx, cy, bw, bh, 26); ctx.fill();

  ctx.fillStyle = textColor;
  ctx.font = `bold 20px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, cy + 33);
}

function drawFooterStats(ctx, W, H, line1, line2) {
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, 20, H - 50, W - 40, 34, 17); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(line1, W / 2, H - 35);

  if (line2) {
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(line2, W / 2, H - 20);
  }
}

// ─── Short number formatter ───────────────────────────────────────────────────

function fmtShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + 'K';
  return fmt(n);
}

// ─── Card back (for active blackjack) ────────────────────────────────────────

function drawCardBack(ctx, x, y, scale = 1) {
  const cw = Math.round(70 * scale), ch = Math.round(98 * scale), cr = Math.round(10 * scale);
  ctx.shadowColor = 'rgba(100,50,180,0.4)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
  g.addColorStop(0, '#5B2EA0'); g.addColorStop(1, '#3A1A6A');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, cw, ch, cr); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = 'rgba(200,150,255,0.6)'; ctx.lineWidth = 1.5;
  roundRect(ctx, x + 5, y + 5, cw - 10, ch - 10, cr - 2); ctx.stroke();
  for (let dy = 14; dy < ch - 8; dy += 12) {
    for (let dx = 10; dx < cw - 4; dx += 12) {
      ctx.beginPath(); ctx.arc(x + dx, y + dy, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,150,255,0.2)'; ctx.fill();
    }
  }
}

// ─── Gem / Bomb icons for Mines (cute redesign) ──────────────────────────────

function drawGem(ctx, cx, cy, r) {
  ctx.save();
  // Glow aura
  const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.4);
  aura.addColorStop(0, 'rgba(103,232,249,0.45)');
  aura.addColorStop(1, 'rgba(103,232,249,0)');
  ctx.fillStyle = aura;
  ctx.beginPath(); ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2); ctx.fill();

  // Main diamond body
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#E0F9FF');
  g.addColorStop(0.3, '#67E8F9');
  g.addColorStop(0.7, '#22D3EE');
  g.addColorStop(1, '#0891B2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r);
  ctx.lineTo(cx + r * 0.6, cy - r * 0.2);
  ctx.lineTo(cx + r * 0.8, cy + r * 0.2);
  ctx.lineTo(cx,           cy + r);
  ctx.lineTo(cx - r * 0.8, cy + r * 0.2);
  ctx.lineTo(cx - r * 0.6, cy - r * 0.2);
  ctx.closePath(); ctx.fill();

  // Inner facet lines
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r * 0.6, cy - r * 0.2); ctx.lineTo(cx + r * 0.6, cy - r * 0.2); ctx.stroke();

  // Top highlight
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(cx,           cy - r);
  ctx.lineTo(cx + r * 0.6, cy - r * 0.2);
  ctx.lineTo(cx,           cy - r * 0.05);
  ctx.lineTo(cx - r * 0.6, cy - r * 0.2);
  ctx.closePath(); ctx.fill();

  // Sparkle dot
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.55, r * 0.14, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBomb(ctx, cx, cy, r) {
  ctx.save();
  // Fuse stem
  ctx.strokeStyle = '#92400E'; ctx.lineWidth = r * 0.13; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.42, cy - r * 0.6);
  ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 1.05, cx + r * 0.55, cy - r * 1.25);
  ctx.stroke();
  // Fuse spark
  ctx.fillStyle = '#FDE68A';
  ctx.shadowColor = '#F59E0B'; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(cx + r * 0.55, cy - r * 1.25, r * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(cx + 2, cy + r * 0.85, r * 0.68, r * 0.18, 0, 0, Math.PI * 2); ctx.fill();

  // Body gradient
  const bg = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.2, r * 0.05, cx, cy + r * 0.1, r * 0.72);
  bg.addColorStop(0, '#374151');
  bg.addColorStop(0.6, '#1F2937');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.08, r * 0.72, 0, Math.PI * 2); ctx.fill();

  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(cx - r * 0.24, cy - r * 0.12, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── Mines result card (cute redesign) ───────────────────────────────────────

export function generateMinesCard({ grid, revealed, bombs, bet, payout, memberName, status }) {
  const GRID = 4, CELL = 90, GAP = 10;
  const GW  = GRID * CELL + (GRID - 1) * GAP;
  const PAD = 22;
  const W   = GW + PAD * 2;   // 426
  const H   = W + 100;        // header + footer
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#052e16');
  bg.addColorStop(0.5, '#064e3b');
  bg.addColorStop(1, '#052e16');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24); ctx.fill();

  // Radial centre glow
  const glow = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, W * 0.7);
  glow.addColorStop(0, 'rgba(52,211,153,0.12)');
  glow.addColorStop(1, 'rgba(52,211,153,0)');
  ctx.fillStyle = glow;
  roundRect(ctx, 0, 0, W, H, 24); ctx.fill();

  // Sparkles
  const sp = [[38,30],[W-38,28],[22,H-40],[W-24,H-38],[W/2-60,18],[W/2+55,22],[30,H/2],[W-28,H/2+10]];
  for (const [sx,sy] of sp) drawSparkle(ctx, sx, sy, 7, 'rgba(167,243,208,0.55)');

  // ── Header pill ─────────────────────────────────────────────────────────────
  const isLost   = status === 'lost';
  const hText    = isLost ? '💥  Você perdeu!' : '✅  Você ganhou!';
  const hColor   = isLost ? ['#991B1B','#7F1D1D'] : ['#065F46','#064E3B'];

  const hg = ctx.createLinearGradient(PAD, 14, PAD + GW, 58);
  hg.addColorStop(0, hColor[0]); hg.addColorStop(1, hColor[1]);
  ctx.fillStyle = hg;
  roundRect(ctx, PAD, 14, GW, 44, 22); ctx.fill();
  ctx.strokeStyle = isLost ? 'rgba(252,165,165,0.4)' : 'rgba(110,231,183,0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, PAD, 14, GW, 44, 22); ctx.stroke();

  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(hText, W / 2, 42);

  // ── Grid wrapper ─────────────────────────────────────────────────────────────
  const gridY = 72;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  roundRect(ctx, PAD - 7, gridY - 7, GW + 14, GW + 14, 20); ctx.fill();

  // Inner grid rim
  ctx.strokeStyle = 'rgba(52,211,153,0.2)'; ctx.lineWidth = 1.5;
  roundRect(ctx, PAD - 7, gridY - 7, GW + 14, GW + 14, 20); ctx.stroke();

  // ── Cells ────────────────────────────────────────────────────────────────────
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const idx  = row * GRID + col;
      const cx   = PAD + col * (CELL + GAP);
      const cy   = gridY + row * (CELL + GAP);
      const rev  = revealed[idx];
      const bomb = grid[idx];

      // Shadow beneath cell
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundRect(ctx, cx + 3, cy + 5, CELL, CELL, 18); ctx.fill();

      // Cell background
      const cg = ctx.createLinearGradient(cx, cy, cx, cy + CELL);
      if (rev && bomb) {
        cg.addColorStop(0, '#FCA5A5'); cg.addColorStop(1, '#F87171');
      } else if (rev) {
        cg.addColorStop(0, '#A7F3D0'); cg.addColorStop(1, '#6EE7B7');
      } else {
        cg.addColorStop(0, '#34D399'); cg.addColorStop(1, '#10B981');
      }
      ctx.fillStyle = cg;
      roundRect(ctx, cx, cy, CELL, CELL, 18); ctx.fill();

      // Top gloss
      const gloss = ctx.createLinearGradient(cx, cy, cx, cy + CELL * 0.45);
      gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      roundRect(ctx, cx, cy, CELL, CELL * 0.45, 18); ctx.fill();

      // Border
      ctx.strokeStyle = rev && bomb
        ? 'rgba(239,68,68,0.5)'
        : rev
          ? 'rgba(52,211,153,0.5)'
          : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx, cy, CELL, CELL, 18); ctx.stroke();

      // Icon
      const iconX = cx + CELL / 2, iconY = cy + CELL / 2 + 2;
      if (rev && bomb) drawBomb(ctx, iconX, iconY, 26);
      else if (rev)    drawGem(ctx, iconX, iconY, 26);
    }
  }

  // ── Footer pill ──────────────────────────────────────────────────────────────
  const footerY = gridY + GW + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  roundRect(ctx, PAD, footerY, GW, 54, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  roundRect(ctx, PAD, footerY, GW, 54, 18); ctx.stroke();

  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center';
  const gainTxt = isLost ? '0' : fmtShort(payout);
  ctx.fillText(`Aposta: ${fmtShort(bet)}   •   Ganhos: ${gainTxt}`, W / 2, footerY + 22);
  ctx.fillStyle = 'rgba(167,243,208,0.7)'; ctx.font = `12px ${FONT}`;
  ctx.fillText(`💣 ${bombs} minas  •  ${memberName}`, W / 2, footerY + 41);

  return canvas.toBuffer('image/png');
}

// ─── Blackjack card ───────────────────────────────────────────────────────────
// Uses the two template images (green = win/playing, red = loss/bust) as
// Renders live cards and values dynamically — no static background image.

export async function generateBlackjackCard({ playerCards, dealerCards, pTotal, dTotal, won, tie, bust, hideDealer = false }) {
  const W = 820, H = 500;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background: dark/black ──────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a0a'); bg.addColorStop(0.5, '#111111'); bg.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 30; x < W; x += 44)
    for (let y = 30; y < H; y += 44) {
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }

  // ── Title bar ───────────────────────────────────────────────────────────────
  let titleText, titleBg;
  if (hideDealer) { titleText = '🃏 EM JOGO'; titleBg = '#2E7D32'; }
  else if (won)   { titleText = '🏆 VITÓRIA!'; titleBg = '#2E7D32'; }
  else if (tie)   { titleText = '🤝 EMPATE';   titleBg = '#0277BD'; }
  else if (bust)  { titleText = '💥 BUST!';    titleBg = '#B71C1C'; }
  else            { titleText = '❌ DERROTA';  titleBg = '#B71C1C'; }

  const grad = ctx.createLinearGradient(0, 0, W, 52);
  grad.addColorStop(0, titleBg); grad.addColorStop(1, titleBg + 'cc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 52);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 28px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(titleText, W / 2, 36);

  // ── Panel + card helper ─────────────────────────────────────────────────────
  function drawPanel(label, cards, total, hideLast, panelY, panelH) {
    // Panel background
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, 18, panelY, W - 36, panelH, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    roundRect(ctx, 18, panelY, W - 36, panelH, 14); ctx.stroke();

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(label, 38, panelY + 22);

    // Value badge (top-right)
    const bW = 118, bH = 26, bX = W - 36 - bW, bY = panelY + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, bX, bY, bW, bH, 8); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center';
    const bustTag = bust && !hideLast ? ' 💥' : '';
    ctx.fillText(hideLast ? 'Valor: ?' : `Valor: ${total}${bustTag}`, bX + bW / 2, bY + 18);

    // Cards
    const scale  = 0.92;
    const cardW  = Math.round(78 * scale);
    const cardH  = Math.round(108 * scale);
    const gap    = Math.min(90, (W - 80) / Math.max(cards.length, 1));
    const totalW = cardW + (cards.length - 1) * gap;
    const startX = (W - totalW) / 2;
    const cardY  = panelY + (panelH - cardH) / 2 + 5;

    cards.forEach((card, i) => {
      const cx = Math.round(startX + i * gap);
      if (hideLast && i === cards.length - 1) {
        // Draw card back
        ctx.fillStyle = '#1565C0';
        roundRect(ctx, cx, cardY, cardW, cardH, Math.round(9 * scale)); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
        roundRect(ctx, cx, cardY, cardW, cardH, Math.round(9 * scale)); ctx.stroke();
        // Inner border pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1;
        roundRect(ctx, cx + 5, cardY + 5, cardW - 10, cardH - 10, 5); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = `${Math.round(22 * scale)}px ${FONT}`; ctx.textAlign = 'center';
        ctx.fillText('?', cx + cardW / 2, cardY + cardH / 2 + 8);
      } else {
        drawCard(ctx, cx, cardY, card.rank, card.suit, scale);
      }
    });
  }

  // Dealer always shows 2 slots: first face-up, second hidden when hideDealer
  const dealerDisplay = hideDealer && dealerCards.length > 1
    ? [dealerCards[0], dealerCards[1]]   // show 1 up + 1 hidden
    : dealerCards;

  drawPanel('Mão do Dealer', dealerDisplay, dTotal, hideDealer, 60, 188);
  drawPanel('Sua Mão',       playerCards,   pTotal, false,       258, 204);

  return canvas.toBuffer('image/png');
}

// ─── Canvas-drawn economy icons ───────────────────────────────────────────────

function drawEconomyIcon(ctx, cx, cy, type) {
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.fillStyle   = '#FFFFFF';
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (type === 'wallet') {
    // Wallet body
    ctx.lineWidth = 2.5;
    roundRect(ctx, cx - 13, cy - 9, 26, 18, 3); ctx.stroke();
    // Flap on top
    ctx.lineWidth = 2;
    roundRect(ctx, cx - 13, cy - 9, 14, 7, 2); ctx.stroke();
    // Coin slot circle
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx + 7, cy + 1, 5, 0, Math.PI * 2); ctx.stroke();
    // Dollar in slot
    ctx.font = `bold 7px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('$', cx + 7, cy + 4);

  } else if (type === 'bank') {
    // Roof triangle
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14); ctx.lineTo(cx + 15, cy - 5); ctx.lineTo(cx - 15, cy - 5);
    ctx.closePath(); ctx.stroke();
    // Three columns
    ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 9, cy - 4);
      ctx.lineTo(cx + i * 9, cy + 8);
      ctx.stroke();
    }
    // Base
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy + 9); ctx.lineTo(cx + 16, cy + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 13, cy + 13); ctx.lineTo(cx + 13, cy + 13); ctx.stroke();

  } else if (type === 'coins') {
    // Three stacked coin circles (offset)
    const coins = [{ x: cx - 4, y: cy + 8 }, { x: cx + 2, y: cy + 1 }, { x: cx - 1, y: cy - 7 }];
    ctx.lineWidth = 2;
    for (const c of coins) {
      ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    // Dollar on top coin
    ctx.font = `bold 8px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('$', coins[2].x, coins[2].y + 3);
  }

  ctx.restore();
}

// ─── Balance card (matches reference design) ──────────────────────────────────

function fmtDouble(n) {
  if (n >= 1_000_000) return `${fmt(n)} (${(n / 1_000_000).toFixed(2)}M)`;
  if (n >= 1_000)     return `${fmt(n)} (${(n / 1_000).toFixed(2)}K)`;
  return fmt(n);
}

// Luminância relativa para detectar fundo escuro
function isDark(hex) {
  if (!hex) return false;
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export async function generateBalanceCard({ username, avatarUrl, balance, bank, cardBg1, cardBg2, cardPanelColor, walletRing, walletRingBorder, walletBg }) {
  // Card vertical em alta resolução para o Discord não suavizar o texto e o avatar.
  const W   = 720, H = 1080;
  const PAD = 42;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const hasBgImage  = !!walletBg;
  const hasCustomBg = !!cardBg1;
  // Modo escuro = bg CDN ou cor personalizada escura
  const darkMode = hasBgImage || isDark(cardBg1);

  // ─── Background ──────────────────────────────────────────────────────────
  if (hasBgImage) {
    // CDN image como fundo full-bleed — strip Discord resize params para qualidade máxima
    roundRect(ctx, 0, 0, W, H, 24); ctx.save(); ctx.clip();
    try {
      const cleanUrl = (() => { try { const u = new URL(walletBg); u.searchParams.delete('width'); u.searchParams.delete('height'); u.searchParams.delete('size'); return u.toString(); } catch { return walletBg; } })();
      const buf = Buffer.from(await (await fetch(cleanUrl)).arrayBuffer());
      const img = await loadImage(buf);
      const scale = Math.max(W / img.width, H / img.height);
      const sw = img.width * scale, sh = img.height * scale;
      ctx.drawImage(img, (W - sw) / 2, (H - sh) / 2, sw, sh);
    } catch {
      const fb = ctx.createLinearGradient(0, 0, W, H);
      fb.addColorStop(0, '#0D0D1F'); fb.addColorStop(1, '#1a0533');
      ctx.fillStyle = fb; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
    // Overlay escuro para legibilidade
    const overlay = ctx.createLinearGradient(0, 0, 0, H);
    overlay.addColorStop(0,   'rgba(0,0,0,0.25)');
    overlay.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    overlay.addColorStop(1,   'rgba(0,0,0,0.78)');
    ctx.fillStyle = overlay;
    roundRect(ctx, 0, 0, W, H, 24); ctx.fill();

  } else if (hasCustomBg) {
    // Cor/gradiente personalizado — cobre o card INTEIRO (sem inner card)
    if (cardBg1 && cardBg2) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, cardBg1); g.addColorStop(1, cardBg2);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = cardBg1;
    }
    roundRect(ctx, 0, 0, W, H, 24); ctx.fill();

  } else {
    // Padrão: casca cinza + inner card branco
    ctx.fillStyle = '#E3E3E3';
    roundRect(ctx, 0, 0, W, H, 24); ctx.fill();
    ctx.fillStyle = '#F9F9F9';
    roundRect(ctx, 10, 10, W - 20, H - 20, 18); ctx.fill();
  }

  // ─── Título e avatar ───────────────────────────────────────────────────────
  const titleColor = darkMode ? 'rgba(255,255,255,0.82)' : '#666666';
  ctx.fillStyle = titleColor;
  ctx.font = `bold 25px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('CARTEIRA', W / 2, 54);

  const AV_R  = 132;
  const AV_CX = W / 2;
  const AV_CY = 200;

  // Ring — argola/moldura própria da carteira (independente da argola do /perfil)
  if (walletRing) {
    await drawAvatarRing(ctx, AV_CX, AV_CY, AV_R + (darkMode ? 4 : 6), walletRing);
  } else {
    const ringColor = walletRingBorder ?? (darkMode ? '#FFFFFF' : '#C8C8C8');
    ctx.strokeStyle = ringColor; ctx.lineWidth = darkMode ? 4 : 7;
    ctx.beginPath(); ctx.arc(AV_CX, AV_CY, AV_R + (darkMode ? 4 : 6), 0, Math.PI * 2); ctx.stroke();
  }

  ctx.save();
  ctx.beginPath(); ctx.arc(AV_CX, AV_CY, AV_R, 0, Math.PI * 2); ctx.clip();
  try {
    const img = await loadAvatarImg(avatarUrl, 1024);
    if (!img) throw new Error('avatar image unavailable');
    ctx.drawImage(img, AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
  } catch {
    const fallback = ctx.createLinearGradient(AV_CX - AV_R, AV_CY - AV_R, AV_CX + AV_R, AV_CY + AV_R);
    fallback.addColorStop(0, '#A855F7'); fallback.addColorStop(1, '#7C3AED');
    ctx.fillStyle = fallback;
    ctx.fillRect(AV_CX - AV_R, AV_CY - AV_R, AV_R * 2, AV_R * 2);
  }
  ctx.restore();

  // ─── Name ─────────────────────────────────────────────────────────────────
  const PILL_Y = AV_CY + AV_R + 28;
  ctx.font = `bold 30px ${FONT}`;
  const nameW = ctx.measureText(username).width;

  if (darkMode) {
    // Nome com sombra (sem pílula)
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
    ctx.fillText(username, W / 2, PILL_Y + 20);
    ctx.shadowBlur = 0;
  } else {
    const pillW = Math.min(Math.max(nameW + 72, 220), W - PAD * 2), pillH = 58;
    const pillX = W / 2 - pillW / 2;
    ctx.fillStyle = '#E5E5E5';
    roundRect(ctx, pillX, PILL_Y, pillW, pillH, pillH / 2); ctx.fill();
    ctx.fillStyle = '#1A1A1A'; ctx.textAlign = 'center';
    ctx.fillText(username, W / 2, PILL_Y + 38);
  }

  // ─── Stat rows ───────────────────────────────────────────────────────────
  const ROW_H   = 145;
  const ROW_GAP = 22;
  const ROW_Y0  = PILL_Y + (darkMode ? 86 : 92);
  const ICON_R  = 52;

  // Load custom emoji icons
  let imgCoins, imgBank, imgItems;
  try { imgCoins = await loadImage(join(_ecoDir, 'icon_coins.webp')); } catch { imgCoins = null; }
  try { imgBank  = await loadImage(join(_ecoDir, 'icon_bank.png'));   } catch { imgBank  = null; }
  try { imgItems = await loadImage(join(_ecoDir, 'icon_items.png'));  } catch { imgItems = null; }

  const rows = [
    { iconImg: imgCoins, label: 'Carteira', value: fmtDouble(balance)        },
    { iconImg: imgBank,  label: 'Banco',    value: fmtDouble(bank)           },
    { iconImg: imgItems, label: 'Total',    value: fmtDouble(balance + bank) },
  ];

  // Effective pill color — used to decide text contrast
  const effectivePill = cardPanelColor ?? (darkMode ? 'rgba(0,0,0,0.40)' : '#EBEBEB');
  const pillIsDark    = isDark(cardPanelColor) || (!cardPanelColor && darkMode);
  const labelColor    = pillIsDark ? '#FFFFFF' : '#1A1A1A';
  const valueColor    = pillIsDark ? 'rgba(255,255,255,0.75)' : '#555555';

  for (let i = 0; i < rows.length; i++) {
    const { iconImg, label, value } = rows[i];
    const ry = ROW_Y0 + i * (ROW_H + ROW_GAP);
    const rw = W - PAD * 2;

    // Row pill
    ctx.fillStyle = effectivePill;
    roundRect(ctx, PAD, ry, rw, ROW_H, ROW_H / 2); ctx.fill();

    // Black icon circle
    const circleCx = PAD + ICON_R + 18;
    const circleCy = ry + ROW_H / 2;

    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.arc(circleCx, circleCy, ICON_R, 0, Math.PI * 2); ctx.fill();

    // Draw custom emoji image inside circle
    if (iconImg) {
       const imgSize = ICON_R * 1.35;
      ctx.drawImage(iconImg, circleCx - imgSize / 2, circleCy - imgSize / 2, imgSize, imgSize);
    }

    const textX = circleCx + ICON_R + 24;

    ctx.fillStyle = labelColor; ctx.font = `bold 28px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillText(label, textX, ry + 54);

    ctx.fillStyle = valueColor; ctx.font = `23px ${FONT}`;
    ctx.fillText(value, textX, ry + 96);
  }

  return canvas.toBuffer('image/png');
}

// ─── Top leaderboard card (redesign — no emoji in canvas) ─────────────────────

function drawRankBadge(ctx, cx, cy, rank) {
  let bgColor, textColor;
  if (rank === 1)      { bgColor = '#F5C518'; textColor = '#3A2000'; }
  else if (rank === 2) { bgColor = '#C0C0C0'; textColor = '#1A1A1A'; }
  else if (rank === 3) { bgColor = '#CD7F32'; textColor = '#1A0800'; }
  else                 { bgColor = '#4B1D8A'; textColor = '#DDD0FF'; }

  // Badge circle
  ctx.fillStyle = bgColor;
  ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();

  // Inner ring for top 3
  if (rank <= 3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2); ctx.stroke();
  }

  ctx.fillStyle   = textColor;
  ctx.font        = `bold 14px ${FONT}`;
  ctx.textAlign   = 'center';
  ctx.fillText(String(rank), cx, cy + 5);
}

function drawCoinAmount(ctx, x, cy, amount) {
  const cr   = 10;
  const coinX = x - cr;          // coin centre — flush to right edge
  const textX = coinX - cr - 6;  // text right-aligned just to the left of coin

  // Amount text (drawn first, right-aligned)
  ctx.fillStyle   = '#C084FC';
  ctx.font        = `bold 15px ${FONT}`;
  ctx.textAlign   = 'right';
  ctx.fillText(fmt(amount), textX, cy + 5);

  // Coin circle — to the RIGHT of the text
  ctx.fillStyle = '#F5C518';
  ctx.beginPath(); ctx.arc(coinX, cy, cr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3A2000'; ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText("$", coinX, cy + 3);
}

function drawCoinIcon(ctx, cx, cy, r) {
  const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
  grad.addColorStop(0, '#FFE9A0');
  grad.addColorStop(0.55, '#F5C518');
  grad.addColorStop(1, '#C48F0A');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#5C3A00';
  ctx.font = `bold ${Math.round(r * 1.05)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText("$", cx, cy + r * 0.36);
}

function drawCrown(ctx, cx, cy, w) {
  const h = w * 0.62;
  const top = cy - h / 2, bot = cy + h / 2;
  const l = cx - w / 2, r = cx + w / 2;
  const grad = ctx.createLinearGradient(l, top, r, bot);
  grad.addColorStop(0, '#FFEDA8');
  grad.addColorStop(0.5, '#F5C518');
  grad.addColorStop(1, '#D4A017');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(l, bot);
  ctx.lineTo(l, top + h * 0.42);
  ctx.lineTo(l + w * 0.22, top + h * 0.72);
  ctx.lineTo(cx, top);
  ctx.lineTo(r - w * 0.22, top + h * 0.72);
  ctx.lineTo(r, top + h * 0.42);
  ctx.lineTo(r, bot);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(l, bot - h * 0.16, w, h * 0.16);
  // Little gems
  ctx.fillStyle = '#B91C1C';
  ctx.beginPath(); ctx.arc(cx, top + h * 0.5, w * 0.05, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1D4ED8';
  ctx.beginPath(); ctx.arc(l + w * 0.2, top + h * 0.62, w * 0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(r - w * 0.2, top + h * 0.62, w * 0.04, 0, Math.PI * 2); ctx.fill();
}

async function loadAvatarImg(url, requestedSize = 256) {
  try {
    if (!url) return null;

    // discord.js already returns `?size=256`; setSearchParams avoids creating
    // an invalid `...?size=256?size=256` URL when a caller passes it through.
    const avatarUrl = new URL(url);
    avatarUrl.searchParams.set('size', String(requestedSize));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(avatarUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*;q=0.8',
        'User-Agent': 'SavageBot/2.0',
      },
    });
    try {
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.toLowerCase().startsWith('image/')) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) return null;
      return await loadImage(bytes);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}

function drawAvatarFallback(ctx, x, y, size, username) {
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#A855F7');
  grad.addColorStop(1, '#6B21A8');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${Math.round(size * 0.42)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText((username?.[0] ?? '?').toUpperCase(), x + size / 2, y + size / 2 + size * 0.15);
}

const MEDALS = {
  1: { label: 'OURO',    accent: '#F5C518', accentSoft: 'rgba(245,197,24,0.16)', text: '#3A2000' },
  2: { label: 'PRATA',   accent: '#C7CDD8', accentSoft: 'rgba(199,205,216,0.14)', text: '#1A1A1A' },
  3: { label: 'BRONZE',  accent: '#CD7F32', accentSoft: 'rgba(205,127,50,0.16)', text: '#1A0800' },
};

function truncateText(ctx, text, maxW) {
  let t = text;
  while (ctx.measureText(t).width > maxW && t.length > 1) t = t.slice(0, -1);
  if (t !== text) t = t.slice(0, -1) + '…';
  return t;
}

async function drawPodiumCard(ctx, x, y, w, h, entry, rank, avatarImg) {
  const medal = MEDALS[rank];

  // Card panel
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, rank === 1 ? 'rgba(245,197,24,0.10)' : medal.accentSoft);
  grad.addColorStop(1, 'rgba(20,17,42,0.35)');
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 18); ctx.fill();
  ctx.strokeStyle = medal.accent;
  ctx.lineWidth = rank === 1 ? 2.4 : 1.6;
  roundRect(ctx, x, y, w, h, 18); ctx.stroke();

  const cx = x + w / 2;

  // Crown above #1
  if (rank === 1) drawCrown(ctx, cx, y - 20, 34);

  // Rank pill
  const pillY = y + 14;
  ctx.fillStyle = medal.accent;
  roundRect(ctx, cx - 30, pillY, 60, 24, 12); ctx.fill();
  ctx.fillStyle = medal.text;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`#${rank} · ${medal.label}`, cx, pillY + 16);

  // Avatar
  const avR = rank === 1 ? 44 : 36;
  const avCy = pillY + 24 + avR + 14;
  ctx.strokeStyle = medal.accent; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, avCy, avR + 4, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, avCy, avR, 0, Math.PI * 2); ctx.clip();
  if (avatarImg) ctx.drawImage(avatarImg, cx - avR, avCy - avR, avR * 2, avR * 2);
  else drawAvatarFallback(ctx, cx - avR, avCy - avR, avR * 2, entry.username);
  ctx.restore();

  // Username
  const nameY = avCy + avR + 26;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(truncateText(ctx, entry.username, w - 24), cx, nameY);

  // Subtitle
  ctx.fillStyle = '#9C8FCB';
  ctx.font = `11px ${FONT}`;
  ctx.fillText('Patrimônio total', cx, nameY + 18);

  // Amount
  ctx.fillStyle = medal.accent;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(fmt(entry.total), cx, nameY + 42);
  drawCoinIcon(ctx, cx + ctx.measureText(fmt(entry.total)).width / 2 + 14, nameY + 37, 9);
}

function drawListRow(ctx, y, w, entry, rank, avatarImg) {
  const PAD = 24;
  const ROW_H = 66;
  const isThird = rank % 2 === 0;

  ctx.fillStyle = isThird ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)';
  roundRect(ctx, PAD, y, w - PAD * 2, ROW_H - 10, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  roundRect(ctx, PAD, y, w - PAD * 2, ROW_H - 10, 14); ctx.stroke();

  const cy = y + (ROW_H - 10) / 2;

  // Rank badge
  drawRankBadge(ctx, PAD + 30, cy, rank);

  // Avatar
  const avR = 20, avCx = PAD + 78;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(avCx, cy, avR + 2, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(avCx, cy, avR, 0, Math.PI * 2); ctx.clip();
  if (avatarImg) ctx.drawImage(avatarImg, avCx - avR, cy - avR, avR * 2, avR * 2);
  else drawAvatarFallback(ctx, avCx - avR, cy - avR, avR * 2, entry.username);
  ctx.restore();

  // Username + subtitle
  const textX = avCx + avR + 18;
  const maxNameW = w - PAD - 190 - textX;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(truncateText(ctx, entry.username, maxNameW), textX, cy - 3);
  ctx.fillStyle = '#8A7EB0';
  ctx.font = `11px ${FONT}`;
  ctx.fillText('Patrimônio total', textX, cy + 14);

  // Amount
  drawCoinAmount(ctx, w - PAD - 8, cy, entry.total);
}

function drawRankingMedal(ctx, x, y, rank, size) {
  const styles = {
    1: { fill: '#FFE033', edge: '#FFF4A3', text: '#6A4A00' },
    2: { fill: '#D6DCE5', edge: '#FFFFFF', text: '#35404D' },
    3: { fill: '#E28A2C', edge: '#FFC36B', text: '#5B2500' },
  };
  const style = styles[rank] ?? { fill: '#208FEA', edge: '#65C5FF', text: '#FFFFFF' };
  const cx = x + size / 2;
  const cy = y + size / 2;

  ctx.fillStyle = style.fill;
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = style.edge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

  if (rank <= 3) {
    ctx.fillStyle = rank === 1 ? '#F5B900' : rank === 2 ? '#AEB7C4' : '#BE5D1B';
    ctx.beginPath();
    ctx.moveTo(cx - 10, y + size - 2);
    ctx.lineTo(cx - 6, y + size + 10);
    ctx.lineTo(cx, y + size + 4);
    ctx.lineTo(cx + 6, y + size + 10);
    ctx.lineTo(cx + 10, y + size - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = style.edge;
    ctx.stroke();

    ctx.fillStyle = style.fill;
    ctx.beginPath();
    ctx.arc(cx, y + 24, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = style.edge;
    ctx.stroke();
  }

  ctx.fillStyle = style.text;
  ctx.font = `bold ${rank <= 3 ? 22 : 30}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), cx, rank <= 3 ? y + 24 : cy);
  ctx.textBaseline = 'alphabetic';
}

function drawRankingRow(ctx, x, y, w, entry, rank, avatarImg, options = {}) {
  const ROW_H = 67;
  const medalW = 52;
  const avatarR = 25;
  const avatarCx = x + medalW + 48;
  const centerY = y + ROW_H / 2;
  const isEliteMedal = options.elite && rank <= 3;

  ctx.fillStyle = 'rgba(222, 232, 242, 0.66)';
  roundRect(ctx, x, y, w, ROW_H - 4, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, ROW_H - 4, 7);
  ctx.stroke();

  drawRankingMedal(ctx, x, y, rank, medalW);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCx, centerY, avatarR, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avatarCx - avatarR, centerY - avatarR, avatarR * 2, avatarR * 2);
  } else {
    drawAvatarFallback(ctx, avatarCx - avatarR, centerY - avatarR, avatarR * 2, entry.username);
  }
  ctx.restore();
  ctx.strokeStyle = isEliteMedal ? 'rgba(255,238,155,0.9)' : 'rgba(255,255,255,0.78)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(avatarCx, centerY, avatarR + 1, 0, Math.PI * 2);
  ctx.stroke();

  const textX = avatarCx + avatarR + 18;
  const amount = options.value ?? entry.total ?? 0;
  const amountText = fmtCompactTop(amount);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#F8FBFF';
  ctx.font = `400 24px ${FONT}`;
  ctx.fillText(truncateText(ctx, entry.username, w - 300), textX, centerY + 8);

  const amountX = x + w - 22;
  ctx.textAlign = 'right';
  ctx.fillStyle = options.elite && rank === 1 ? '#FFD21A' : options.elite && rank === 3 ? '#F4A11B' : '#FFFFFF';
  ctx.font = `bold 25px ${FONT}`;
  ctx.fillText(amountText, amountX, centerY - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('Coins', amountX, centerY + 18);
  ctx.textAlign = 'left';
}

function fmtCompactTop(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace('.0', '')}K`;
  return amount.toLocaleString('pt-BR');
}

async function loadRankingBackground() {
  try {
    return await loadImage(readFileSync(_rankingBackgroundPath));
  } catch {
    return null;
  }
}

function drawRankingBackground(ctx, image, width, height) {
  if (image) {
    const scale = Math.max(width / image.width, height / image.height);
    const sw = image.width * scale;
    const sh = image.height * scale;
    ctx.drawImage(image, (width - sw) / 2, (height - sh) / 2, sw, sh);
  } else {
    ctx.fillStyle = '#0A2E56';
    ctx.fillRect(0, 0, width, height);
  }

  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(2, 22, 51, 0.62)');
  shade.addColorStop(0.42, 'rgba(1, 24, 56, 0.38)');
  shade.addColorStop(1, 'rgba(1, 13, 38, 0.62)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
}

export async function generateTopCard({ eliteEntries = [], coinEntries = [] } = {}) {
  const W = 1024;
  const H = 682;
  const PAD = 58;
  const GAP = 42;
  const HEADER_H = 130;
  const ROW_H = 67;
  const ROW_GAP = 11;
  const COL_W = (W - PAD * 2 - GAP) / 2;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const elite = eliteEntries.slice(0, 6);
  const coins = coinEntries.slice(0, 6);
  const allEntries = [...elite, ...coins];
  const avatars = await Promise.all(
    allEntries.map(entry => entry.avatarUrl ? loadAvatarImg(entry.avatarUrl) : Promise.resolve(null)),
  );
  const avatarFor = offset => avatars[offset];
  const background = await loadRankingBackground();

  drawRankingBackground(ctx, background, W, H);

  // Header labels mirroring the reference composition.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold 48px ${FONT}`;
  ctx.fillText('Top Elite', W * 0.25, 89);
  ctx.fillText('Top Coins', W * 0.75, 89);
  drawCoinIcon(ctx, W * 0.25 + 188, 68, 20);
  drawCoinIcon(ctx, W * 0.75 + 164, 68, 20);

  const leftX = PAD;
  const rightX = PAD + COL_W + GAP;
  const firstRowY = HEADER_H;
  elite.forEach((entry, index) => {
    drawRankingRow(ctx, leftX, firstRowY + index * (ROW_H + ROW_GAP), COL_W, entry, index + 1, avatarFor(index), {
      elite: true,
      value: entry.eliteTotal ?? entry.total ?? 0,
    });
  });
  coins.forEach((entry, index) => {
    drawRankingRow(ctx, rightX, firstRowY + index * (ROW_H + ROW_GAP), COL_W, entry, index + 1, avatarFor(elite.length + index), {
      value: entry.coins ?? entry.total ?? 0,
    });
  });

  return canvas.toBuffer('image/png');
}

// ─── Coinflip card (cute) ─────────────────────────────────────────────────────

export function generateCoinflipCard({ side, resultado, won, bet, userBalance }) {
  const W = 700, H = 380;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawCuteBg(ctx, W, H, won ? ['#3B1F6A', '#6A2D9A', '#9B4FD6'] : ['#2A2A4A', '#3A3A6A', '#5A5A8A']);

  // Sparkle decorations
  const sparkles = won
    ? [[80,60],[620,50],[100,310],[600,300],[350,40],[180,320]]
    : [[80,60],[620,50],[100,310],[600,300]];
  for (const [sx, sy] of sparkles) drawSparkle(ctx, sx, sy, 12, won ? 'rgba(255,210,80,0.4)' : 'rgba(180,180,220,0.25)');

  drawCuteHeader(ctx, W, '🪙   C O I N F L I P   🪙', won ? '#FFE0A0' : '#C0C8FF', won ? '#4A2A00' : '#1E1E3A');

  // Coin
  const cx = W / 2, cy = 195, cr = 95;

  // Glow ring
  const glowGrad = ctx.createRadialGradient(cx, cy, cr * 0.3, cx, cy, cr * 1.6);
  glowGrad.addColorStop(0, won ? 'rgba(255,200,50,0.45)' : 'rgba(120,120,180,0.25)');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(cx, cy, cr * 1.6, 0, Math.PI * 2); ctx.fill();

  // Coin gradient
  const coinGrad = ctx.createRadialGradient(cx - 25, cy - 25, 8, cx, cy, cr);
  if (won) {
    coinGrad.addColorStop(0, '#FFF0A0');
    coinGrad.addColorStop(0.4, '#F5C518');
    coinGrad.addColorStop(0.8, '#D4A017');
    coinGrad.addColorStop(1, '#8A6000');
  } else {
    coinGrad.addColorStop(0, '#D0D0E8');
    coinGrad.addColorStop(0.5, '#9090B8');
    coinGrad.addColorStop(1, '#505070');
  }
  ctx.fillStyle = coinGrad;
  ctx.shadowColor = won ? 'rgba(255,193,7,0.6)' : 'rgba(80,80,120,0.4)';
  ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Coin rim
  ctx.strokeStyle = won ? 'rgba(255,230,100,0.8)' : 'rgba(160,160,200,0.6)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = won ? 'rgba(255,255,200,0.3)' : 'rgba(200,200,230,0.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, cr - 14, 0, Math.PI * 2); ctx.stroke();

  // Coin text
  ctx.fillStyle = won ? '#4A3000' : '#B0B0D0';
  ctx.font = `bold 24px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(resultado === 'cara' ? 'CARA' : 'COROA', cx, cy + 9);

  // Result pill
  const resText = won ? '✨  ACERTOU!' : '❌  ERROU';
  const rFrom = won ? '#1A7A3A' : '#7A2020';
  const rTo   = won ? '#2ECC70' : '#CC3030';
  drawResultBanner(ctx, W, 315, resText, rFrom, rTo, '#FFFFFF');

  drawFooterStats(ctx, W, H,
    `${won ? '+' : '-'}${fmt(bet)} 💰  •  Saldo: ${fmt(userBalance)} 💰`,
    `Aposta: ${fmt(bet)} 💰`
  );

  return canvas.toBuffer('image/png');
}

// ─── Dice card (cute) ─────────────────────────────────────────────────────────

const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
};

function drawDie(ctx, x, y, size, value, highlight = false) {
  const r = 18;

  ctx.shadowColor = 'rgba(80,0,120,0.4)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;

  const dieGrad = ctx.createLinearGradient(x, y, x + size, y + size);
  if (highlight) {
    dieGrad.addColorStop(0, '#F0E8FF');
    dieGrad.addColorStop(1, '#DDD0F8');
  } else {
    dieGrad.addColorStop(0, '#FFFFFF');
    dieGrad.addColorStop(1, '#F0F0F8');
  }
  ctx.fillStyle = dieGrad;
  roundRect(ctx, x, y, size, size, r); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  ctx.strokeStyle = highlight ? '#9B4FD6' : 'rgba(160,130,210,0.5)'; ctx.lineWidth = 2.5;
  roundRect(ctx, x, y, size, size, r); ctx.stroke();

  ctx.fillStyle = highlight ? '#7A1DB8' : '#5A4A8A';
  (PIPS[value] || []).forEach(([px, py]) => {
    const dot = size * 0.11;
    ctx.beginPath(); ctx.arc(x + px * size, y + py * size, dot, 0, Math.PI * 2); ctx.fill();
  });
}

export function generateDiceCard({ playerDie, botDie, won, tie, bet, payout, userBalance }) {
  const W = 700, H = 390;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawCuteBg(ctx, W, H, won ? ['#1E3A5A', '#2E5C8A', '#4A7EB8'] : tie ? ['#2A3A1A', '#3A5A2A', '#5A7A3A'] : ['#3A1E2A', '#5A2E3A', '#7A4A5A']);

  for (const [sx, sy] of [[60,50],[620,60],[80,320],[600,310],[350,50]]) {
    drawSparkle(ctx, sx, sy, 11, 'rgba(255,255,255,0.2)');
  }

  const accent = won ? '#B0E0FF' : tie ? '#C0FFB0' : '#FFB0C0';
  drawCuteHeader(ctx, W, '🎲  J O G O  D E  D A D O S  🎲', accent, won ? '#0A2040' : tie ? '#0A2A0A' : '#2A0A14');

  // Player/Bot labels
  ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('✦ VOCÊ ✦', W / 2 - 125, 102);
  ctx.fillText('✦ BOT ✦', W / 2 + 125, 102);

  const dSize = 130, dY = 120;
  drawDie(ctx, W / 2 - 190, dY, dSize, playerDie, won || tie);
  drawDie(ctx, W / 2 + 60,  dY, dSize, botDie,    false);

  // VS badge
  const vsBg = ctx.createRadialGradient(W/2, dY + dSize/2, 5, W/2, dY + dSize/2, 28);
  vsBg.addColorStop(0, 'rgba(255,220,80,0.9)');
  vsBg.addColorStop(1, 'rgba(200,140,20,0.85)');
  ctx.fillStyle = vsBg;
  ctx.beginPath(); ctx.arc(W/2, dY + dSize/2, 26, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3A2000'; ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText('VS', W/2, dY + dSize/2 + 5);

  const resText = won ? '🎉  VOCÊ GANHOU!' : tie ? '🤝  EMPATE!' : '🤖  BOT GANHOU';
  const rFrom   = won ? '#1A6A2A' : tie ? '#1A4A8A' : '#8A1A2A';
  const rTo     = won ? '#2ECC70' : tie ? '#3A80F0' : '#D63060';
  drawResultBanner(ctx, W, 280, resText, rFrom, rTo, '#FFFFFF');

  const change = tie ? 0 : won ? payout - bet : bet;
  const sign   = won ? '+' : tie ? '±' : '-';
  drawFooterStats(ctx, W, H,
    `${sign}${fmt(change)} 💰  •  Saldo: ${fmt(userBalance)} 💰`,
    `Aposta: ${fmt(bet)} 💰`
  );

  return canvas.toBuffer('image/png');
}

// ─── Slots card (cute kawaii) ─────────────────────────────────────────────────

export function generateSlotsCard({ reels, won, betAmount, changeAmount, userBalance, multiplier }) {
  const W = 700, H = 400;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  drawCuteBg(ctx, W, H, won ? ['#3A1054', '#6A1E8A', '#9B2FD6'] : ['#1A1A3A', '#2A2050', '#3A2870']);

  for (const [sx, sy] of [[50,45],[640,55],[80,340],[600,330],[350,40],[200,360]]) {
    drawSparkle(ctx, sx, sy, 12, won ? 'rgba(255,200,80,0.45)' : 'rgba(180,160,255,0.25)');
  }

  drawCuteHeader(ctx, W, '🌸  C A Ç A - N Í Q U E L  🌸', won ? '#FFE0A0' : '#C0B0FF', won ? '#3A0A5A' : '#0A0A2A');

  // Machine body — soft rounded
  const machBg = ctx.createLinearGradient(20, 58, 20, 58 + 200);
  machBg.addColorStop(0, 'rgba(255,255,255,0.10)');
  machBg.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = machBg;
  roundRect(ctx, 20, 58, W - 40, 200, 18); ctx.fill();
  ctx.strokeStyle = won ? 'rgba(255,200,80,0.5)' : 'rgba(180,150,255,0.3)'; ctx.lineWidth = 2;
  roundRect(ctx, 20, 58, W - 40, 200, 18); ctx.stroke();

  // Center win line
  ctx.strokeStyle = won ? 'rgba(255,210,60,0.6)' : 'rgba(150,130,210,0.2)'; ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath(); ctx.moveTo(36, 162); ctx.lineTo(W - 36, 162); ctx.stroke();
  ctx.setLineDash([]);

  // Reel boxes
  const reelW = 140, reelH = 148, gap = (W - 40 - 3 * reelW) / 4;
  const allMatch = reels.every(s => s === reels[0]);

  reels.forEach((sym, i) => {
    const rx = 20 + gap + i * (reelW + gap);
    const ry = 80;

    const reelGrad = ctx.createLinearGradient(rx, ry, rx, ry + reelH);
    if (allMatch) {
      reelGrad.addColorStop(0, 'rgba(255,230,80,0.25)');
      reelGrad.addColorStop(1, 'rgba(255,180,20,0.15)');
    } else {
      reelGrad.addColorStop(0, 'rgba(255,255,255,0.10)');
      reelGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
    }
    ctx.fillStyle = reelGrad;
    roundRect(ctx, rx, ry, reelW, reelH, 14); ctx.fill();

    ctx.strokeStyle = allMatch ? 'rgba(255,210,60,0.9)' : 'rgba(180,150,255,0.35)';
    ctx.lineWidth = allMatch ? 2.5 : 1.5;
    roundRect(ctx, rx, ry, reelW, reelH, 14); ctx.stroke();

    // Symbol
    ctx.font = `64px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(sym, rx + reelW / 2, ry + reelH / 2 + 22);
  });

  // Multiplier badge
  if (won && multiplier) {
    const mbg = ctx.createLinearGradient(W/2 - 70, 270, W/2 + 70, 298);
    mbg.addColorStop(0, '#F5C518');
    mbg.addColorStop(1, '#E0A010');
    ctx.fillStyle = mbg;
    roundRect(ctx, W/2 - 70, 270, 140, 30, 15); ctx.fill();
    ctx.fillStyle = '#3A2000';
    ctx.font = `bold 14px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText(`✨ ${multiplier}× MULTIPLICADOR ✨`, W/2, 290);
  }

  const resText = won ? `🎉  +${fmt(changeAmount)} 💰` : `💔  -${fmt(changeAmount)} 💰`;
  ctx.fillStyle = won ? '#88FFB8' : '#FFB0B8';
  ctx.font      = `bold 24px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(resText, W/2, 330);

  drawFooterStats(ctx, W, H,
    `Saldo: ${fmt(userBalance)} 💰`,
    `Aposta: ${fmt(betAmount)} 💰`
  );

  return canvas.toBuffer('image/png');
}

// ─── Roulette card (cute) ─────────────────────────────────────────────────────

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export function generateRouletteCard({ spin, escolha, won, bet, winAmt, userBalance, mult }) {
  const W = 700, H = 400;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  const isRed   = RED_NUMS.has(spin);
  const isGreen = spin === 0;

  const bgColors = isGreen
    ? ['#0A3A1A', '#1A5A2A', '#2A7A3A']
    : isRed
    ? ['#3A0A1A', '#6A1A2A', '#9A2A3A']
    : ['#1A1A3A', '#2A2A5A', '#3A3A7A'];

  drawCuteBg(ctx, W, H, bgColors);

  for (const [sx, sy] of [[60,50],[620,60],[80,330],[600,320],[350,50]]) {
    drawSparkle(ctx, sx, sy, 11, 'rgba(255,255,255,0.2)');
  }

  drawCuteHeader(ctx, W, '🎡  R O L E T A  🎡', '#FFE0FF', '#2A0A3A');

  // Wheel
  const wx = W / 2, wy = 185, wr = 110;

  const outerRing = ctx.createRadialGradient(wx - 30, wy - 30, 20, wx, wy, wr + 10);
  outerRing.addColorStop(0, 'rgba(255,200,255,0.25)');
  outerRing.addColorStop(1, 'rgba(180,100,220,0.15)');
  ctx.fillStyle = outerRing;
  ctx.beginPath(); ctx.arc(wx, wy, wr + 18, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = 'rgba(200,150,255,0.7)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(wx, wy, wr + 10, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(200,150,255,0.3)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(wx, wy, wr + 2, 0, Math.PI * 2); ctx.stroke();

  // Inner disc
  const spinCol = isGreen ? '#1E8A3A' : isRed ? '#CC1A3A' : '#2A2A5A';
  const discGrad = ctx.createRadialGradient(wx - 25, wy - 25, 15, wx, wy, wr);
  discGrad.addColorStop(0, isGreen ? '#3ACC6A' : isRed ? '#F03060' : '#4A4A9A');
  discGrad.addColorStop(1, spinCol);
  ctx.fillStyle = discGrad;
  ctx.shadowColor = spinCol; ctx.shadowBlur = 35;
  ctx.beginPath(); ctx.arc(wx, wy, wr - 4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#FFFFFF'; ctx.font = `bold 58px ${FONT}`; ctx.textAlign = 'center';
  ctx.fillText(String(spin), wx, wy + 20);

  const colLabel = isGreen ? '🟢 Verde' : isRed ? '🔴 Vermelho' : '⚫ Preto';
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `14px ${FONT}`;
  ctx.fillText(colLabel, W/2, wy + wr + 22);

  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `13px ${FONT}`;
  ctx.fillText(`Você apostou em: ${escolha.toUpperCase()}`, W/2, wy + wr + 44);

  const resText = won ? `🎉  GANHOU  (×${mult})` : '💔  PERDEU';
  const rFrom   = won ? '#1A7A3A' : '#8A1A2A';
  const rTo     = won ? '#3ACC70' : '#D03050';
  drawResultBanner(ctx, W, 315, resText, rFrom, rTo, '#FFFFFF');

  const change = won ? winAmt - bet : bet;
  const sign   = won ? '+' : '-';
  drawFooterStats(ctx, W, H,
    `${sign}${fmt(change)} 💰  •  Saldo: ${fmt(userBalance)} 💰`,
    `Aposta: ${fmt(bet)} 💰`
  );

  return canvas.toBuffer('image/png');
}

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/cards');
const FALLBACK_ART = 'pokemon-pack-cover.jpg';
const WIDTH = 1200;
const HEIGHT = 620;

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawBar(ctx, x, y, width, value, max, color) {
  roundedRect(ctx, x, y, width, 18, 9);
  ctx.fillStyle = '#111827';
  ctx.fill();
  const fill = Math.max(0, Math.min(1, value / max)) * width;
  if (fill > 0) {
    roundedRect(ctx, x, y, fill, 18, 9);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

async function loadCard(card) {
  const artFile = card.artFile || FALLBACK_ART;
  try {
    return loadImage(await readFile(path.join(CARDS_DIR, artFile)));
  } catch {
    return loadImage(await readFile(path.join(CARDS_DIR, FALLBACK_ART)));
  }
}

function drawSide(ctx, pokemon, image, x, y, accent, sideLabel) {
  const cardWidth = 270;
  const cardHeight = 378;
  const imageX = x + 20;
  const imageY = y + 54;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .45)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, x, y, cardWidth + 40, cardHeight + 100, 24);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, imageX, imageY, cardWidth, cardHeight, 16);
  ctx.clip();
  ctx.drawImage(image, imageX, imageY, cardWidth, cardHeight);
  ctx.restore();

  ctx.fillStyle = accent;
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(sideLabel.toUpperCase(), x + 20, y + 34);
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 21px sans-serif';
  ctx.fillText(pokemon.card.name.slice(0, 24), x + 20, y + cardHeight + 82);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(`CP ${pokemon.cp}  •  ${pokemon.card.element}`, x + 20, y + cardHeight + 105);
  drawBar(ctx, x + 20, y + cardHeight + 118, cardWidth, pokemon.hp, pokemon.maxHp, accent);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '14px sans-serif';
  ctx.fillText(`HP ${Math.max(0, pokemon.hp)}/${pokemon.maxHp}`, x + 20, y + cardHeight + 154);
}

export async function generateBattleBoard(first, second, turnName = '') {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, '#172554');
  gradient.addColorStop(0.47, '#0f172a');
  gradient.addColorStop(0.53, '#1f2937');
  gradient.addColorStop(1, '#450a0a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,.04)';
  for (let x = 0; x < WIDTH; x += 56) ctx.fillRect(x, 0, 2, HEIGHT);
  for (let y = 0; y < HEIGHT; y += 56) ctx.fillRect(0, y, WIDTH, 2);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('CARD BATTLE', 44, 48);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#bfdbfe';
  ctx.fillText('ARENA PVP  •  BATALHA EQUILIBRADA', 44, 74);
  if (turnName) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fde68a';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(`VEZ DE ${turnName.toUpperCase()}`, WIDTH - 44, 58);
    ctx.textAlign = 'left';
  }

  const [firstImage, secondImage] = await Promise.all([loadCard(first), loadCard(second)]);
  drawSide(ctx, first, firstImage, 62, 104, '#60a5fa', 'Treinador 1');
  drawSide(ctx, second, secondImage, WIDTH - 392, 104, '#fb7185', 'Treinador 2');

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 48px sans-serif';
  ctx.fillText('VS', WIDTH / 2, 310);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('ESCOLHA SEU GOLPE', WIDTH / 2, 344);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
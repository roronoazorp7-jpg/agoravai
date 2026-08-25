import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_DEFS } from './cardData.js';
import { generateCardSheet } from './cardVisuals.js';

const ARENA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/cards/battle-arena-bg.jpg');
const HEALTH_BAR_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/cards/battle-health-bar.jpg');
const WIDTH = 1280;
const HEIGHT = 760;

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function fitImage(ctx, image, x, y, width, height, radius = 18) {
  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  // generateCardSheet coloca a carta em (24, 24), no tamanho original
  // de 358x500. Recortamos somente essa carta para preservar a frente
  // exatamente como ela aparece no pack e na Pokédex.
  const sourceX = image.width >= 406 && image.height >= 548 ? 24 : 0;
  const sourceY = sourceX;
  const sourceWidth = image.width >= 406 && image.height >= 548 ? 358 : image.width;
  const sourceHeight = image.width >= 406 && image.height >= 548 ? 500 : image.height;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  ctx.restore();
}

function healthBar(ctx, texture, x, y, width, value, max) {
  const height = 34;
  const ratio = Math.max(0, Math.min(1, value / Math.max(1, max)));

  // Usa a moldura dourada da referência e redesenha somente o interior,
  // permitindo que a quantidade vermelha acompanhe o HP real da batalha.
  ctx.drawImage(texture, 0, 38, texture.width, 112, x, y, width, height);
  ctx.save();
  roundedRect(ctx, x + 23, y + 8, width - 46, height - 16, 9);
  ctx.clip();
  const empty = ctx.createLinearGradient(x, y, x, y + height);
  empty.addColorStop(0, '#4b5563');
  empty.addColorStop(0.5, '#1f2937');
  empty.addColorStop(1, '#111827');
  ctx.fillStyle = empty;
  ctx.fillRect(x + 18, y + 5, width - 36, height - 10);
  if (ratio > 0) {
    const fill = ctx.createLinearGradient(x, y, x, y + height);
    fill.addColorStop(0, '#ff6b4a');
    fill.addColorStop(0.45, '#ef2f16');
    fill.addColorStop(1, '#a30f08');
    ctx.fillStyle = fill;
    ctx.fillRect(x + 18, y + 5, (width - 36) * ratio, height - 10);
    ctx.fillStyle = 'rgba(255, 255, 255, .24)';
    ctx.fillRect(x + 18, y + 7, (width - 36) * ratio, 3);
  }
  ctx.restore();
}

async function loadCard(card) {
  const source = card.card || card;
  const canonical = CARD_DEFS.find(entry => entry.key === source.key);
  const sourceCard = canonical || source;
  return loadImage(await generateCardSheet([sourceCard]));
}

function drawCard(ctx, pokemon, image, x, y, accent, label, flipped = false, healthBarImage) {
  const width = 330;
  const height = 462;
  const frameX = x - 14;
  const frameY = y - 14;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, .6)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 14;
  roundedRect(ctx, frameX, frameY, width + 28, height + 28, 25);
  ctx.fillStyle = '#0b1220';
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  roundedRect(ctx, frameX, frameY, width + 28, height + 28, 25);
  ctx.stroke();
  ctx.restore();

  fitImage(ctx, image, x, y, width, height, 16);

  ctx.fillStyle = accent;
  ctx.font = '900 18px sans-serif';
  ctx.fillText(label.toUpperCase(), x, y - 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 23px sans-serif';
  ctx.fillText(pokemon.card.name.slice(0, 24), x, y + height + 38);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${pokemon.card.element}  •  CP ${pokemon.cp}`, x, y + height + 64);
  healthBar(ctx, healthBarImage, x, y + height + 72, width, pokemon.hp, pokemon.maxHp);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '14px sans-serif';
  ctx.fillText(`Energia ${pokemon.energy}/100`, x + 195, y + height + 118);
}

export async function generateBattleBoard(first, second, turnName = '') {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const [arenaImage, healthBarImage, firstImage, secondImage] = await Promise.all([
    loadImage(await readFile(ARENA_FILE)),
    loadImage(await readFile(HEALTH_BAR_FILE)),
    loadCard(first),
    loadCard(second),
  ]);
  const scale = Math.max(WIDTH / arenaImage.width, HEIGHT / arenaImage.height);
  const arenaWidth = arenaImage.width * scale;
  const arenaHeight = arenaImage.height * scale;
  ctx.drawImage(
    arenaImage,
    (WIDTH - arenaWidth) / 2,
    (HEIGHT - arenaHeight) / 2,
    arenaWidth,
    arenaHeight,
  );
  ctx.fillStyle = 'rgba(5, 15, 35, .28)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let x = 0; x < WIDTH; x += 52) ctx.fillRect(x, 0, 2, HEIGHT);
  for (let y = 0; y < HEIGHT; y += 52) ctx.fillRect(0, y, WIDTH, 2);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 28px sans-serif';
  ctx.fillText('POKÉMON CARD BATTLE', 38, 42);
  ctx.fillStyle = '#bfdbfe';
  ctx.font = '14px sans-serif';
  ctx.fillText('ARENA PVP  •  ESCOLHA O GOLPE DA CARTA ATIVA', 40, 66);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fde68a';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(turnName ? `VEZ DE ${turnName.toUpperCase()}` : 'BATALHA ATIVA', WIDTH - 40, 49);
  ctx.textAlign = 'left';

  drawCard(ctx, first, firstImage, 74, 128, '#38bdf8', 'Treinador 1', false, healthBarImage);
  drawCard(ctx, second, secondImage, WIDTH - 404, 128, '#fb7185', 'Treinador 2', false, healthBarImage);

  const centerX = WIDTH / 2;
  const centerY = 360;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 98, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 6, 23, .72)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#64748b';
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.font = '900 42px sans-serif';
  ctx.fillText('VS', centerX, centerY + 13);
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('CARD ARENA', centerX, centerY + 42);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}
import { createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { rarityData } from './cardData.js';

const CARD_W = 360;
const CARD_H = 500;

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawCard(ctx, card, image, x, y, scale = 1) {
  const rarity = rarityData(card.rarity);
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  ctx.save();
  ctx.translate(x, y);

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, '#15152a');
  gradient.addColorStop(0.55, '#252047');
  gradient.addColorStop(1, rarity.color);
  ctx.fillStyle = gradient;
  roundRect(ctx, 0, 0, w, h, 24 * scale);
  ctx.fill();
  ctx.strokeStyle = rarity.color;
  ctx.lineWidth = 5 * scale;
  ctx.stroke();

  const artX = 18 * scale;
  const artY = 52 * scale;
  const artW = w - 36 * scale;
  const artH = 225 * scale;
  ctx.save();
  roundRect(ctx, artX, artY, artW, artH, 18 * scale);
  ctx.clip();
  const imageRatio = image.width / image.height;
  const boxRatio = artW / artH;
  let drawW = artW;
  let drawH = artH;
  let drawX = artX;
  let drawY = artY;
  if (imageRatio > boxRatio) {
    drawW = artH * imageRatio;
    drawX = artX - (drawW - artW) / 2;
  } else {
    drawH = artW / imageRatio;
    drawY = artY - (drawH - artH) / 2;
  }
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  const artShade = ctx.createLinearGradient(0, artY, 0, artY + artH);
  artShade.addColorStop(0, 'rgba(8, 8, 20, 0.05)');
  artShade.addColorStop(1, 'rgba(8, 8, 20, 0.72)');
  ctx.fillStyle = artShade;
  ctx.fillRect(artX, artY, artW, artH);
  ctx.restore();

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * scale;
  for (let i = -2; i < 9; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * 70 * scale, 150 * scale);
    ctx.lineTo((i + 4) * 70 * scale, 0);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${20 * scale}px Arial`;
  ctx.fillText(rarity.label.toUpperCase(), 22 * scale, 34 * scale);
  ctx.textAlign = 'right';
  ctx.font = `bold ${18 * scale}px Arial`;
  ctx.fillText(card.element, w - 22 * scale, 34 * scale);
  ctx.textAlign = 'center';

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${20 * scale}px Arial`;
  ctx.fillText(card.name, w / 2, 320 * scale);
  ctx.fillStyle = '#d9d4f0';
  ctx.font = `${14 * scale}px Arial`;
  const words = card.description.split(' ');
  let line = '';
  let lineY = 356 * scale;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > w - 44 * scale && line) {
      ctx.fillText(line, w / 2, lineY);
      line = word;
      lineY += 22 * scale;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, w / 2, lineY);

  ctx.fillStyle = '#ffffff';
  ctx.font = `${13 * scale}px Arial`;
  ctx.globalAlpha = 0.72;
  ctx.fillText('ARCANA • COLEÇÃO 01', w / 2, h - 24 * scale);
  ctx.restore();
}

export async function generateCardSheet(cards) {
  const gap = 24;
  const width = cards.length * CARD_W + (cards.length + 1) * gap;
  const height = CARD_H + gap * 2;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#090914');
  background.addColorStop(1, '#20183b');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const images = await Promise.all(cards.map(async card => {
    const file = path.join(process.cwd(), 'src/assets/cards', card.artFile);
    return loadImage(await readFile(file));
  }));
  cards.forEach((card, index) => drawCard(
    ctx,
    card,
    images[index],
    gap + index * (CARD_W + gap),
    gap,
  ));
  return canvas.toBuffer('image/png');
}
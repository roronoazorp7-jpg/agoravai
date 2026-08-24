import { createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadImage } from '@napi-rs/canvas';

const CARD_W = 358;
const CARD_H = 500;
const CARDS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/cards');

function drawCard(ctx, card, image, x, y, scale = 1) {
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();
}

export async function generateCardSheet(cards) {
  const gap = 24;
  const width = cards.length * CARD_W + (cards.length + 1) * gap;
  const height = CARD_H + gap * 2;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#11131a';
  ctx.fillRect(0, 0, width, height);
  const images = await Promise.all(cards.map(async card => {
    const file = path.join(CARDS_DIR, card.artFile);
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
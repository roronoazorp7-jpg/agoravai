import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '../assets/uno/template-green-10.jpg');
const template = loadImage(readFileSync(TEMPLATE_PATH));
const cache = new Map();

const COLORS = Object.freeze({
  red: '#ed1c24',
  yellow: '#ffcc00',
  green: '#1faa59',
  blue: '#1684d8',
  wild: '#202124',
});

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function hexRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function colorizeTemplate(ctx, target) {
  const image = ctx.getImageData(0, 0, 320, 512);
  const pixels = image.data;
  const rgb = hexRgb(target);

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    if (g <= r * 1.12 || g <= b * 1.12 || g < 55) continue;

    const brightness = 0.72 + (g / 255) * 0.28;
    pixels[index] = Math.min(255, Math.round(rgb.r * brightness));
    pixels[index + 1] = Math.min(255, Math.round(rgb.g * brightness));
    pixels[index + 2] = Math.min(255, Math.round(rgb.b * brightness));
  }
  ctx.putImageData(image, 0, 0);
}

function cardSymbol(card) {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'skip') return '⊘';
  if (card.kind === 'reverse') return '↻';
  if (card.kind === 'draw2') return '+2';
  if (card.kind === 'wild4') return '+4';
  return 'W';
}

function drawWildMark(ctx, x, y) {
  const colors = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.blue];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.2);
  const size = 42;
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size, index * Math.PI / 2, (index + 1) * Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();
}

function drawLabel(ctx, text, x, y, size, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.08);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function coverOldLabels(ctx, color) {
  ctx.fillStyle = color;
  roundRect(ctx, 22, 22, 92, 90, 18);
  ctx.fill();
  roundRect(ctx, 197, 404, 100, 86, 18);
  ctx.fill();

  ctx.save();
  ctx.translate(160, 268);
  ctx.rotate(-0.18);
  roundRect(ctx, -102, -104, 204, 205, 48);
  ctx.fill();
  ctx.restore();
}

function drawDiagonalArc(ctx) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-18, 358);
  ctx.bezierCurveTo(46, 488, 234, 470, 338, 270);
  ctx.stroke();
  ctx.restore();
}

export async function generateUnoCard(card) {
  const key = `${card.color}:${card.kind}:${card.value ?? ''}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = createCanvas(320, 512);
  const ctx = canvas.getContext('2d');
  const targetColor = COLORS[card.color] ?? COLORS.wild;

  ctx.drawImage(await template, 0, 0, 320, 512);
  colorizeTemplate(ctx, targetColor);
  coverOldLabels(ctx, targetColor);
  drawDiagonalArc(ctx);

  if (card.color === 'wild') {
    drawWildMark(ctx, 160, 264);
  } else {
    drawLabel(ctx, cardSymbol(card), 160, 264, card.kind === 'reverse' || card.kind === 'skip' ? 98 : 126);
  }

  const corner = cardSymbol(card);
  drawLabel(ctx, corner, 67, 67, card.kind === 'reverse' || card.kind === 'skip' ? 42 : 48);
  drawLabel(ctx, corner, 254, 450, card.kind === 'reverse' || card.kind === 'skip' ? 42 : 48, Math.PI);

  const buffer = canvas.toBuffer('image/png');
  cache.set(key, buffer);
  return buffer;
}
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = join(__dirname, '../assets/uno/template-green-10.jpg');
const SOURCE_WIDTH = 640;
const SOURCE_HEIGHT = 1024;
const CARD_WIDTH = 320;
const CARD_HEIGHT = 512;
const CARD_BOUNDS = { left: 28, top: 40, right: 612, bottom: 988 };
const sourceImage = loadImage(readFileSync(SOURCE_PATH));
const templateLayers = buildTemplateLayers();
const cache = new Map();

const COLORS = Object.freeze({
  red: '#ed1c24',
  yellow: '#f4c20d',
  green: '#18a957',
  blue: '#1684d8',
  wild: '#242529',
});

const COLOR_VALUES = Object.freeze({
  red: 0xed1c24,
  yellow: 0xf4c20d,
  green: 0x18a957,
  blue: 0x1684d8,
  wild: 0x242529,
});

const NUMBER_MASKS = [
  { left: 36, top: 58, right: 208, bottom: 208 },
  { left: 76, top: 300, right: 570, bottom: 730 },
  { left: 430, top: 790, right: 620, bottom: 970 },
];

function isWhite(r, g, b) {
  return r > 178 && g > 178 && b > 178;
}

function isGreen(r, g, b) {
  return g > r * 1.15 && g > b * 1.08 && g > 55;
}

function insideMask(x, y) {
  return NUMBER_MASKS.some(mask =>
    x >= mask.left && x <= mask.right && y >= mask.top && y <= mask.bottom);
}

function connectedWhitePixels(data) {
  const total = SOURCE_WIDTH * SOURCE_HEIGHT;
  const connected = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueue = (index) => {
    if (connected[index]) return;
    const offset = index * 4;
    if (!isWhite(data[offset], data[offset + 1], data[offset + 2])) return;
    connected[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < SOURCE_WIDTH; x += 1) {
    enqueue(x);
    enqueue((SOURCE_HEIGHT - 1) * SOURCE_WIDTH + x);
  }
  for (let y = 0; y < SOURCE_HEIGHT; y += 1) {
    enqueue(y * SOURCE_WIDTH);
    enqueue(y * SOURCE_WIDTH + SOURCE_WIDTH - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % SOURCE_WIDTH;
    const y = Math.floor(index / SOURCE_WIDTH);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < SOURCE_WIDTH) enqueue(index + 1);
    if (y > 0) enqueue(index - SOURCE_WIDTH);
    if (y + 1 < SOURCE_HEIGHT) enqueue(index + SOURCE_WIDTH);
  }
  return connected;
}

function estimateCardGreen(data) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (let y = 0; y < SOURCE_HEIGHT; y += 4) {
    for (let x = 0; x < SOURCE_WIDTH; x += 4) {
      if (insideMask(x, y)) continue;
      const offset = (y * SOURCE_WIDTH + x) * 4;
      if (!isGreen(data[offset], data[offset + 1], data[offset + 2])) continue;
      red += data[offset];
      green += data[offset + 1];
      blue += data[offset + 2];
      count += 1;
    }
  }

  return count
    ? [Math.round(red / count), Math.round(green / count), Math.round(blue / count)]
    : [31, 165, 79];
}

async function buildTemplateLayers() {
  const image = await sourceImage;
  const canvas = createCanvas(SOURCE_WIDTH, SOURCE_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);

  const imageData = ctx.getImageData(0, 0, SOURCE_WIDTH, SOURCE_HEIGHT);
  const data = imageData.data;
  const connectedWhite = connectedWhitePixels(data);
  const cardGreen = estimateCardGreen(data);

  for (let y = 0; y < SOURCE_HEIGHT; y += 1) {
    for (let x = 0; x < SOURCE_WIDTH; x += 1) {
      if (!insideMask(x, y)) continue;
      const pixel = y * SOURCE_WIDTH + x;
      const offset = pixel * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (isGreen(r, g, b) || connectedWhite[pixel]) continue;
      data[offset] = cardGreen[0];
      data[offset + 1] = cardGreen[1];
      data[offset + 2] = cardGreen[2];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const scaled = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  scaled.getContext('2d').drawImage(canvas, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  const arcCanvas = createCanvas(SOURCE_WIDTH, SOURCE_HEIGHT);
  const arcCtx = arcCanvas.getContext('2d');
  const arcData = arcCtx.createImageData(SOURCE_WIDTH, SOURCE_HEIGHT);
  for (let y = CARD_BOUNDS.top; y <= CARD_BOUNDS.bottom; y += 1) {
    for (let x = CARD_BOUNDS.left; x <= CARD_BOUNDS.right; x += 1) {
      const pixel = y * SOURCE_WIDTH + x;
      if (!connectedWhite[pixel]) continue;
      const sourceOffset = pixel * 4;
      const targetOffset = sourceOffset;
      arcData.data[targetOffset] = data[sourceOffset];
      arcData.data[targetOffset + 1] = data[sourceOffset + 1];
      arcData.data[targetOffset + 2] = data[sourceOffset + 2];
      arcData.data[targetOffset + 3] = 255;
    }
  }
  arcCtx.putImageData(arcData, 0, 0);
  const scaledArc = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  scaledArc.getContext('2d').drawImage(arcCanvas, 0, 0, CARD_WIDTH, CARD_HEIGHT);

  return { base: scaled, arc: scaledArc };
}

function hexRgb(hex) {
  const value = hex.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function colorize(ctx, color) {
  const image = ctx.getImageData(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const data = image.data;
  const target = hexRgb(color);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    if (!isGreen(r, g, b)) continue;
    const brightness = 0.72 + (g / 255) * 0.28;
    data[index] = Math.min(255, Math.round(target.r * brightness));
    data[index + 1] = Math.min(255, Math.round(target.g * brightness));
    data[index + 2] = Math.min(255, Math.round(target.b * brightness));
  }
  ctx.putImageData(image, 0, 0);
}

function cardSymbol(card) {
  if (card.kind === 'number') return String(card.value);
  if (card.kind === 'draw2') return '+2';
  if (card.kind === 'wild4') return '+4';
  return '';
}

function drawTextGlyph(ctx, text, x, y, size, rotation = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `900 ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size * 0.08);
  ctx.strokeStyle = '#050505';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawSkip(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#050505';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = Math.max(5, size * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-size * 0.28, size * 0.28);
  ctx.lineTo(size * 0.28, -size * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawWildMark(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.18);
  ctx.lineWidth = Math.max(3, size * 0.05);
  const colors = [COLORS.red, COLORS.yellow, COLORS.green, COLORS.blue];
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = '#050505';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, size, index * Math.PI / 2, (index + 1) * Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawWildGlyph(ctx, card, x, y, size, rotation = 0) {
  if (card.kind !== 'wild4' || size < 60) {
    if (card.kind === 'wild4') return drawTextGlyph(ctx, '+4', x, y, size * 0.82, rotation);
    return drawWildMark(ctx, x, y, size * 0.55);
  }

  drawWildMark(ctx, x, y - size * 0.36, size * 0.52);
  drawTextGlyph(ctx, '+4', x, y + size * 0.48, size * 0.7, rotation);
}

function drawGlyph(ctx, card, x, y, size, rotation = 0) {
  if (card.kind === 'skip') return drawSkip(ctx, x, y, size);
  if (card.kind === 'reverse') return drawTextGlyph(ctx, '↻', x, y, size * 0.94, rotation);
  if (card.color === 'wild') return drawWildGlyph(ctx, card, x, y, size, rotation);
  drawTextGlyph(ctx, cardSymbol(card), x, y, size, rotation);
}

function repairCenterContour(ctx) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(69, 184);
  ctx.bezierCurveTo(63, 193, 57, 199, 54, 207);
  ctx.bezierCurveTo(51, 215, 49, 224, 45, 234);
  ctx.stroke();
  ctx.restore();
}

export async function generateUnoCard(card) {
  const key = `${card.color}:${card.kind}:${card.value ?? ''}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const { base, arc } = await templateLayers;
  ctx.drawImage(base, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  colorize(ctx, COLORS[card.color] ?? COLORS.wild);

  const centerSize = card.kind === 'number' ? 108 : 84;
  drawGlyph(ctx, card, 172, 268, centerSize);
  drawGlyph(ctx, card, 64, 68, card.kind === 'number' ? 46 : 38);
  drawGlyph(ctx, card, 255, 447, card.kind === 'number' ? 46 : 38, Math.PI);
  ctx.drawImage(arc, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  repairCenterContour(ctx);

  const buffer = canvas.toBuffer('image/png');
  cache.set(key, buffer);
  return buffer;
}

export function unoColorValue(color) {
  return COLOR_VALUES[color] ?? COLOR_VALUES.wild;
}
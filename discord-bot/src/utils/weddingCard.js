import {
  ActionRowBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import prisma from '../database/client.js';
import { getActiveMarriageCallMinutes } from './marriageCallTracker.js';

const FONTS_DIR = path.join(process.cwd(), 'fonts');
const BACKGROUND_PATH = path.join(process.cwd(), 'assets', 'wedding-background.png');
const FONT = 'WeddingFont';

let fontsRegistered = false;

function registerWeddingFonts() {
  if (fontsRegistered) return;

  try {
    const regularPath = path.join(FONTS_DIR, 'Roboto-Regular.ttf');
    const boldPath = path.join(FONTS_DIR, 'Roboto-Bold.ttf');
    if (!fs.existsSync(regularPath) || !fs.existsSync(boldPath)) {
      throw new Error(`Fontes não encontradas em ${FONTS_DIR}`);
    }

    const regular = GlobalFonts.registerFromPath(
      regularPath,
      FONT,
    );
    const bold = GlobalFonts.registerFromPath(
      boldPath,
      FONT,
    );

    if (!regular || !bold) {
      console.error('[CASAMENTO FONT] Não foi possível registrar uma ou mais fontes personalizadas.');
    }
    fontsRegistered = true;
  } catch (error) {
    console.error('[CASAMENTO FONT] Falha ao registrar fontes personalizadas:', error);
    // O canvas continuará usando a fonte sans-serif do sistema como fallback.
  }
}

const WIDTH = 1000;
const HEIGHT = 768;
const PINK = '#f44598';
const DARK = '#351329';
const MUTED = '#87516b';

const imageCache = new Map();

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar imagem: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function loadWeddingBackground() {
  if (!fs.existsSync(BACKGROUND_PATH)) return null;

  try {
    return await loadImage(fs.readFileSync(BACKGROUND_PATH));
  } catch (error) {
    console.error('[CASAMENTO BACKGROUND] Falha ao carregar fundo local:', error);
    return null;
  }
}

function createFallbackAvatar() {
  const avatar = createCanvas(256, 256);
  const ctx = avatar.getContext('2d');

  ctx.fillStyle = '#e9a4c5';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#fff2f8';
  ctx.beginPath();
  ctx.arc(128, 92, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128, 224, 86, Math.PI, Math.PI * 2);
  ctx.fill();

  return avatar;
}

async function fetchImage(url) {
  const fallback = createFallbackAvatar();
  if (!url) return fallback;
  if (imageCache.has(url)) return imageCache.get(url);

  try {
    const image = await loadImage(await fetchImageBuffer(url));
    if (imageCache.size >= 80) imageCache.delete(imageCache.keys().next().value);
    imageCache.set(url, image);
    return image;
  } catch (error) {
    console.error('[CASAMENTO AVATAR] Falha no download/carregamento do avatar:', error);
    return fallback;
  }
}

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

function drawHeart(ctx, x, y, size, fill, stroke = null) {
  const half = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, half * 0.92);
  ctx.bezierCurveTo(-size * 0.88, half * 0.18, -size * 0.52, -half, 0, -half * 0.34);
  ctx.bezierCurveTo(size * 0.52, -half, size * 0.88, half * 0.18, 0, half * 0.92);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

function drawRing(ctx, x, y, radius, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, radius * 0.24);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSparkle(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x, y + size);
  ctx.moveTo(x - size, y);
  ctx.lineTo(x + size, y);
  ctx.stroke();
  ctx.restore();
}

function drawCalendar(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  roundRect(ctx, x - 11, y - 10, 22, 21, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 11, y - 3);
  ctx.lineTo(x + 11, y - 3);
  ctx.moveTo(x - 5, y - 14);
  ctx.lineTo(x - 5, y - 6);
  ctx.moveTo(x + 5, y - 14);
  ctx.lineTo(x + 5, y - 6);
  ctx.stroke();
  ctx.restore();
}

function drawHeadphones(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, 12, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, x - 14, y - 1, 5, 12, 2);
  ctx.fill();
  roundRect(ctx, x + 9, y - 1, 5, 12, 2);
  ctx.fill();
  ctx.restore();
}

function drawKiss(ctx, x, y, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 10, y - 7, x - 12, y + 6, x, y + 2);
  ctx.bezierCurveTo(x + 12, y + 6, x + 10, y - 7, x, y);
  ctx.fill();
  ctx.restore();
}

function drawHug(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x - 6, y - 4, 5, 0, Math.PI * 2);
  ctx.arc(x + 6, y - 4, 5, 0, Math.PI * 2);
  ctx.moveTo(x - 12, y + 9);
  ctx.quadraticCurveTo(x - 6, y + 1, x, y + 8);
  ctx.quadraticCurveTo(x + 6, y + 1, x + 12, y + 9);
  ctx.stroke();
  ctx.restore();
}

function drawStatIcon(ctx, kind, x, y, color) {
  if (kind === 'calendar') return drawCalendar(ctx, x, y, color);
  if (kind === 'call') return drawHeadphones(ctx, x, y, color);
  if (kind === 'kiss') return drawKiss(ctx, x, y, color);
  if (kind === 'hug') return drawHug(ctx, x, y, color);
  if (kind === 'gf') {
    drawHeart(ctx, x - 5, y + 2, 14, color);
    return drawHeart(ctx, x + 7, y - 3, 12, color);
  }
  drawHeart(ctx, x, y, 17, color);
}

function drawCircleImage(ctx, image, centerX, centerY, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();
  const source = image ?? createFallbackAvatar();
  const scale = Math.max((radius * 2) / source.width, (radius * 2) / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  ctx.drawImage(source, centerX - width / 2, centerY - height / 2, width, height);
  ctx.restore();
}

function truncate(text, maxLength = 17) {
  const value = String(text ?? '');
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date instanceof Date ? date : new Date(date));
}

function drawStatBox(ctx, x, y, label, value, iconKind, iconColor = '#e93d73') {
  ctx.save();
  ctx.shadowColor = 'rgba(116, 39, 84, 0.09)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff9fc';
  roundRect(ctx, x, y, 260, 76, 22);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#efcfe0';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, 260, 76, 22);
  ctx.stroke();

  drawStatIcon(ctx, iconKind, x + 35, y + 28, iconColor);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `16px ${FONT}, sans-serif`;
  ctx.fillStyle = '#a26b85';
  ctx.fillText(label, x + 66, y + 30);
  ctx.font = `bold 22px ${FONT}, sans-serif`;
  ctx.fillStyle = DARK;
  ctx.fillText(String(value), x + 66, y + 57);
}

async function renderWeddingCard({ left, right, stats }) {
  registerWeddingFonts();

  try {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const [leftImage, rightImage, backgroundImage] = await Promise.all([
      fetchImage(left.avatarUrl),
      fetchImage(right.avatarUrl),
      loadWeddingBackground(),
    ]);

    ctx.fillStyle = '#f8c1db';
    roundRect(ctx, 0, 0, WIDTH, HEIGHT, 34);
    ctx.fill();

    ctx.fillStyle = '#fff2f8';
    roundRect(ctx, 7, 7, WIDTH - 14, HEIGHT - 14, 30);
    ctx.fill();

    ctx.save();
    roundRect(ctx, 30, 28, WIDTH - 60, HEIGHT - 56, 28);
    ctx.clip();
    if (backgroundImage) {
      const backgroundScale = Math.max(
        (WIDTH - 60) / backgroundImage.width,
        (HEIGHT - 56) / backgroundImage.height,
      );
      const backgroundWidth = backgroundImage.width * backgroundScale;
      const backgroundHeight = backgroundImage.height * backgroundScale;
      ctx.globalAlpha = 0.18;
      ctx.drawImage(
        backgroundImage,
        WIDTH / 2 - backgroundWidth / 2,
        HEIGHT / 2 - backgroundHeight / 2,
        backgroundWidth,
        backgroundHeight,
      );
      ctx.globalAlpha = 1;
    }
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, 'rgba(255,255,255,0.18)');
    bg.addColorStop(0.5, 'rgba(255,216,237,0.20)');
    bg.addColorStop(1, 'rgba(255,193,222,0.42)');
    ctx.fillStyle = bg;
    ctx.fillRect(30, 28, WIDTH - 60, HEIGHT - 56);
    ctx.globalAlpha = 0.45;
    for (const [x, y] of [[95, 88], [850, 93], [75, 325], [900, 350], [500, 310]]) {
      drawHeart(ctx, x, y - 6, 20, '#f8cfe2');
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = DARK;
    ctx.font = `bold 30px ${FONT}, sans-serif`;
    drawRing(ctx, WIDTH / 2 - 126, 74, 8, DARK);
    drawRing(ctx, WIDTH / 2 - 115, 78, 8, DARK);
    drawSparkle(ctx, WIDTH / 2 + 126, 75, 7, DARK);
    ctx.fillText('CASAMENTO', WIDTH / 2, 82);
    ctx.font = `18px ${FONT}, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.fillText('cartão do casal', WIDTH / 2, 110);

    const avatarY = 220;
    const avatarRadius = 92;
    for (const [member, image, x] of [[left, leftImage, 185], [right, rightImage, 815]]) {
      ctx.fillStyle = '#f65aa5';
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius + 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ff9bc8';
      ctx.lineWidth = 4;
      ctx.stroke();
      drawCircleImage(ctx, image, x, avatarY, avatarRadius);
      drawHeart(ctx, x + 90, avatarY + 85, 32, '#e93377');

      ctx.fillStyle = DARK;
      ctx.font = `bold 32px ${FONT}, sans-serif`;
      ctx.fillText(truncate(member.displayName), x, 356);
      ctx.font = `19px ${FONT}, sans-serif`;
      ctx.fillStyle = MUTED;
      ctx.fillText(`@${truncate(member.username, 21)}`, x, 386);
    }

    const heartX = WIDTH / 2;
    const heartY = 218;
    ctx.shadowColor = 'rgba(218, 47, 125, 0.28)';
    ctx.shadowBlur = 20;
    drawHeart(ctx, heartX, heartY, 124, '#f34d9c', '#ff91c4');
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 15px ${FONT}, sans-serif`;
    ctx.fillText('NÍVEL', heartX, 202);
    ctx.font = `bold 44px ${FONT}, sans-serif`;
    ctx.fillText(String(stats.level), heartX, 246);
    ctx.fillStyle = DARK;
    ctx.font = `16px ${FONT}, sans-serif`;
    ctx.fillText('do casal', heartX, 295);

    const progressX = 95;
    const progressY = 418;
    const progressW = 810;
    ctx.fillStyle = '#fffafd';
    roundRect(ctx, progressX, progressY, progressW, 86, 25);
    ctx.fill();
    ctx.strokeStyle = '#efcfdf';
    ctx.lineWidth = 2;
    roundRect(ctx, progressX, progressY, progressW, 86, 25);
    ctx.stroke();

    drawHeart(ctx, 130, 451, 29, '#e73776', '#f48db3');
    ctx.textAlign = 'left';
    ctx.fillStyle = DARK;
    ctx.font = `bold 22px ${FONT}, sans-serif`;
    ctx.fillText(`${stats.xp} XP do casal`, 158, 449);
    ctx.font = `16px ${FONT}, sans-serif`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`${stats.interactions} interações entre os dois`, 158, 475);
    ctx.textAlign = 'right';
    ctx.fillText(`${stats.progressPercent}% até o nível ${stats.level + 1}`, 872, 449);
    ctx.fillText(`${stats.xpMissing} XP faltando`, 872, 475);

    ctx.fillStyle = '#f0c0d8';
    roundRect(ctx, 118, 484, 764, 14, 7);
    ctx.fill();
    ctx.fillStyle = PINK;
    roundRect(ctx, 118, 484, Math.max(14, 764 * stats.progressPercent / 100), 14, 7);
    ctx.fill();

    drawStatBox(ctx, 95, 538, 'Desde', formatDate(stats.marriedAt), 'calendar');
    drawStatBox(ctx, 370, 538, 'Call juntos', `${stats.callMinutes}min`, 'call', '#4f9fd1');
    drawStatBox(ctx, 645, 538, 'Interações', stats.interactions, 'heart');
    drawStatBox(ctx, 95, 628, 'Beijos', stats.kisses, 'kiss', '#e58e16');
    drawStatBox(ctx, 370, 628, 'Abraços', stats.hugs, 'hug', '#ee9939');
    drawStatBox(ctx, 645, 628, 'GF', stats.gf, 'gf');

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error("ERRO DETALHADO NO CANVAS:", error);
    console.error('[CASAMENTO CANVAS] Falha durante o desenho do cartão:', error);
    throw error;
  }
}

export async function getMarriageStats(leftId, rightId, marriedAt = new Date(), guildId = null) {
  const rows = await prisma.interaction.findMany({
    where: {
      OR: [
        { fromId: leftId, toId: rightId },
        { fromId: rightId, toId: leftId },
      ],
    },
    select: { type: true, count: true },
  });

  const countType = type => rows
    .filter(row => row.type === type)
    .reduce((sum, row) => sum + row.count, 0);
  const kisses = countType('kiss');
  const hugs = countType('hug');
  const gf = countType('gf');
  const interactions = rows
    .filter(row => row.type !== 'call')
    .reduce((sum, row) => sum + row.count, 0);
  const callMinutes = countType('call')
    + (guildId ? getActiveMarriageCallMinutes(guildId, leftId, rightId) : 0);
  const xp = interactions * 36;
  const level = Math.floor(xp / 180) + 1;
  const currentXp = xp % 180;

  return {
    kisses,
    hugs,
    gf,
    interactions,
    xp,
    level,
    progressPercent: Math.round((currentXp / 180) * 100),
    xpMissing: 180 - currentXp,
    callMinutes,
    marriedAt: marriedAt ?? new Date(),
  };
}

export async function buildWeddingCardPayload({ left, right, stats }) {
  const image = await renderWeddingCard({ left, right, stats });
  const attachment = new AttachmentBuilder(image, { name: 'casamento-card.png' });
  const pair = `${left.id}_${right.id}`;

  const controls = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`casar_action_${pair}`)
      .setPlaceholder('Escolha uma ação para o casamento')
      .addOptions(
        {
          label: 'Gerenciar casamento',
          value: 'manage',
          description: 'Abrir as opções de gerenciamento',
        },
        {
          label: 'Atualizar cartão',
          value: 'refresh',
          description: 'Recalcular as estatísticas do casal',
        },
      ),
  );

  const embed = new EmbedBuilder()
    .setColor(0xF44598)
    .setDescription(
      `**Cartão de casamento**\n` +
      `<@${left.id}> e <@${right.id}> · nível ${stats.level} · ${stats.xp} XP\n\n` +
      `*Use o menu abaixo para atualizar as estatísticas.*`,
    )
    .setImage('attachment://casamento-card.png');

  return {
    files: [attachment],
    embeds: [embed],
    components: [controls],
  };
}
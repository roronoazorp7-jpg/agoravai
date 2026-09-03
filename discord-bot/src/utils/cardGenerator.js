import { createCanvas, loadImage } from '@napi-rs/canvas';

const W = 732;
const OUTER = 18;
const CARD_W = W - OUTER * 2;
const CONTENT_X = 54;
const CONTENT_RIGHT = W - CONTENT_X;
const AV = 58;
const FONT = '"Arial", "DejaVu Sans", sans-serif';

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text ?? '').split(/\r?\n/);

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }

    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [''];
}

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

async function loadRemoteImage(url) {
  if (!url) return null;
  try {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}size=128`);
    if (!response.ok) return null;
    return loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function drawCircularImage(ctx, image, x, y, size, fallback = '#C6CED5') {
  const radius = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    ctx.fillStyle = fallback;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawFooterCommentIcon(ctx, x, y) {
  ctx.save();
  ctx.fillStyle = '#C6CED5';
  roundRect(ctx, x, y, 22, 18, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 17);
  ctx.lineTo(x + 4, y + 22);
  ctx.lineTo(x + 10, y + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  for (const dotX of [x + 7, x + 11, x + 15]) {
    ctx.beginPath();
    ctx.arc(dotX, y + 9, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function getMentionLabel(taggedTo, taggedUsers) {
  if (taggedUsers?.length) return taggedUsers[0].name;
  const id = String(taggedTo ?? '').match(/<@!?(\d+)>/)?.[1];
  return id ? `@${id}` : String(taggedTo ?? '').replace(/^@/, '');
}

export async function generateTellonymCard({
  authorName,
  authorUsername,
  message,
  taggedTo,
  taggedUsers = [],
  avatarUrl,
  isAnon,
}) {
  const LH = 38;
  const MSG_W = CONTENT_RIGHT - CONTENT_X;
  const MESSAGE_FONT = `30px ${FONT}`;
  const tmp = createCanvas(MSG_W, 80);
  const tCtx = tmp.getContext('2d');
  tCtx.font = MESSAGE_FONT;
  const lines = wrapText(tCtx, message, MSG_W);
  const messageBaseline = 151;
  const separatorY = messageBaseline + (lines.length - 1) * LH + 26;
  const footerBaseline = separatorY + 29;
  const cardBottom = separatorY + 42;
  const H = cardBottom + OUTER;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const cardY = OUTER;
  const cardH = H - OUTER * 2;

  // ── Card surface: transparent outside + soft dark shadow ───────────────────
  ctx.save();
  ctx.shadowColor = 'rgba(6, 16, 48, 0.72)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, OUTER, cardY, CARD_W, cardH, 26);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#EEF0F2';
  ctx.lineWidth = 1;
  roundRect(ctx, OUTER + 0.5, cardY + 0.5, CARD_W - 1, cardH - 1, 26);
  ctx.stroke();

  const headerY = 52;
  const authorImage = await loadRemoteImage(avatarUrl);
  await drawCircularImage(ctx, authorImage, CONTENT_X, headerY, AV);

  // ── Author ──────────────────────────────────────────────────────────────────
  const authorX = CONTENT_X + AV + 16;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#101318';
  ctx.font = `700 29px ${FONT}`;
  ctx.fillText(authorName, authorX, headerY + 29);

  ctx.fillStyle = '#98A1A8';
  ctx.font = `20px ${FONT}`;
  ctx.fillText(authorUsername, authorX, headerY + 53);

  // ── Mentioned user ─────────────────────────────────────────────────────────
  if (taggedTo) {
    const mentioned = taggedUsers?.[0];
    const mentionLabel = getMentionLabel(taggedTo, taggedUsers);
    const remaining = Math.max(0, (taggedUsers?.length ?? 1) - 1);
    const fullLabel = remaining ? `${mentionLabel} +${remaining}` : mentionLabel;
    const mentionAvatar = await loadRemoteImage(mentioned?.avatarUrl);
    const mentionAvatarSize = 30;
    const pillHeight = 31;
    const pillGap = 8;
    const pillY = 91;
    const maxPillWidth = 160;

    ctx.textAlign = 'right';
    ctx.fillStyle = '#17191D';
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText('Mencionados', CONTENT_RIGHT, headerY + 18);

    ctx.font = `700 16px ${FONT}`;
    const label = fullLabel.length > 18 ? `${fullLabel.slice(0, 17)}…` : fullLabel;
    const pillWidth = Math.min(maxPillWidth, ctx.measureText(label).width + 20);
    const avatarX = CONTENT_RIGHT - mentionAvatarSize;
    const pillX = avatarX - pillGap - pillWidth;
    ctx.fillStyle = '#17191D';
    roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 10);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(label, pillX + pillWidth / 2, pillY + 21);
    await drawCircularImage(ctx, mentionAvatar, avatarX, pillY, mentionAvatarSize);
  }

  // ── Message ─────────────────────────────────────────────────────────────────
  ctx.textAlign = 'left';
  ctx.fillStyle = '#242A30';
  ctx.font = MESSAGE_FONT;
  let y = messageBaseline;
  for (const line of lines) {
    ctx.fillText(line, CONTENT_X, y);
    y += LH;
  }

  // ── Separator + footer ─────────────────────────────────────────────────────
  ctx.strokeStyle = '#EFF1F2';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, separatorY);
  ctx.lineTo(CONTENT_RIGHT, separatorY);
  ctx.stroke();

  drawFooterCommentIcon(ctx, CONTENT_X, separatorY + 10);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#B5BEC5';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('há poucos segundos', CONTENT_RIGHT, footerBaseline);

  return canvas.toBuffer('image/png');
}

/**
 * animatedProfileCard.js
 * Gera um card de perfil GIF animado quando o banner do usuário é um GIF.
 * Usa @napi-rs/canvas (GifEncoder nativo) + gifuct-js para decodificar frames.
 */

import { GifEncoder, createCanvas, loadImage } from '@napi-rs/canvas';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { generateProfileCard } from './profileCard.js';
import { resolveBanner }      from './shopData.js';

// ── Detecção de GIF ───────────────────────────────────────────────────────────

/** Verifica se a URL/buffer é de um GIF (por extensão ou Content-Type). */
export async function isGifUrl(url) {
  if (!url) return false;
  if (/\.gif(\?.*)?$/i.test(url)) return true;
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 5000);
    const r    = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return (r.headers.get('content-type') ?? '').includes('image/gif');
  } catch { return false; }
}

// ── Extração e composição de frames GIF ──────────────────────────────────────

/**
 * Baixa um GIF, extrai e compõe até `maxFrames` frames.
 * Retorna Array de { image: Image, delayMs: number }.
 */
async function fetchGifFrames(url, maxFrames = 6) {
  // Download
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let gifBuffer;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    gifBuffer = Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(timer); }

  // Decodifica
  const gif    = parseGIF(gifBuffer.buffer.slice(gifBuffer.byteOffset, gifBuffer.byteOffset + gifBuffer.byteLength));
  const frames = decompressFrames(gif, true);
  if (!frames?.length) throw new Error('GIF sem frames');

  const gW = gif.lsd.width;
  const gH = gif.lsd.height;
  if (!gW || !gH || gW * gH > 12_000_000) {
    throw new Error(`GIF grande demais (${gW}x${gH})`);
  }

  // Canvas de composição
  const compCanvas = createCanvas(gW, gH);
  const compCtx    = compCanvas.getContext('2d');

  // Amostragem: se o GIF tem muitos frames, pega 1 a cada N
  const step     = Math.max(1, Math.ceil(frames.length / maxFrames));
  const selected = [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];

    // Compõe o patch deste frame no canvas acumulado
    const patchData = compCtx.createImageData(frame.dims.width, frame.dims.height);
    patchData.data.set(frame.patch);
    compCtx.putImageData(patchData, frame.dims.left, frame.dims.top);

    if (i % step === 0) {
      // Exporta o estado atual como PNG e recarrega como Image
      const pngBuf = compCanvas.toBuffer('image/png');
      const image  = await loadImage(pngBuf);
      const delay  = Math.max((frame.delay ?? 10) * 10, 40); // centisec → ms, mín 40ms
      selected.push({ image, delayMs: delay });
    }

    // Disposal: limpa a região para o próximo frame se necessário
    if (frame.disposalType === 2) {
      compCtx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    }
  }

  return selected;
}

// ── Gerador principal ─────────────────────────────────────────────────────────

const W = 800, H = 600;

function encodeCanvasAsGif(canvas, delayMs = 100) {
  const encoder = new GifEncoder(W, H, { repeat: 0, quality: 8 });
  try {
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, W, H);
    encoder.addFrame(new Uint8Array(data.data.buffer), W, H, { delay: delayMs });
    return encoder.finish();
  } finally {
    encoder.dispose();
  }
}

/**
 * Gera um card de perfil animado (GIF).
 * @param {object} params — mesmos parâmetros de generateProfileCard
 * @returns {Promise<Buffer>} Buffer do GIF animado
 */
export async function generateAnimatedProfileCard(params) {
  const { activeBanner, guildId, _resolvedBanner } = params;

  // Resolve o banner para checar se é GIF
  const banner = _resolvedBanner ?? await resolveBanner(activeBanner, guildId);
  if (!banner?.imageUrl) throw new Error('Banner não encontrado para card animado');

  const gifFrames = await fetchGifFrames(banner.imageUrl);
  if (!gifFrames.length) throw new Error('Nenhum frame extraído do GIF');

  console.log(`[animCard] ${gifFrames.length} frames extraídos de "${banner.key ?? 'custom'}"`);

  // Pré-renderiza elementos estáticos como imagem (tudo exceto o banner).
  // O primeiro frame do banner é usado para gerar a base (posição do avatar, etc.).
  // A partir do 2º frame, o cache de imagens dentro de generateProfileCard
  // garante que avatar/emojis não sejam re-buscados.

  const encoder = new GifEncoder(W, H, { repeat: 0, quality: 8 });
  try {
    for (let fi = 0; fi < gifFrames.length; fi++) {
      const { image: bannerFrame, delayMs } = gifFrames[fi];

      // Renderiza o card com este frame de banner
      const frameCanvas = await generateProfileCard({
        ...params,
        _bannerImage:  bannerFrame,  // pula o loadUrl do banner
        _resolvedBanner: banner,
        _returnCanvas: true,          // retorna o canvas em vez de PNG
      });

      // Extrai RGBA e adiciona ao GIF
      const ctx  = frameCanvas.getContext('2d');
      const data = ctx.getImageData(0, 0, W, H);
      encoder.addFrame(new Uint8Array(data.data.buffer), W, H, { delay: delayMs });
    }

    const gifBuffer = encoder.finish();
    console.log(`[animCard] GIF pronto: ${(gifBuffer.length / 1024).toFixed(0)} KB`);
    return gifBuffer;
  } finally {
    encoder.dispose();
  }
}

/**
 * Gera um GIF válido de um único frame para banners incompatíveis ou lentos.
 * Mesmo no fallback, o /perfil continua entregando GIF, nunca PNG.
 */
export async function generateStaticProfileGifCard(params) {
  const canvas = await generateProfileCard({
    ...params,
    _returnCanvas: true,
  });
  const gifBuffer = encodeCanvasAsGif(canvas);
  console.log(`[animCard] GIF estático de segurança pronto: ${(gifBuffer.length / 1024).toFixed(0)} KB`);
  return gifBuffer;
}

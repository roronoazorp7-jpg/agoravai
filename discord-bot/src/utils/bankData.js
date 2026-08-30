export const MIDAS_SYMBOL = 'MDS';
export const MIDAS_NAME = 'Midas Coin';
export const BANK_SESSION_TTL = 10 * 60 * 1000;
export const BANK_MAX_TRANSACTION = 1_000_000_000;
export const BANK_MAX_PASSWORD_LENGTH = 32;
export const BANK_MIN_PASSWORD_LENGTH = 6;

export const BANK_STOCKS = [
  {
    symbol: 'ORO',
    name: 'Ouro Real',
    emoji: '🪙',
    basePrice: 120,
    volatility: 0.08,
    phase: 0.2,
    description: 'Mineração e metais preciosos.',
  },
  {
    symbol: 'NOVA',
    name: 'Nova Tech',
    emoji: '💻',
    basePrice: 250,
    volatility: 0.18,
    phase: 1.7,
    description: 'Tecnologia, bots e inteligência artificial.',
  },
  {
    symbol: 'AURA',
    name: 'Aura Energia',
    emoji: '⚡',
    basePrice: 85,
    volatility: 0.12,
    phase: 3.1,
    description: 'Energia limpa e infraestrutura.',
  },
];

export function getStock(symbol) {
  return BANK_STOCKS.find(stock => stock.symbol === symbol?.trim().toUpperCase()) ?? null;
}

function hashSlot(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) / 0xffffffff;
}

export function getStockPrice(stockOrSymbol, now = Date.now()) {
  const stock = typeof stockOrSymbol === 'string' ? getStock(stockOrSymbol) : stockOrSymbol;
  if (!stock) return 0;

  const slot = Math.floor(now / (15 * 60 * 1000));
  const noise = (hashSlot(`${stock.symbol}:${slot}`) - 0.5) * stock.volatility;
  const wave = Math.sin(slot / 5 + stock.phase) * stock.volatility * 0.45;
  return Math.max(1, Math.round(stock.basePrice * (1 + noise + wave)));
}

export function formatMidas(value) {
  return `${Number(value ?? 0).toLocaleString('pt-BR')} MDS`;
}

export function formatSignedMidas(value) {
  const amount = Number(value ?? 0);
  return `${amount >= 0 ? '+' : ''}${formatMidas(amount)}`;
}
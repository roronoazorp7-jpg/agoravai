export const BUSINESS_DEFS = Object.freeze([
  {
    key: 'barraca',
    name: 'Barraca de rua',
    emoji: '🌮',
    price: 5_000,
    incomePerHour: 45,
    upgradeBase: 3_000,
    description: 'Um pequeno negócio para começar a empreender.',
  },
  {
    key: 'cafeteria',
    name: 'Cafeteria',
    emoji: '☕',
    price: 25_000,
    incomePerHour: 170,
    upgradeBase: 12_000,
    description: 'Café, conversa e uma renda constante.',
  },
  {
    key: 'oficina',
    name: 'Oficina mecânica',
    emoji: '🔧',
    price: 80_000,
    incomePerHour: 550,
    upgradeBase: 35_000,
    description: 'Serviços valiosos para quem precisa voltar à estrada.',
  },
  {
    key: 'agencia',
    name: 'Agência digital',
    emoji: '💻',
    price: 250_000,
    incomePerHour: 1_800,
    upgradeBase: 110_000,
    description: 'Projetos, anúncios e contratos de alto valor.',
  },
  {
    key: 'startup',
    name: 'Startup de tecnologia',
    emoji: '🚀',
    price: 750_000,
    incomePerHour: 6_000,
    upgradeBase: 300_000,
    description: 'Alto investimento e a maior renda passiva disponível.',
  },
]);

export const BUSINESS_MAX_LEVEL = 10;
export const BUSINESS_STORAGE_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

export function getBusiness(key) {
  return BUSINESS_DEFS.find(business => business.key === key) ?? null;
}

export function businessIncomePerHour(definition, level = 1) {
  return Math.floor(definition.incomePerHour * (1 + (Math.max(1, level) - 1) * 0.25));
}

export function businessUpgradeCost(definition, currentLevel) {
  return Math.floor(definition.upgradeBase * Math.max(1, currentLevel));
}

export function businessRefund(definition, level) {
  let upgradesPaid = 0;
  for (let currentLevel = 1; currentLevel < level; currentLevel += 1) {
    upgradesPaid += businessUpgradeCost(definition, currentLevel);
  }
  return Math.floor(definition.price * 0.6 + upgradesPaid * 0.5);
}

export function calculateBusinessIncome(business, now = Date.now()) {
  const definition = getBusiness(business.businessKey);
  if (!definition) return { amount: 0, incomePerHour: 0, nextCollectedAt: null };

  const lastCollectedAt = new Date(business.lastCollectedAt).getTime();
  const elapsedMs = Math.max(0, now - lastCollectedAt);
  const cappedMs = Math.min(elapsedMs, BUSINESS_STORAGE_HOURS * HOUR_MS);
  const incomePerHour = businessIncomePerHour(definition, business.level);
  const amount = Math.floor((cappedMs / HOUR_MS) * incomePerHour);

  if (amount <= 0) {
    return { amount: 0, incomePerHour, nextCollectedAt: new Date(lastCollectedAt + HOUR_MS / incomePerHour) };
  }

  const reachedStorageCap = elapsedMs >= BUSINESS_STORAGE_HOURS * HOUR_MS;
  const earnedMs = Math.floor((amount * HOUR_MS) / incomePerHour);
  return {
    amount,
    incomePerHour,
    nextCollectedAt: new Date(reachedStorageCap ? now : lastCollectedAt + earnedMs),
  };
}
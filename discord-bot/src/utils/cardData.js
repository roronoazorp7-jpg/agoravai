export const CARD_PACK_PRICE = 2500;
export const CARD_PACK_SIZE = 2;
export const CARD_REPEAT_CHANCE = 0.78;

export const CARD_RARITIES = Object.freeze({
  comum: { label: 'Comum', color: '#8290a8', weight: 44, duplicateValue: 250 },
  rara: { label: 'Rara', color: '#46b8ff', weight: 32, duplicateValue: 600 },
  epica: { label: 'Épica', color: '#b16cff', weight: 18, duplicateValue: 1400 },
  lendaria: { label: 'Lendária', color: '#ffbd4a', weight: 6, duplicateValue: 3500 },
});

export const CARD_DEFS = Object.freeze([
  { key: 'mega-charizard-x-ex', name: 'Mega Charizard X ex', rarity: 'lendaria', element: 'Fogo', description: 'A força explosiva da mega evolução.' },
  { key: 'mew-vmax', name: 'Mew VMAX', rarity: 'lendaria', element: 'Psíquico', description: 'Uma carta rara de fusão com poder ilimitado.' },
  { key: 'pikachu-ex', name: 'Pikachu ex', rarity: 'epica', element: 'Raio', description: 'Energia elétrica concentrada em um ataque decisivo.' },
  { key: 'eevee', name: 'Eevee', rarity: 'rara', element: 'Incolor', description: 'Um Pokémon adaptável pronto para qualquer evolução.' },
  { key: 'pokemon-05', name: 'Pokémon 05', rarity: 'rara', element: 'Incolor', description: 'Uma carta especial da coleção Pokémon.' },
  { key: 'pokemon-06', name: 'Pokémon 06', rarity: 'rara', element: 'Incolor', description: 'Uma carta especial da coleção Pokémon.' },
  { key: 'pokemon-07', name: 'Pokémon 07', rarity: 'comum', element: 'Incolor', description: 'Uma carta da coleção Pokémon.' },
  { key: 'pokemon-08', name: 'Pokémon 08', rarity: 'comum', element: 'Incolor', description: 'Uma carta da coleção Pokémon.' },
  { key: 'pokemon-09', name: 'Pokémon 09', rarity: 'comum', element: 'Incolor', description: 'Uma carta da coleção Pokémon.' },
  { key: 'pokemon-10', name: 'Pokémon 10', rarity: 'comum', element: 'Incolor', description: 'Uma carta da coleção Pokémon.' },
  { key: 'pokemon-11', name: 'Pokémon 11', rarity: 'comum', element: 'Incolor', description: 'Uma carta da coleção Pokémon.' },
  { key: 'pokemon-12', name: 'Pokémon 12', rarity: 'rara', element: 'Incolor', description: 'Uma carta especial da coleção Pokémon.' },
  { key: 'pokemon-13', name: 'Pokémon 13', rarity: 'epica', element: 'Incolor', description: 'Uma carta holográfica da coleção Pokémon.' },
  { key: 'pokemon-14', name: 'Pokémon 14', rarity: 'epica', element: 'Incolor', description: 'Uma carta holográfica da coleção Pokémon.' },
  { key: 'pokemon-15', name: 'Pokémon 15', rarity: 'rara', element: 'Incolor', description: 'Uma carta especial da coleção Pokémon.' },
].map((card, index) => ({
  ...card,
  artFile: `pokemon-${String(index + 1).padStart(2, '0')}.${index < 5 ? 'webp' : 'jpg'}`,
})));

export function getCard(key) {
  return CARD_DEFS.find(card => card.key === key) ?? null;
}

export function pickCard() {
  const total = Object.values(CARD_RARITIES).reduce((sum, rarity) => sum + rarity.weight, 0);
  let roll = Math.random() * total;
  let rarity = 'comum';
  for (const [key, data] of Object.entries(CARD_RARITIES)) {
    roll -= data.weight;
    if (roll <= 0) {
      rarity = key;
      break;
    }
  }
  const pool = CARD_DEFS.filter(card => card.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickPackCards() {
  const first = pickCard();
  const second = Math.random() < CARD_REPEAT_CHANCE ? first : pickCard();
  return [first, second];
}

export function rarityData(rarity) {
  return CARD_RARITIES[rarity] ?? CARD_RARITIES.comum;
}
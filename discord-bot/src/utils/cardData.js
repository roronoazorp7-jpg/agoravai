export const CARD_PACK_PRICE = 2500;
export const CARD_PACK_SIZE = 3;

export const CARD_RARITIES = Object.freeze({
  comum: { label: 'Comum', color: '#8290a8', weight: 55, duplicateValue: 250 },
  rara: { label: 'Rara', color: '#46b8ff', weight: 28, duplicateValue: 600 },
  epica: { label: 'Épica', color: '#b16cff', weight: 13, duplicateValue: 1400 },
  lendaria: { label: 'Lendária', color: '#ffbd4a', weight: 4, duplicateValue: 3500 },
});

export const CARD_DEFS = Object.freeze([
  { key: 'aiko-lua-partida', name: 'Aiko, Lua Partida', rarity: 'comum', element: 'Lua', symbol: '☾', description: 'Uma espadachim que protege aldeias sob eclipses.' },
  { key: 'ren-vento-errante', name: 'Ren, Vento Errante', rarity: 'comum', element: 'Ar', symbol: '✦', description: 'Corre mais rápido que as folhas no alto da montanha.' },
  { key: 'mio-jardim-estelar', name: 'Mio, Jardim Estelar', rarity: 'comum', element: 'Éter', symbol: '✿', description: 'Cultiva pequenas constelações em vasos de cristal.' },
  { key: 'kael-forja-rubra', name: 'Kael, Forja Rubra', rarity: 'comum', element: 'Fogo', symbol: '♢', description: 'Um ferreiro jovem com chamas nas mãos.' },
  { key: 'sora-guardia-mar', name: 'Sora, Guardiã do Mar', rarity: 'comum', element: 'Água', symbol: '≈', description: 'Escuta os segredos que dormem no fundo do oceano.' },
  { key: 'yuna-feitico-azul', name: 'Yuna, Feitiço Azul', rarity: 'rara', element: 'Arcano', symbol: '◇', description: 'Cada palavra sua desenha um novo círculo mágico.' },
  { key: 'taro-lobo-celeste', name: 'Taro, Lobo Celeste', rarity: 'rara', element: 'Luz', symbol: '☼', description: 'Uiva para estrelas que ninguém mais consegue ver.' },
  { key: 'mei-oraculo-vidro', name: 'Mei, Oráculo de Vidro', rarity: 'rara', element: 'Destino', symbol: '◈', description: 'Enxerga futuros possíveis em gotas de chuva.' },
  { key: 'rin-arqueira-nevoa', name: 'Rin, Arqueira da Névoa', rarity: 'rara', element: 'Névoa', symbol: '➶', description: 'Nunca erra um alvo que ainda não foi encontrado.' },
  { key: 'hiro-coroa-trovao', name: 'Hiro, Coroa do Trovão', rarity: 'epica', element: 'Raio', symbol: '⚡', description: 'Um príncipe exilado que comanda tempestades.' },
  { key: 'lumi-raposa-sete-caudas', name: 'Lumi, Raposa das Sete Caudas', rarity: 'epica', element: 'Ilusão', symbol: '✧', description: 'Seus truques confundem até os próprios sonhos.' },
  { key: 'nox-cavaleiro-vazio', name: 'Nox, Cavaleiro do Vazio', rarity: 'epica', element: 'Sombra', symbol: '✠', description: 'Vigia a fronteira entre o mundo e o nada.' },
  { key: 'eira-dragao-neve', name: 'Eira, Dragão da Neve', rarity: 'epica', element: 'Gelo', symbol: '❄', description: 'Seu sopro congela rios e preserva memórias.' },
  { key: 'astra-deusa-aurora', name: 'Astra, Deusa da Aurora', rarity: 'lendaria', element: 'Aurora', symbol: '✹', description: 'A primeira luz de cada era nasce em seus olhos.' },
  { key: 'zephiel-rei-sem-nome', name: 'Zephiel, Rei sem Nome', rarity: 'lendaria', element: 'Éter', symbol: '♛', description: 'Abandonou o trono para escrever seu próprio destino.' },
  { key: 'seraphine-estrela-caida', name: 'Seraphine, Estrela Caída', rarity: 'lendaria', element: 'Cosmos', symbol: '✪', description: 'Uma viajante celestial que carrega um céu inteiro.' },
].map((card, index) => ({
  ...card,
  artFile: `arcana-${String((index % 3) + 1).padStart(2, '0')}.jpg`,
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

export function rarityData(rarity) {
  return CARD_RARITIES[rarity] ?? CARD_RARITIES.comum;
}
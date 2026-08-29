export const CARD_PACK_PRICE = 2500;
export const CARD_PACK_SIZE = 2;
export const CARD_REPEAT_CHANCE = 0.45;

export const CARD_RARITIES = Object.freeze({
  comum: { label: 'Comum', color: '#8290a8', weight: 64, duplicateValue: 250 },
  incomum: { label: 'Incomum', color: '#46b8ff', weight: 30, duplicateValue: 600 },
  epica: { label: 'Épica', color: '#b45cff', weight: 4, duplicateValue: 1800 },
  lendaria: { label: 'Lendária', color: '#ffb52e', weight: 1, duplicateValue: 3000 },
  mitica: { label: 'Mítica', color: '#ff4fd8', weight: 1, duplicateValue: 3500 },
});

export const CARD_DEFS = Object.freeze([
  { key: 'mega-charizard-x-ex', name: 'Mega Charizard X ex', rarity: 'mitica', element: 'Fogo', description: 'A força explosiva da mega evolução.' },
  { key: 'mew-vmax', name: 'Mew VMAX', rarity: 'mitica', element: 'Psíquico', description: 'Uma carta de fusão com poder ilimitado.' },
  { key: 'pikachu-ex', name: 'Pikachu ex — Arte completa', rarity: 'mitica', element: 'Raio', description: 'Energia elétrica concentrada em um ataque decisivo.' },
  { key: 'eevee', name: 'Eevee — Evolução Potencializada', rarity: 'mitica', element: 'Incolor', description: 'Um Pokémon adaptável pronto para qualquer evolução.' },
  { key: 'pokemon-05', name: 'Eevee VMAX', rarity: 'mitica', element: 'Incolor', description: 'Uma evolução gigante cheia de energia.' },
  { key: 'pokemon-06', name: 'Pikachu ex — Floresta', rarity: 'mitica', element: 'Raio', description: 'O trovão de Pikachu ilumina a floresta.' },
  { key: 'pokemon-07', name: 'Mew ex', rarity: 'mitica', element: 'Psíquico', description: 'O Pokémon ancestral usa seu poder psíquico.' },
  { key: 'pokemon-08', name: 'Mewtwo ex', rarity: 'mitica', element: 'Psíquico', description: 'A força psíquica criada pela ciência.' },
  { key: 'pokemon-09', name: 'Mega Greninja ex', rarity: 'mitica', element: 'Água', description: 'Lâminas de água velozes como um raio.' },
  { key: 'pokemon-10', name: 'Mega Charizard ex', rarity: 'mitica', element: 'Fogo', description: 'Uma chama carmesim impossível de deter.' },
  { key: 'pokemon-11', name: 'Ho-Oh ex', rarity: 'mitica', element: 'Fogo', description: 'O Pokémon arco-íris renasce em chamas.' },
  { key: 'pokemon-12', name: 'Lunala ex', rarity: 'mitica', element: 'Psíquico', description: 'A lua abre suas asas sobre a noite.' },
  { key: 'pokemon-13', name: 'Mega Gengar ex', rarity: 'mitica', element: 'Sombrio', description: 'Uma presença fantasmagórica que atravessa dimensões.' },
  { key: 'pokemon-14', name: 'Gyarados ex', rarity: 'mitica', element: 'Água', description: 'A fúria do Pokémon serpente explode em ondas.' },
  { key: 'pokemon-15', name: 'Arceus ex', rarity: 'mitica', element: 'Incolor', description: 'O criador do mundo manifesta seu poder.' },
  { key: 'ivysaur', name: 'Ivysaur', rarity: 'comum', element: 'Planta', description: 'A semente em suas costas cresce sob a luz do sol.' },
  { key: 'charmander', name: 'Charmander', rarity: 'comum', element: 'Fogo', description: 'Sua cauda em chamas revela sua vitalidade.' },
  { key: 'pikachu-thunder-wave', name: 'Pikachu — Thunder Wave', rarity: 'comum', element: 'Raio', description: 'Uma onda elétrica que pode paralisar o adversário.' },
  { key: 'gengar', name: 'Gengar', rarity: 'incomum', element: 'Psíquico', description: 'Um sorriso assustador vindo das sombras.' },
  { key: 'jigglypuff', name: 'Jigglypuff', rarity: 'comum', element: 'Psíquico', description: 'Uma canção suave capaz de colocar o oponente para dormir.' },
  { key: 'squirtle', name: 'Squirtle', rarity: 'comum', element: 'Água', description: 'Um jato de água certeiro vindo de sua carapaça.' },
  { key: 'pikachu-pika-strike', name: 'Pikachu — Pika Strike', rarity: 'comum', element: 'Raio', description: 'Um golpe elétrico que deixa o adversário atordoado.' },
  { key: 'haunter', name: 'Haunter', rarity: 'incomum', element: 'Psíquico', description: 'Um toque fantasma que drena a energia do oponente.' },
  { key: 'charmeleon', name: 'Charmeleon', rarity: 'incomum', element: 'Fogo', description: 'Suas chamas ficam mais intensas a cada batalha.' },
  { key: 'meowth', name: 'Meowth', rarity: 'comum', element: 'Incolor', description: 'Adora moedas e sempre procura uma nova oportunidade.' },
  { key: 'flareon', name: 'Flareon', rarity: 'incomum', element: 'Fogo', description: 'Seu pelo armazena o calor de uma chama.' },
  { key: 'eevee-resonant-evolution', name: 'Eevee — Evolução Ressonante', rarity: 'comum', element: 'Incolor', description: 'A evolução de Eevee responde ao vínculo com seu treinador.' },
  { key: 'cinccino', name: 'Cinccino', rarity: 'comum', element: 'Incolor', description: 'Seu pelo macio mantém tudo limpo e brilhante.' },
  { key: 'raboot', name: 'Raboot', rarity: 'incomum', element: 'Fogo', description: 'Um chute veloz e uma combustão poderosa.' },
  { key: 'azumarill', name: 'Azumarill', rarity: 'incomum', element: 'Água', description: 'Suas orelhas detectam sons mesmo debaixo d’água.' },
  { key: 'rowlet', name: 'Rowlet', rarity: 'comum', element: 'Planta', description: 'Ataca silenciosamente enquanto parece uma folha.' },
  { key: 'machop', name: 'Machop', rarity: 'comum', element: 'Luta', description: 'Treina seu corpo todos os dias para ficar mais forte.' },
  { key: 'wartortle', name: 'Wartortle', rarity: 'incomum', element: 'Água', description: 'Sua cauda peluda armazena energia para batalhas intensas.' },
  { key: 'turtwig', name: 'Turtwig', rarity: 'comum', element: 'Planta', description: 'A luz do sol fortalece seu pequeno casco.' },
  { key: 'diglett', name: 'Diglett', rarity: 'comum', element: 'Luta', description: 'Escava túneis e surge de repente sob a terra.' },
  { key: 'torracat', name: 'Torracat', rarity: 'incomum', element: 'Fogo', description: 'O sino em seu pescoço anuncia suas chamas poderosas.' },
  { key: 'dratini', name: 'Dratini', rarity: 'comum', element: 'Água', description: 'Cresce protegido por correntes rápidas e cristalinas.' },
  { key: 'eevee-classic', name: 'Eevee', rarity: 'comum', element: 'Incolor', description: 'Uma evolução adaptável com potencial para muitos caminhos.' },
  { key: 'feraligatr', name: 'Feraligatr', rarity: 'incomum', element: 'Água', description: 'Suas mandíbulas e força aquática dominam qualquer correnteza.' },
  { key: 'piplup', name: 'Piplup', rarity: 'comum', element: 'Água', description: 'Orgulhoso e determinado, enfrenta ondas maiores que ele.' },
  { key: 'reuniclus', name: 'Reuniclus', rarity: 'incomum', element: 'Psíquico', description: 'Controla sua energia psíquica com precisão extraordinária.' },
  { key: 'vaporeon', name: 'Vaporeon', rarity: 'incomum', element: 'Água', description: 'Seu corpo se mistura à água para se mover sem ser visto.' },
  { key: 'venusaur', name: 'Venusaur', rarity: 'incomum', element: 'Planta', description: 'A flor em suas costas libera uma energia vegetal imensa.' },
  { key: 'pichu', name: 'Pichu', rarity: 'comum', element: 'Raio', description: 'Pequenas faíscas revelam sua energia elétrica crescente.' },
  { key: 'alakazam', name: 'Alakazam', rarity: 'incomum', element: 'Psíquico', description: 'Sua inteligência e poder mental ultrapassam todos os limites.' },
  { key: 'carvanha', name: 'Carvanha', rarity: 'comum', element: 'Água', description: 'Nada em cardumes e ataca com mordidas velozes.' },
  { key: 'scizor', name: 'Scizor', rarity: 'incomum', element: 'Metal', description: 'Suas pinças e carapaça vermelha parecem uma armadura viva.' },
  { key: 'greninja', name: 'Greninja', rarity: 'incomum', element: 'Água', description: 'Move-se pelas sombras e transforma água em lâminas precisas.' },
  { key: 'tapu-koko', name: 'Tapu Koko', rarity: 'incomum', element: 'Raio', description: 'O guardião veloz canaliza eletricidade em ataques devastadores.' },
  { key: 'ekans', name: 'Ekans', rarity: 'comum', element: 'Sombrio', description: 'Rasteja silenciosamente e surpreende suas presas.' },
  { key: 'shellder', name: 'Shellder', rarity: 'comum', element: 'Água', description: 'Sua concha resistente protege um Pokémon persistente.' },
  { key: 'sceptile', name: 'Sceptile', rarity: 'incomum', element: 'Planta', description: 'As folhas em sua cauda cortam o ar com velocidade.' },
  { key: 'latias-ex', name: 'Latias ex', rarity: 'lendaria', element: 'Psíquico', description: 'A lendária Latias atravessa os céus com velocidade e precisão.' },
  { key: 'deoxys-ex', name: 'Deoxys ex', rarity: 'lendaria', element: 'Psíquico', description: 'Uma força extraterrestre que conecta todos os Pokémon da Equipe Plasma.' },
  { key: 'zekrom-ex', name: 'Zekrom ex', rarity: 'lendaria', element: 'Raio', description: 'O dragão negro libera uma explosão elétrica capaz de virar a batalha.' },
  { key: 'cauda-brado-ex', name: 'Cauda Brado ex', rarity: 'epica', element: 'Psíquico', description: 'Um rugido ancestral que confunde o adversário e quebra seu ritmo.' },
  { key: 'mimikyu-ex', name: 'Mimikyu ex', rarity: 'epica', element: 'Psíquico', description: 'Sob seu disfarce assustador, Mimikyu prepara um truque impossível de prever.' },
  { key: 'gardevoir-ex', name: 'Gardevoir ex', rarity: 'epica', element: 'Psíquico', description: 'Sua energia psíquica protege aliados e desfere um golpe devastador.' },
  { key: 'salamence-ex', name: 'Salamence ex', rarity: 'epica', element: 'Dragão', description: 'As asas de Salamence transformam sua fúria em uma rajada destruidora.' },
  { key: 'mega-froslass-ex', name: 'Mega Froslass ex', rarity: 'lendaria', element: 'Água', description: 'A mega evolução de Froslass congela o campo com uma beleza assustadora.' },
  { key: 'mega-ampharos-ex', name: 'Mega Ampharos ex', rarity: 'epica', element: 'Raio', description: 'Mega Ampharos canaliza relâmpagos para paralisar e dominar o combate.' },
  { key: 'mega-blaziken-ex', name: 'Mega Blaziken ex', rarity: 'lendaria', element: 'Fogo', description: 'A chama de Mega Blaziken explode em golpes velozes e imparáveis.' },
].map((card, index) => ({
  ...card,
  artFile: `pokemon-${String(index + 1).padStart(2, '0')}.${index < 5 ? 'webp' : 'jpg'}`,
})));

export function getCard(key) {
  return CARD_DEFS.find(card => card.key === key) ?? null;
}

export function pickCard(rarityOverride = null, excludedKey = null) {
  let rarity = rarityOverride;
  if (!rarity) {
    const total = Object.values(CARD_RARITIES).reduce((sum, data) => sum + data.weight, 0);
    let roll = Math.random() * total;
    rarity = 'comum';
    for (const [key, data] of Object.entries(CARD_RARITIES)) {
      roll -= data.weight;
      if (roll <= 0) {
        rarity = key;
        break;
      }
    }
  }

  let pool = CARD_DEFS.filter(card => card.rarity === rarity && card.key !== excludedKey);
  if (!pool.length) pool = CARD_DEFS.filter(card => card.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pickPackCards() {
  const first = pickCard();
  const second = Math.random() < CARD_REPEAT_CHANCE
    ? pickCard(first.rarity, first.key)
    : pickCard(null, first.key);
  return [first, second];
}

export function rarityData(rarity) {
  return CARD_RARITIES[rarity] ?? CARD_RARITIES.comum;
}
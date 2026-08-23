import { fileURLToPath } from 'node:url';

export const ROBBERY_WEAPONS = Object.freeze([
  {
    key: 'faca',
    name: 'Faca',
    price: 0,
    stealMultiplier: 1,
    arrestChance: 0.12,
    description: 'A arma básica para pequenos roubos.',
    image: null,
  },
  {
    key: 'garrafa',
    name: 'Garrafa incendiária',
    price: 4500,
    stealMultiplier: 1.08,
    arrestChance: 0.16,
    description: 'Aumenta o valor roubado, mas chama mais atenção.',
    image: fileURLToPath(new URL('../assets/robbery/garrafa.jpg', import.meta.url)),
  },
  {
    key: 'escopeta',
    name: 'Escopeta',
    price: 9000,
    stealMultiplier: 1.18,
    arrestChance: 0.21,
    description: 'Mais impacto e mais risco de ser reconhecido.',
    image: fileURLToPath(new URL('../assets/robbery/escopeta.jpg', import.meta.url)),
  },
  {
    key: 'lancador',
    name: 'Lançador',
    price: 15000,
    stealMultiplier: 1.3,
    arrestChance: 0.26,
    description: 'Grande potencial de roubo, com risco elevado.',
    image: fileURLToPath(new URL('../assets/robbery/lancador.jpg', import.meta.url)),
  },
  {
    key: 'fuzil',
    name: 'Fuzil',
    price: 22000,
    stealMultiplier: 1.45,
    arrestChance: 0.32,
    description: 'Aumenta bastante o roubo e também a chance de prisão.',
    image: fileURLToPath(new URL('../assets/robbery/fuzil.jpg', import.meta.url)),
  },
  {
    key: 'submetralhadora',
    name: 'Submetralhadora',
    price: 30000,
    stealMultiplier: 1.62,
    arrestChance: 0.38,
    description: 'A arma mais valiosa e perigosa da loja.',
    image: fileURLToPath(new URL('../assets/robbery/submetralhadora.jpg', import.meta.url)),
  },
]);

export function getRobberyWeapon(key) {
  return ROBBERY_WEAPONS.find(weapon => weapon.key === key) ?? ROBBERY_WEAPONS[0];
}
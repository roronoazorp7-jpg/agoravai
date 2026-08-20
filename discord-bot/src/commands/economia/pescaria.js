import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SlashCommandBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../../database/client.js';
import { spendCoins, totalCoins } from '../../utils/economyFunds.js';
import { getEmoji } from '../../utils/emojiManager.js';
import { composeFishingArtwork, composeFishingScene } from '../../utils/fishingArtwork.js';

const COIN = () => getEmoji('futecoins');
const FISH_COMMON = () => getEmoji('fish_common');
const FISH_SEAL = () => getEmoji('fish_seal');
const FISH_LEGENDARY = () => getEmoji('fish_legendary');
const FISH_ROD = () => getEmoji('fish_rod');
const FISH_SHARK = () => getEmoji('fish_shark');
const FISH_CD = 1 * 60 * 1000;
const SHARK_BATTLE_START_HP = 12;
const SHARK_REWARD_MIN = 8000;
const SHARK_REWARD_MAX = 12000;
const LEGENDARY_ROUNDS = 2;
const LEGENDARY_BATTLE_MS = 10 * 60 * 1000;
const LEGENDARY_CHOICES = ['left', 'center', 'right'];
const fishAbilityClaims = new Map();

function fishEmoji(fish) {
  return fish?.emoji?.() ?? fish?.emoji ?? FISH_COMMON();
}

function rodEmoji(rod) {
  return rod?.emoji?.() ?? rod?.emoji ?? FISH_ROD();
}

export const FISH = Object.freeze([
  { key: 'peixe_comum', name: 'Peixe comum', emoji: FISH_COMMON, value: 80, chance: 48, rarity: 0, artwork: 'common', description: 'O peixe mais comum e fácil de conseguir.' },
  { key: 'tubarao_comum', name: 'Tubarão comum', emoji: FISH_SHARK, value: 650, chance: 13, rarity: 1, artwork: 'shark', description: 'Um tubarão que vale muitas coins.' },
  { key: 'carpa_lendaria', name: 'Carpa Solar lendária', emoji: FISH_LEGENDARY, value: 2400, chance: 4, rarity: 2.2, artwork: 'legendary', description: 'Uma carpa dourada rara que pode aparecer por conta própria — e ainda exige duas escolhas certeiras.' },
  { key: 'piranha_rubra', name: 'Piranha Rubra', emoji: () => '🐡', value: 560, chance: 6, rarity: 1.2, artwork: 'piranha', ability: 'piranha', description: 'Uma mordida nervosa que transforma respeito em coins.' },
  { key: 'betta_fogo', name: 'Betta de Fogo', emoji: () => '🐠', value: 420, chance: 5, rarity: 1.1, artwork: 'betta', ability: 'betta', description: 'Dança com as nadadeiras e chama a sorte para perto.' },
  { key: 'marlin_neon', name: 'Agulhão Neon', emoji: () => '🐟', value: 900, chance: 3.5, rarity: 2, artwork: 'marlin', ability: 'marlin', description: 'Um velocista do oceano que encurta a espera da próxima pescaria.' },
  { key: 'lagosta_espinhosa', name: 'Lagosta Espinhosa', emoji: () => '🦞', value: 760, chance: 7, rarity: 1.4, artwork: 'lobster', ability: 'lobster', description: 'Uma pinça dourada que recompensa quem tem coragem de segurá-la.' },
  { key: 'estrela_do_mar', name: 'Estrela do Mar', emoji: () => '⭐', value: 500, chance: 5.5, rarity: 1.2, artwork: 'starfish', ability: 'starfish', description: 'Faça um pedido: esta estrela pode abrir uma maré lendária.' },
  { key: 'polvo_rosa', name: 'Polvo Rosa', emoji: () => '🐙', value: 1100, chance: 4.5, rarity: 1.8, artwork: 'octopus', ability: 'octopus', description: 'Oito tentáculos, oito chances de encontrar uma isca especial.' },
  { key: 'tartaruga_marinha', name: 'Tartaruga Marinha', emoji: () => '🐢', value: 1300, chance: 3.5, rarity: 2, artwork: 'turtle', ability: 'turtle', description: 'Um casco antigo que ensina a esperar menos pela próxima maré.' },
  { key: 'orca', name: 'Orca da Maré', emoji: () => '🐋', value: 3000, chance: 1.5, rarity: 3, artwork: 'orca', ability: 'orca', description: 'Um chamado raro que traz tesouro e coins para o pescador.' },
  { key: 'escama_lendaria', name: 'Escama lendária', emoji: FISH_LEGENDARY, value: 0, chance: 0, rarity: 0, sellable: false, description: 'Uma escama obtida ao derrotar o tubarão raivoso.' },
  // Mantém capturas antigas vendáveis e visíveis após a evolução do sistema.
  { key: 'sardinha', name: 'Sardinha', emoji: FISH_COMMON, value: 80, chance: 0, rarity: 0, artwork: 'common', legacy: true, description: 'Captura antiga.' },
  { key: 'carpa', name: 'Carpa', emoji: FISH_COMMON, value: 140, chance: 0, rarity: 0, artwork: 'common', legacy: true, description: 'Captura antiga.' },
  { key: 'salmao', name: 'Salmão', emoji: FISH_COMMON, value: 240, chance: 0, rarity: 0, artwork: 'common', legacy: true, description: 'Captura antiga.' },
  { key: 'atum', name: 'Atum', emoji: FISH_COMMON, value: 390, chance: 0, rarity: 0, artwork: 'common', legacy: true, description: 'Captura antiga.' },
  { key: 'dourado', name: 'Dourado', emoji: FISH_COMMON, value: 700, chance: 0, rarity: 0, artwork: 'common', legacy: true, description: 'Captura antiga.' },
  { key: 'lendario', name: 'Peixe lendário', emoji: FISH_LEGENDARY, value: 1800, chance: 0, rarity: 0, artwork: 'legendary', legacy: true, description: 'Captura antiga.' },
]);

export const RODS = Object.freeze([
  { key: 'bambu', name: 'Vara de bambu', emoji: FISH_ROD, price: 0, luck: 0, description: 'A vara inicial. Faz o trabalho.' },
  { key: 'fibra', name: 'Vara de fibra', emoji: FISH_ROD, price: 2500, luck: 0.12, description: '+12% de chance de peixes raros.' },
  { key: 'carbono', name: 'Vara de carbono', emoji: FISH_ROD, price: 7500, luck: 0.28, description: '+28% de chance de peixes raros.' },
  { key: 'dourada', name: 'Vara dourada', emoji: FISH_ROD, price: 18000, luck: 0.5, description: '+50% de chance de peixes raros.' },
]);

const FISH_BY_KEY = new Map(FISH.map(fish => [fish.key, fish]));
const ROD_BY_KEY = new Map(RODS.map(rod => [rod.key, rod]));

const FISH_ABILITIES = Object.freeze({
  piranha: {
    label: 'Domar a mordida',
    emoji: '🩸',
    hint: 'A Piranha Rubra ainda está rosnando. Clique no botão para transformar a mordida em uma gorjeta.',
  },
  betta: {
    label: 'Fazer a dança',
    emoji: '✨',
    hint: 'O Betta de Fogo está fazendo charme. Clique no botão e ele pode chamar uma maré lendária.',
  },
  marlin: {
    label: 'Pegar carona',
    emoji: '⚡',
    hint: 'O Agulhão Neon quer correr com você. Clique no botão para encurtar a espera da próxima pescaria.',
  },
  lobster: {
    label: 'Apertar a pinça',
    emoji: '🦞',
    hint: 'A Lagosta Espinhosa ainda está segurando sua linha. Aperte a pinça e transforme a captura em uma gorjeta.',
  },
  starfish: {
    label: 'Fazer um pedido',
    emoji: '🌟',
    hint: 'A Estrela do Mar está brilhando. Faça um pedido para tentar chamar a próxima maré lendária.',
  },
  octopus: {
    label: 'Usar oito tentáculos',
    emoji: '🐙',
    hint: 'O Polvo Rosa encontrou algo entre as pedras. Use os oito tentáculos para revelar uma isca especial.',
  },
  turtle: {
    label: 'Ativar o casco',
    emoji: '🛡️',
    hint: 'A Tartaruga Marinha conhece uma corrente secreta. Ative o casco para reduzir a espera da próxima pescaria.',
  },
  orca: {
    label: 'Chamar a matilha',
    emoji: '🌊',
    hint: 'A Orca da Maré está chamando outras orcas. Responda ao chamado para receber um tesouro de alto mar.',
  },
});

const FISHING_SPOTS = Object.freeze([
  {
    key: 'lago',
    name: 'Lago Tranquilo',
    emoji: '🌿',
    description: 'Águas calmas, peixes comuns e uma boa chance de respirar.',
    scene: 'lago',
    fishMultipliers: { peixe_comum: 1.3, betta_fogo: 1.15, tartaruga_marinha: 0.65, estrela_do_mar: 0.5 },
    sharkMultiplier: 0.65,
    treasureMultiplier: 0.9,
  },
  {
    key: 'recife',
    name: 'Recife Colorido',
    emoji: '🪸',
    description: 'Um recife cheio de cores onde peixes habilidosos adoram se esconder.',
    scene: 'recife',
    fishMultipliers: { piranha_rubra: 1.35, betta_fogo: 1.35, lagosta_espinhosa: 1.6, estrela_do_mar: 1.45, polvo_rosa: 1.35 },
    sharkMultiplier: 0.9,
    treasureMultiplier: 1.1,
  },
  {
    key: 'mar_aberto',
    name: 'Mar Aberto',
    emoji: '🌊',
    description: 'Correntes fortes, peixes velozes e encontros que podem render muito.',
    scene: 'mar_aberto',
    fishMultipliers: { tubarao_comum: 1.3, marlin_neon: 1.45, estrela_do_mar: 1.2, polvo_rosa: 1.35, tartaruga_marinha: 1.45, orca: 1.6 },
    sharkMultiplier: 1.25,
    treasureMultiplier: 1.15,
  },
  {
    key: 'abismo',
    name: 'Abismo Azul',
    emoji: '🌀',
    description: 'O lugar mais perigoso: mais raridades, mais tesouros e mais dentes.',
    scene: 'abismo',
    fishMultipliers: { carpa_lendaria: 1.35, marlin_neon: 1.2, polvo_rosa: 1.6, tartaruga_marinha: 1.1, orca: 1.4 },
    sharkMultiplier: 1.45,
    treasureMultiplier: 1.35,
  },
]);

const FISHING_CONDITIONS = Object.freeze([
  {
    key: 'maré_dourada',
    name: 'Maré dourada',
    emoji: '✨',
    description: 'A luz refletida na água atrai peixes lendários.',
    fishMultipliers: { carpa_lendaria: 1.8 },
    treasureMultiplier: 1.1,
  },
  {
    key: 'maré_vermelha',
    name: 'Maré vermelha',
    emoji: '🩸',
    description: 'As Piranhas Rubras estão agitadas e mordendo tudo.',
    fishMultipliers: { piranha_rubra: 1.8 },
    sharkMultiplier: 1.15,
  },
  {
    key: 'tempestade',
    name: 'Tempestade elétrica',
    emoji: '⛈️',
    description: 'O mar ficou perigoso, mas os encontros especiais estão mais próximos.',
    fishMultipliers: { marlin_neon: 1.5 },
    sharkMultiplier: 1.35,
    treasureMultiplier: 1.25,
  },
  {
    key: 'águas_calmas',
    name: 'Águas calmas',
    emoji: '💧',
    description: 'A correnteza descansou e a próxima espera fica mais curta.',
    fishMultipliers: { peixe_comum: 1.2, betta_fogo: 1.2 },
    cooldownMultiplier: 0.75,
  },
  {
    key: 'correnteza_neon',
    name: 'Correnteza neon',
    emoji: '⚡',
    description: 'As águas brilham e o Agulhão Neon aparece com mais frequência.',
    fishMultipliers: { marlin_neon: 2 },
    treasureMultiplier: 1.15,
  },
]);

const FISHING_BAITS = Object.freeze([
  {
    key: 'minhoca',
    name: 'Minhoca fresca',
    emoji: '🪱',
    price: 180,
    pack: 3,
    description: 'Aumenta a chance de peixe comum e nunca deixa a linha vazia.',
    fishMultipliers: { peixe_comum: 1.45 },
  },
  {
    key: 'brilhante',
    name: 'Isca brilhante',
    emoji: '🌟',
    price: 700,
    pack: 2,
    description: 'Atrai peixes raros e aumenta a chance da Carpa Solar.',
    fishMultipliers: { carpa_lendaria: 1.8, marlin_neon: 1.25, piranha_rubra: 1.15 },
  },
  {
    key: 'carne',
    name: 'Carne fresca',
    emoji: '🥩',
    price: 900,
    pack: 2,
    description: 'O cheiro chama tubarões comuns e o Tubarão raivoso.',
    fishMultipliers: { tubarao_comum: 1.5 },
    sharkMultiplier: 1.8,
  },
  {
    key: 'eletrica',
    name: 'Isca elétrica',
    emoji: '🔋',
    price: 1000,
    pack: 2,
    description: 'Faz o Agulhão Neon cortar a água na sua direção.',
    fishMultipliers: { marlin_neon: 2.1 },
    treasureMultiplier: 1.15,
  },
  {
    key: 'dourada',
    name: 'Isca dourada',
    emoji: '🪙',
    price: 2500,
    pack: 1,
    description: 'Muito rara: aumenta bastante a chance de encontrar a Carpa Solar.',
    fishMultipliers: { carpa_lendaria: 3 },
  },
]);

const FISHING_MISSIONS = Object.freeze([
  { key: 'casts', name: 'Lançador de linha', target: 3, reward: 900, description: 'Faça 3 pescarias.' },
  { key: 'rare', name: 'Olho de pescador', target: 2, reward: 1400, description: 'Capture 2 peixes raros.' },
  { key: 'treasure', name: 'Caçador de tesouros', target: 1, reward: 1800, description: 'Encontre 1 tesouro.' },
  { key: 'ability', name: 'Peixe de estimação', target: 1, reward: 1100, description: 'Use a habilidade de 1 peixe.' },
]);

const FISHING_TREASURES = Object.freeze([
  { key: 'bau_coins', name: 'Baú submerso', emoji: '🧰', kind: 'coins', min: 450, max: 950 },
  { key: 'perola', name: 'Pérola do recife', emoji: '🫧', kind: 'coins', min: 700, max: 1500 },
  { key: 'isca_brilhante', name: 'Isca brilhante', emoji: '🌟', kind: 'bait', baitKey: 'brilhante', quantity: 1 },
  { key: 'isca_dourada', name: 'Isca dourada', emoji: '🪙', kind: 'bait', baitKey: 'dourada', quantity: 1 },
]);

function stableHash(value) {
  let hash = 0;
  for (const char of String(value)) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

function getFishingSpot(key) {
  return FISHING_SPOTS.find(spot => spot.key === key) ?? FISHING_SPOTS[0];
}

function getFishingCondition(guildId, now = Date.now()) {
  const hour = Math.floor(now / (60 * 60 * 1000));
  return FISHING_CONDITIONS[(stableHash(guildId) + hour) % FISHING_CONDITIONS.length];
}

function getFishingBait(key) {
  return FISHING_BAITS.find(bait => bait.key === key) ?? null;
}

function getFishingMission(profile, userId, guildId, now = Date.now()) {
  const date = new Date(now).toISOString().slice(0, 10);
  const key = profile.dailyMissionDate === date && profile.dailyMissionKey
    ? profile.dailyMissionKey
    : FISHING_MISSIONS[stableHash(`${userId}:${guildId}:${date}`) % FISHING_MISSIONS.length].key;
  return {
    date,
    mission: FISHING_MISSIONS.find(item => item.key === key) ?? FISHING_MISSIONS[0],
    progress: profile.dailyMissionDate === date ? profile.dailyMissionProgress : 0,
    claimed: profile.dailyMissionDate === date ? profile.dailyMissionClaimed : false,
  };
}

function missionDelta(missionKey, outcome, event = null) {
  if (missionKey === 'casts') return 1;
  if (missionKey === 'rare') {
    return outcome?.type === 'legendary' || (outcome?.type === 'catch' && (outcome.fish?.rarity ?? 0) >= 1) ? 1 : 0;
  }
  if (missionKey === 'treasure') return outcome?.type === 'treasure' ? 1 : 0;
  if (missionKey === 'ability') return event === 'ability' ? 1 : 0;
  return 0;
}

function missionUpdateData(profile, userId, guildId, outcome, now = Date.now(), event = null) {
  const state = getFishingMission(profile, userId, guildId, now);
  const progress = Math.min(state.mission.target, state.progress + missionDelta(state.mission.key, outcome, event));
  return {
    dailyMissionDate: state.date,
    dailyMissionKey: state.mission.key,
    dailyMissionProgress: progress,
    dailyMissionClaimed: state.claimed,
  };
}

function v2(text, { ephemeral = false, components = [] } = {}) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return {
    components: [container, ...components],
    flags: MessageFlags.IsComponentsV2,
    ...(ephemeral ? { ephemeral: true } : {}),
  };
}

export function fishingError(text) {
  return v2(`${FISH_COMMON()}  ${text}`, { ephemeral: true });
}

function fishingUpdateError(text) {
  return v2(`${FISH_COMMON()}  ${text}`);
}

async function getFishingProfile(userId, guildId, db = prisma) {
  return db.fishingProfile.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
}

function msToHuman(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m ${seconds}s`;
}

function fishingCooldownLabel(condition) {
  return msToHuman(Math.floor(FISH_CD * (condition?.cooldownMultiplier ?? 1)));
}

function formatFish(fish, quantity = null) {
  const amount = quantity === null ? '' : ` × **${quantity}**`;
  if (fish.key === 'escama_lendaria') {
    return `${fishEmoji(fish)} **${fish.name}**${amount} — troféu do tubarão raivoso`;
  }
  return `${fishEmoji(fish)} **${fish.name}**${amount} — ${fish.value.toLocaleString('pt-BR')} ${COIN()} cada`;
}

function chooseOutcome(luck = 0, sealBlessing = false, spot = FISHING_SPOTS[0], condition = FISHING_CONDITIONS[0], bait = null) {
  if (sealBlessing) {
    return {
      type: 'legendary',
      fish: FISH_BY_KEY.get('carpa_lendaria'),
      blessed: true,
      choice: LEGENDARY_CHOICES[Math.floor(Math.random() * LEGENDARY_CHOICES.length)],
    };
  }

  const weighted = [
    ...FISH.filter(fish => fish.chance > 0).map(fish => ({
      type: fish.key === 'carpa_lendaria' ? 'legendary' : 'catch',
      fish,
      weight: fish.chance *
        (1 + fish.rarity * luck) *
        (spot.fishMultipliers?.[fish.key] ?? 1) *
        (condition.fishMultipliers?.[fish.key] ?? 1) *
        (bait?.fishMultipliers?.[fish.key] ?? 1),
    })),
    { type: 'seal', artwork: 'seal', weight: 3 * (1 + luck * 0.4) },
    {
      type: 'angry_shark',
      artwork: 'angryShark',
      weight: 2.4 *
        (1 + luck * 0.8) *
        (spot.sharkMultiplier ?? 1) *
        (condition.sharkMultiplier ?? 1) *
        (bait?.sharkMultiplier ?? 1),
    },
    {
      type: 'treasure',
      artwork: 'treasure',
      weight: 2 *
        (spot.treasureMultiplier ?? 1) *
        (condition.treasureMultiplier ?? 1) *
        (bait?.treasureMultiplier ?? 1),
    },
  ];
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = Math.random() * total;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return weighted[0];
}

function chooseTreasure() {
  const treasure = FISHING_TREASURES[Math.floor(Math.random() * FISHING_TREASURES.length)];
  if (treasure.kind !== 'coins') return treasure;
  return {
    ...treasure,
    amount: Math.floor(treasure.min + Math.random() * (treasure.max - treasure.min + 1)),
  };
}

async function catchFish(userId, guildId, isAdmin = false, requestedSpotKey = null) {
  return prisma.$transaction(async tx => {
    const profile = await getFishingProfile(userId, guildId, tx);
    const now = Date.now();
    const spot = getFishingSpot(requestedSpotKey ?? profile.selectedSpotKey);
    const condition = getFishingCondition(guildId, now);
    if (profile.sharkBattleHp > 0) {
      const error = new Error('shark_battle');
      throw error;
    }
    if (profile.legendaryBattleUserId) {
      if (profile.legendaryBattleExpiresAt?.getTime() > now) {
        const error = new Error('legendary_battle');
        throw error;
      }
      await tx.fishingProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: {
          legendaryBattleUserId: null,
          legendaryBattleRound: 0,
          legendaryBattleChoice: null,
          legendaryBattleExpiresAt: null,
        },
      });
    }
    const elapsed = now - (profile.lastFishing?.getTime() ?? 0);
    const cooldown = Math.floor(FISH_CD * (condition.cooldownMultiplier ?? 1));
    if (!isAdmin && elapsed < cooldown) {
      const error = new Error('cooldown');
      error.remaining = cooldown - elapsed;
      throw error;
    }

    const activeBait = getFishingBait(profile.activeBaitKey);
    const baitRow = activeBait
      ? await tx.fishingItem.findUnique({
        where: { userId_guildId_itemKey: { userId, guildId, itemKey: activeBait.key } },
      })
      : null;
    const bait = activeBait && baitRow?.quantity > 0 ? activeBait : null;
    const rod = ROD_BY_KEY.get(profile.rodKey) ?? RODS[0];
    const outcome = chooseOutcome(rod.luck, profile.sealBlessing, spot, condition, bait);
    if (outcome.type === 'treasure') outcome.treasure = chooseTreasure();
    const updateData = {
      lastFishing: new Date(now),
      sealBlessing: false,
      selectedSpotKey: spot.key,
      ...missionUpdateData(profile, userId, guildId, outcome, now),
    };

    if (outcome.type === 'seal') {
      updateData.sealBlessing = true;
    }
    if (outcome.type === 'angry_shark') {
      updateData.sharkBattleHp = SHARK_BATTLE_START_HP;
      updateData.sharkBattleReward = Math.floor(
        SHARK_REWARD_MIN + Math.random() * (SHARK_REWARD_MAX - SHARK_REWARD_MIN + 1),
      );
    }
    if (outcome.type === 'catch' && outcome.fish.key !== 'carpa_lendaria') {
      updateData.totalCaught = { increment: 1 };
    }
    if (outcome.type === 'legendary') {
      updateData.legendaryBattleUserId = userId;
      updateData.legendaryBattleRound = 1;
      updateData.legendaryBattleChoice = outcome.choice;
      updateData.legendaryBattleExpiresAt = new Date(now + LEGENDARY_BATTLE_MS);
    }
    if (bait && baitRow.quantity <= 1) updateData.activeBaitKey = null;

    await tx.fishingProfile.update({
      where: { userId_guildId: { userId, guildId } },
      data: updateData,
    });

    if (outcome.type === 'catch') {
      if (outcome.fish.key === 'tubarao_comum') {
        await tx.economy.upsert({
          where: { userId_guildId: { userId, guildId } },
          create: { userId, guildId, balance: outcome.fish.value },
          update: { balance: { increment: outcome.fish.value } },
        });
      } else {
        await tx.fishingCatch.upsert({
          where: { userId_guildId_fishKey: { userId, guildId, fishKey: outcome.fish.key } },
          create: { userId, guildId, fishKey: outcome.fish.key, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
      }
    }
    if (bait) {
      await tx.fishingItem.update({
        where: { userId_guildId_itemKey: { userId, guildId, itemKey: bait.key } },
        data: { quantity: { decrement: 1 } },
      });
    }
    if (outcome.type === 'treasure') {
      if (outcome.treasure.kind === 'coins') {
        await tx.economy.upsert({
          where: { userId_guildId: { userId, guildId } },
          create: { userId, guildId, balance: outcome.treasure.amount },
          update: { balance: { increment: outcome.treasure.amount } },
        });
      } else {
        await tx.fishingItem.upsert({
          where: { userId_guildId_itemKey: { userId, guildId, itemKey: outcome.treasure.baitKey } },
          create: { userId, guildId, itemKey: outcome.treasure.baitKey, quantity: outcome.treasure.quantity },
          update: { quantity: { increment: outcome.treasure.quantity } },
        });
      }
    }

    return {
      outcome,
      rod,
      spot,
      condition,
      bait,
      battleReward: updateData.sharkBattleReward ?? 0,
      coinReward: outcome.type === 'catch' && outcome.fish.key === 'tubarao_comum'
        ? outcome.fish.value
        : 0,
    };
  });
}

async function getInventory(userId, guildId) {
  const [profile, catches, items] = await Promise.all([
    getFishingProfile(userId, guildId),
    prisma.fishingCatch.findMany({ where: { userId, guildId, quantity: { gt: 0 } } }),
    prisma.fishingItem.findMany({ where: { userId, guildId, quantity: { gt: 0 } } }),
  ]);
  return { profile, catches, items };
}

function buildInventoryText(userId, guildId, { profile, catches, items = [] }) {
  const rod = ROD_BY_KEY.get(profile.rodKey) ?? RODS[0];
  const spot = getFishingSpot(profile.selectedSpotKey);
  const condition = getFishingCondition(guildId);
  const activeBait = items.some(item => item.itemKey === profile.activeBaitKey)
    ? getFishingBait(profile.activeBaitKey)
    : null;
  const lines = catches
    .map(row => {
      const fish = FISH_BY_KEY.get(row.fishKey);
      return fish ? formatFish(fish, row.quantity) : null;
    })
    .filter(Boolean);
  const estimated = catches.reduce((sum, row) => {
    const fish = FISH_BY_KEY.get(row.fishKey);
    return sum + (fish?.sellable === false ? 0 : fish?.value ?? 0) * row.quantity;
  }, 0);
  const baitLines = items
    .map(row => {
      const bait = getFishingBait(row.itemKey);
      return bait ? `${bait.emoji} **${bait.name}** × **${row.quantity}**${bait.key === activeBait?.key ? ' — equipada' : ''}` : null;
    })
    .filter(Boolean);
  const mission = getFishingMission(profile, userId, guildId);

  return (
    `## ${FISH_ROD()} Inventário de pesca\n` +
    `${rodEmoji(rod)} Vara equipada: **${rod.name}**\n` +
    `${spot.emoji} Ponto: **${spot.name}**\n` +
    `${condition.emoji} Maré atual: **${condition.name}**\n` +
    `${activeBait ? `${activeBait.emoji} Isca equipada: **${activeBait.name}**` : '🪱 Isca equipada: **nenhuma**'}\n` +
    `${FISH_COMMON()} Capturas totais: **${profile.totalCaught.toLocaleString('pt-BR')}**\n\n` +
    (lines.length ? lines.join('\n') : '*Seu balde está vazio. Vá pescar para começar.*') +
    `\n\n**Iscas no bolso**\n` +
    (baitLines.length ? baitLines.join('\n') : '*Você ainda não possui iscas. Visite a loja de pesca.*') +
    `\n\n**Missão de hoje**\n${mission.mission.description} — **${mission.progress}/${mission.mission.target}**` +
    `\n\n${COIN()} Valor estimado para venda: **${estimated.toLocaleString('pt-BR')}** ${COIN()}`
  );
}

function buildCollectionText(catches) {
  const owned = new Map(catches.map(row => [row.fishKey, row.quantity]));
  const lines = FISH
    .filter(fish => !fish.legacy || owned.has(fish.key))
    .map(fish => owned.has(fish.key)
      ? `✅ ${fishEmoji(fish)} **${fish.name}** × **${owned.get(fish.key)}** — ${fish.description}`
      : `⬜ ??? **${fish.name}** — ainda não descoberto`);
  const discovered = FISH.filter(fish => owned.has(fish.key)).length;
  return (
    `## 📖 Livro de pesca\n` +
    `Você descobriu **${discovered}/${FISH.length}** espécies e troféus.\n\n` +
    lines.join('\n')
  );
}

export function buildFishingSpotsPayload(currentSpotKey) {
  const current = getFishingSpot(currentSpotKey);
  const options = FISHING_SPOTS.map(spot => {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(`${spot.name}${spot.key === current.key ? ' (atual)' : ''}`)
      .setValue(`fish_spot:${spot.key}`)
      .setDescription(spot.description)
      .setEmoji(spot.emoji);
    if (spot.key === current.key) option.setDefault(true);
    return option;
  });
  return v2(
    `## 🧭 Pontos de pesca\n` +
    `Escolha onde sua próxima linha vai cair. O ponto escolhido fica salvo para as próximas pescarias.`,
    {
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('fish_spot_select')
            .setPlaceholder('Escolha um ponto de pesca')
            .addOptions(options),
        ),
      ],
    },
  );
}

export function buildFishingBaitShopPayload() {
  const options = FISHING_BAITS.map(bait => new StringSelectMenuOptionBuilder()
    .setLabel(`${bait.name} — pacote com ${bait.pack}`)
    .setValue(`fish_buybait:${bait.key}`)
    .setDescription(`${bait.price.toLocaleString('pt-BR')} coins · ${bait.description}`)
    .setEmoji(bait.emoji));
  return v2(
    `## 🪱 Loja de iscas\n` +
    `Cada pescaria consome uma unidade da isca equipada. Sem isca, você continua pescando normalmente.\n\n` +
    FISHING_BAITS.map(bait => `${bait.emoji} **${bait.name}** — ${bait.price.toLocaleString('pt-BR')} coins`).join('\n'),
    {
      ephemeral: true,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('fish_bait_buy_select')
            .setPlaceholder('Escolha um pacote de isca')
            .addOptions(options),
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('fish_bait_equip')
            .setLabel('Equipar uma isca que já tenho')
            .setEmoji('🎣')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    },
  );
}

export function buildFishingBaitEquipPayload(items, activeBaitKey = null) {
  const options = items
    .map(row => {
      const bait = getFishingBait(row.itemKey);
      if (!bait) return null;
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`${bait.name} × ${row.quantity}`)
        .setValue(`fish_equipbait:${bait.key}`)
        .setDescription(bait.description)
        .setEmoji(bait.emoji);
      if (bait.key === activeBaitKey) option.setDefault(true);
      return option;
    })
    .filter(Boolean);
  options.push(new StringSelectMenuOptionBuilder()
    .setLabel('Pescar sem isca')
    .setValue('fish_equipbait:none')
    .setDescription('Não consome itens e usa as chances normais.')
    .setEmoji('🎣'));
  return v2('## 🪱 Equipar isca\nEscolha a isca que será consumida nas próximas pescarias.', {
    ephemeral: true,
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('fish_bait_equip_select')
          .setPlaceholder('Escolha sua isca ativa')
          .addOptions(options),
      ),
    ],
  });
}

function buildDailyMissionPayload(profile, userId, guildId) {
  const state = getFishingMission(profile, userId, guildId);
  const completed = state.progress >= state.mission.target;
  const claimButton = new ButtonBuilder()
    .setCustomId('fish_mission_claim')
    .setLabel(state.claimed ? 'Recompensa resgatada' : 'Resgatar recompensa')
    .setEmoji('🎁')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!completed || state.claimed);
  return v2(
    `## 🎯 Missão de pesca\n` +
    `**${state.mission.name}**\n` +
    `${state.mission.description}\n\n` +
    `Progresso: **${state.progress}/${state.mission.target}**\n` +
    `Recompensa: **${state.mission.reward.toLocaleString('pt-BR')}** ${COIN()}`,
    { ephemeral: true, components: [new ActionRowBuilder().addComponents(claimButton)] },
  );
}

export function buildFishingShopPayload() {
  const container = new ContainerBuilder()
    .setAccentColor(0x147d92)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${FISH_ROD()} Loja de pesca\n\n` +
      `Compre uma vara melhor para aumentar suas chances de capturar peixes raros.\n` +
      `Os peixes ficam no seu balde até você decidir vender.\n\n` +
      `**Como funciona**\n` +
      `\`/pescar\` → uma pescaria a cada 1 minuto\n` +
      `\`/pesca inventario\` → veja suas capturas\n` +
      `\`/pesca vender\` → transforme peixes em ${COIN()}\n` +
      `\`/pesca iscas\` → compre e equipe iscas\n` +
      `\`/pesca pontos\` → escolha seu ponto de pesca\n` +
      `\`/pesca colecao\` → complete o livro de espécies\n` +
      `\`/pesca missoes\` → resgate sua missão diária`
    ));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fish_buy').setLabel('Comprar vara').setEmoji(FISH_ROD()).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('fish_bait_shop').setLabel('Comprar iscas').setEmoji('🪱').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('fish_spots').setLabel('Pontos de pesca').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fish_collection').setLabel('Livro de pesca').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fish_missions').setLabel('Missão diária').setEmoji('🎯').setStyle(ButtonStyle.Success),
  );
  const secondaryButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fish_sell').setLabel('Vender peixes').setEmoji(FISH_COMMON()).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('fish_inventory').setLabel('Meu inventário').setEmoji(FISH_COMMON()).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fish_bait_equip').setLabel('Equipar isca').setEmoji('🪱').setStyle(ButtonStyle.Secondary),
  );
  return { components: [container, buttons, secondaryButtons], flags: MessageFlags.IsComponentsV2 };
}

export function buildRodSelectPayload(currentRodKey) {
  const options = RODS
    .filter(rod => RODS.findIndex(item => item.key === rod.key) >= RODS.findIndex(item => item.key === currentRodKey))
    .map(rod => {
      const owned = rod.key === currentRodKey;
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(`${rod.name}${owned ? ' (equipada)' : ''}`)
        .setValue(`fish_buyrod:${rod.key}`)
        .setDescription(owned ? 'Você já possui esta vara.' : `${rod.price.toLocaleString('pt-BR')} coins · ${rod.description}`)
        .setEmoji(rodEmoji(rod));
      if (owned) option.setDefault(true);
      return option;
    });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('fish_rod_select')
    .setPlaceholder('Escolha uma vara para comprar')
    .addOptions(options);
  return v2(`## ${FISH_ROD()} Escolha sua vara\nVaras melhores aumentam as chances de peixes raros.`, {
    ephemeral: true,
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

export function buildFishSellSelectPayload(catches) {
  const options = catches
    .map(row => {
      const fish = FISH_BY_KEY.get(row.fishKey);
      if (!fish || fish.sellable === false) return null;
      return new StringSelectMenuOptionBuilder()
        .setLabel(`${fish.name} × ${row.quantity}`)
        .setValue(`fish_sellfish:${fish.key}`)
        .setDescription(`Vender tudo por ${(fish.value * row.quantity).toLocaleString('pt-BR')} coins`)
        .setEmoji(fishEmoji(fish));
    })
    .filter(Boolean);
  if (options.length) {
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel('Vender tudo')
        .setValue('fish_sellfish:all')
        .setDescription('Vende todos os peixes vendáveis do seu balde'),
    );
  }
  if (!options.length) return fishingError('Você só possui escamas lendárias. Elas são troféus e não podem ser vendidas.');
  const menu = new StringSelectMenuBuilder()
    .setCustomId('fish_sell_select')
    .setPlaceholder('Escolha o que deseja vender')
    .addOptions(options);
  return v2(`## ${COIN()} Venda de peixes\nEscolha uma espécie ou venda todo o conteúdo do seu balde.`, {
    ephemeral: true,
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

function buildFishAbilityComponents(fish, userId) {
  const ability = FISH_ABILITIES[fish.ability];
  if (!ability) return [];

  const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const button = new ButtonBuilder()
    .setCustomId(`fish_ability:${userId}:${fish.key}:${token}`)
    .setLabel(ability.label)
    .setEmoji(ability.emoji)
    .setStyle(ButtonStyle.Primary);

  return [new ActionRowBuilder().addComponents(button)];
}

async function sellFish(userId, guildId, fishKey = 'all') {
  return prisma.$transaction(async tx => {
    const rows = await tx.fishingCatch.findMany({
      where: { userId, guildId, quantity: { gt: 0 }, ...(fishKey === 'all' ? {} : { fishKey }) },
    });
    if (!rows.length) return { amount: 0, count: 0 };

    let amount = 0;
    let count = 0;
    for (const row of rows) {
      const fish = FISH_BY_KEY.get(row.fishKey);
      if (!fish || fish.sellable === false) continue;
      amount += fish.value * row.quantity;
      count += row.quantity;
      await tx.fishingCatch.update({
        where: { userId_guildId_fishKey: { userId, guildId, fishKey: row.fishKey } },
        data: { quantity: 0 },
      });
    }
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: amount },
      update: { balance: { increment: amount } },
    });
    return { amount, count };
  });
}

async function claimFishingMission(userId, guildId) {
  return prisma.$transaction(async tx => {
    const profile = await getFishingProfile(userId, guildId, tx);
    const state = getFishingMission(profile, userId, guildId);
    if (state.claimed) return { status: 'claimed', mission: state.mission };
    if (state.progress < state.mission.target) {
      return { status: 'incomplete', mission: state.mission, progress: state.progress };
    }
    const claim = await tx.fishingProfile.updateMany({
      where: {
        userId,
        guildId,
        dailyMissionDate: state.date,
        dailyMissionKey: state.mission.key,
        dailyMissionProgress: { gte: state.mission.target },
        dailyMissionClaimed: false,
      },
      data: { dailyMissionClaimed: true },
    });
    if (!claim.count) return { status: 'claimed', mission: state.mission };
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: state.mission.reward },
      update: { balance: { increment: state.mission.reward } },
    });
    return { status: 'claimed', mission: state.mission };
  });
}

export async function handleFishingInteraction(interaction) {
  const { customId } = interaction;
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (customId.startsWith('fish_ability:')) {
    return handleFishAbility(interaction);
  }

  if (customId === 'fish_shop') {
    return interaction.reply(buildFishingShopPayload());
  }

  if (customId === 'fish_inventory') {
    const inventory = await getInventory(userId, guildId);
    return interaction.reply(v2(buildInventoryText(userId, guildId, inventory), { ephemeral: true }));
  }

  if (customId === 'fish_collection') {
    const catches = await prisma.fishingCatch.findMany({ where: { userId, guildId, quantity: { gt: 0 } } });
    return interaction.reply(v2(buildCollectionText(catches), { ephemeral: true }));
  }

  if (customId === 'fish_missions') {
    const profile = await getFishingProfile(userId, guildId);
    return interaction.reply(buildDailyMissionPayload(profile, userId, guildId));
  }

  if (customId === 'fish_mission_claim') {
    const result = await claimFishingMission(userId, guildId);
    if (result.status === 'incomplete') {
      return interaction.update(fishingUpdateError(`Sua missão ainda está em **${result.progress}/${result.mission.target}**.`));
    }
    if (result.status === 'claimed') {
      return interaction.update(v2(
        `## 🎁 Recompensa resgatada!\n` +
        `Você recebeu **${result.mission.reward.toLocaleString('pt-BR')}** ${COIN()} pela missão **${result.mission.name}**.`,
        { ephemeral: true },
      ));
    }
  }

  if (customId === 'fish_bait_shop') {
    return interaction.reply(buildFishingBaitShopPayload());
  }

  if (customId === 'fish_bait_equip') {
    const { profile, items } = await getInventory(userId, guildId);
    return interaction.reply(buildFishingBaitEquipPayload(items, profile.activeBaitKey));
  }

  if (customId === 'fish_spots') {
    const profile = await getFishingProfile(userId, guildId);
    return interaction.reply(buildFishingSpotsPayload(profile.selectedSpotKey));
  }

  if (customId === 'fish_buy') {
    const profile = await getFishingProfile(userId, guildId);
    return interaction.reply(buildRodSelectPayload(profile.rodKey));
  }

  if (customId === 'fish_sell') {
    const { catches } = await getInventory(userId, guildId);
    if (!catches.some(row => FISH_BY_KEY.get(row.fishKey)?.sellable !== false)) {
      return interaction.reply(fishingError('Você não possui peixes vendáveis. As escamas lendárias ficam como troféu.'));
    }
    return interaction.reply(buildFishSellSelectPayload(catches));
  }

  if (customId === 'fish_shark_attack') {
    return handleSharkAttack(interaction);
  }

  if (customId.startsWith('fish_legendary_choice:')) {
    return handleLegendaryChoice(interaction, customId.split(':')[1]);
  }

  if (customId === 'fish_spot_select') {
    const spotKey = interaction.values[0].replace('fish_spot:', '');
    const spot = FISHING_SPOTS.find(item => item.key === spotKey);
    if (!spot) return interaction.update(fishingUpdateError('Esse ponto de pesca não existe.'));
    await prisma.fishingProfile.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, selectedSpotKey: spot.key },
      update: { selectedSpotKey: spot.key },
    });
    return interaction.update(await fishingArtworkPayload(
      `## ${spot.emoji} Ponto escolhido!\nSua próxima pescaria será no **${spot.name}**.\n\n${spot.description}\n\nA paisagem deste ponto foi salva para as próximas capturas.`,
      null,
      [],
      { ephemeral: true, large: true, scene: spot.scene },
    ));
  }

  if (customId === 'fish_bait_buy_select') {
    const baitKey = interaction.values[0].replace('fish_buybait:', '');
    const bait = getFishingBait(baitKey);
    if (!bait) return interaction.update(fishingUpdateError('Essa isca não existe.'));
    const result = await prisma.$transaction(async tx => {
      const economy = await tx.economy.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId },
        update: {},
      });
      if (economy.balance < bait.price) return { status: 'funds', balance: economy.balance };
      await tx.economy.update({
        where: { userId_guildId: { userId, guildId } },
        data: { balance: { decrement: bait.price } },
      });
      await tx.fishingItem.upsert({
        where: { userId_guildId_itemKey: { userId, guildId, itemKey: bait.key } },
        create: { userId, guildId, itemKey: bait.key, quantity: bait.pack },
        update: { quantity: { increment: bait.pack } },
      });
      return { status: 'bought' };
    });
    if (result.status === 'funds') {
      return interaction.update(fishingUpdateError(`Saldo insuficiente. Você tem **${result.balance.toLocaleString('pt-BR')}** ${COIN()}.`));
    }
    return interaction.update(v2(
      `## ${bait.emoji} Isca comprada!\nVocê recebeu **${bait.pack}x ${bait.name}**.\n\n${bait.description}\n\nUse **Equipar isca** para ativá-la.`,
      { ephemeral: true },
    ));
  }

  if (customId === 'fish_bait_equip_select') {
    const baitKey = interaction.values[0].replace('fish_equipbait:', '');
    if (baitKey !== 'none') {
      const bait = getFishingBait(baitKey);
      const item = await prisma.fishingItem.findUnique({
        where: { userId_guildId_itemKey: { userId, guildId, itemKey: baitKey } },
      });
      if (!bait || !item?.quantity) return interaction.update(fishingUpdateError('Você não possui essa isca.'));
      await prisma.fishingProfile.upsert({
        where: { userId_guildId: { userId, guildId } },
        create: { userId, guildId, activeBaitKey: baitKey },
        update: { activeBaitKey: baitKey },
      });
      return interaction.update(v2(`## ${bait.emoji} Isca equipada!\nA próxima pescaria consumirá uma unidade de **${bait.name}**.`, { ephemeral: true }));
    }
    await prisma.fishingProfile.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId },
      update: { activeBaitKey: null },
    });
    return interaction.update(v2('## 🎣 Isca removida!\nVocê voltará a pescar usando as chances normais.', { ephemeral: true }));
  }

  if (customId === 'fish_rod_select' || customId === 'fish_sell_select') {
    const value = interaction.values[0];
    if (customId === 'fish_rod_select') {
      const rodKey = value.replace('fish_buyrod:', '').replace('buyrod:', '');
      const rod = ROD_BY_KEY.get(rodKey);
      if (!rod) return interaction.update(fishingUpdateError('Essa vara não existe.'));

      const result = await prisma.$transaction(async tx => {
        const profile = await getFishingProfile(userId, guildId, tx);
        if (profile.rodKey === rod.key) return { status: 'owned' };
        const previousIndex = RODS.findIndex(item => item.key === profile.rodKey);
        const nextIndex = RODS.findIndex(item => item.key === rod.key);
        if (nextIndex <= previousIndex) return { status: 'owned' };
        const economy = await tx.economy.upsert({
          where: { userId_guildId: { userId, guildId } },
          create: { userId, guildId },
          update: {},
        });
        if (economy.balance < rod.price) return { status: 'funds', balance: economy.balance };
        await tx.economy.update({
          where: { userId_guildId: { userId, guildId } },
          data: { balance: { decrement: rod.price } },
        });
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId, guildId } },
          data: { rodKey: rod.key },
        });
        return { status: 'bought' };
      });

      if (result.status === 'owned') return interaction.update(fishingUpdateError('Você já possui essa vara ou uma melhor.'));
      if (result.status === 'funds') return interaction.update(fishingUpdateError(`Saldo insuficiente. Você tem **${result.balance.toLocaleString('pt-BR')}** ${COIN()}.`));
    return interaction.update(v2(`## ${rodEmoji(rod)} Vara comprada\n${rodEmoji(rod)} Você equipou a **${rod.name}**!\n\n${rod.description}`, { ephemeral: true }));
    }

    const fishKey = value.replace('fish_sellfish:', '').replace('sellfish:', '');
    const result = await sellFish(userId, guildId, fishKey);
    if (!result.count) return interaction.update(fishingUpdateError('Você não possui esses peixes para vender.'));
    return interaction.update(v2(
      `## ${COIN()} Venda concluída\n${FISH_COMMON()} **${result.count}** peixe(s) vendido(s)\n${COIN()} **+${result.amount.toLocaleString('pt-BR')}** adicionados à sua carteira.`,
      { ephemeral: true },
    ));
  }
}

function sharkBattlePayload({ hp, reward, defeated = false }) {
  const attackButton = new ButtonBuilder()
    .setCustomId('fish_shark_attack')
    .setLabel('Atacar o tubarão')
    .setEmoji(FISH_SHARK())
    .setStyle(ButtonStyle.Danger)
    .setDisabled(defeated);

  if (defeated) {
    return {
      text:
        `## ${FISH_SHARK()} Tubarão raivoso derrotado!\n` +
        `Você recebeu **${reward.toLocaleString('pt-BR')}** ${COIN()} e uma ${FISH_LEGENDARY()} **Escama lendária**.\n` +
        `A escama foi guardada no seu inventário como troféu.`,
      artwork: 'angryShark',
      components: [new ActionRowBuilder().addComponents(attackButton)],
    };
  }

  return {
    text:
      `## ${FISH_SHARK()} Tubarão raivoso!\n` +
      `Ele apareceu na sua linha. Ataque até reduzir a vida dele a zero para ganhar uma bolada de coins e uma escama lendária.\n\n` +
      `${FISH_SHARK()} Vida do tubarão: **${hp}/${SHARK_BATTLE_START_HP}**\n` +
      `${COIN()} Recompensa: até **${reward.toLocaleString('pt-BR')}** ${COIN()} + ${FISH_LEGENDARY()} escama lendária`,
    artwork: 'angryShark',
    components: [new ActionRowBuilder().addComponents(attackButton)],
  };
}

function legendaryBattlePayload(round) {
  const roundText = round > LEGENDARY_ROUNDS
    ? 'A carpa foi fisgada!'
    : `**Rodada ${round}/${LEGENDARY_ROUNDS}** — escolha onde a carpa vai morder:`;
  const choices = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('fish_legendary_choice:left')
      .setLabel('Esquerda')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(round > LEGENDARY_ROUNDS),
    new ButtonBuilder()
      .setCustomId('fish_legendary_choice:center')
      .setLabel('Centro')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(round > LEGENDARY_ROUNDS),
    new ButtonBuilder()
      .setCustomId('fish_legendary_choice:right')
      .setLabel('Direita')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(round > LEGENDARY_ROUNDS),
  );
  return {
    text:
      `## ${FISH_LEGENDARY()} Carpa lendária apareceu!\n` +
      `A bênção da foca trouxe uma oportunidade única. Acerte as duas rodadas para fisgá-la — se errar, ela escapa.\n\n` +
      `${roundText}`,
    artwork: 'legendary',
    components: [choices],
  };
}

async function fishingArtworkPayload(text, artwork, components = [], { large = false, scene = 'default' } = {}) {
  const artworkBuffer = artwork
    ? await composeFishingArtwork(artwork, scene)
    : await composeFishingScene(scene);
  const file = new AttachmentBuilder(artworkBuffer, {
    name: 'fishing-result.png',
  });
  const container = new ContainerBuilder();
  if (large) {
    container
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://fishing-result.png'),
        ),
      );
  } else {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL('attachment://fishing-result.png'));
    container.addSectionComponents(section);
  }
  return {
    components: [container, ...components],
    files: [file],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function handleLegendaryChoice(interaction, choice) {
  if (!LEGENDARY_CHOICES.includes(choice)) {
    return interaction.reply(fishingError('Essa escolha de posição não existe.'));
  }

  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const result = await prisma.$transaction(async tx => {
    const profile = await getFishingProfile(userId, guildId, tx);
    const now = Date.now();

    if (!profile.legendaryBattleUserId) return { status: 'missing' };
    if (profile.legendaryBattleExpiresAt?.getTime() <= now) {
      await tx.fishingProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: {
          legendaryBattleUserId: null,
          legendaryBattleRound: 0,
          legendaryBattleChoice: null,
          legendaryBattleExpiresAt: null,
        },
      });
      return { status: 'expired' };
    }
    if (profile.legendaryBattleUserId !== userId) return { status: 'owner' };

    const target = profile.legendaryBattleChoice ?? LEGENDARY_CHOICES[Math.floor(Math.random() * LEGENDARY_CHOICES.length)];
    if (choice !== target) {
      await tx.fishingProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: {
          legendaryBattleUserId: null,
          legendaryBattleRound: 0,
          legendaryBattleChoice: null,
          legendaryBattleExpiresAt: null,
        },
      });
      return { status: 'failed', choice, target };
    }

    if (profile.legendaryBattleRound < LEGENDARY_ROUNDS) {
      await tx.fishingProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: {
          legendaryBattleRound: { increment: 1 },
          legendaryBattleChoice: LEGENDARY_CHOICES[Math.floor(Math.random() * LEGENDARY_CHOICES.length)],
        },
      });
      return { status: 'round', round: profile.legendaryBattleRound + 1 };
    }

    await tx.fishingProfile.update({
      where: { userId_guildId: { userId, guildId } },
      data: {
        legendaryBattleUserId: null,
        legendaryBattleRound: 0,
        legendaryBattleChoice: null,
        legendaryBattleExpiresAt: null,
        totalCaught: { increment: 1 },
      },
    });
    await tx.fishingCatch.upsert({
      where: { userId_guildId_fishKey: { userId, guildId, fishKey: 'carpa_lendaria' } },
      create: { userId, guildId, fishKey: 'carpa_lendaria', quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    return { status: 'caught' };
  });

  if (result.status === 'missing') {
    return interaction.update(fishingUpdateError('A carpa lendária não está mais na sua linha.'));
  }
  if (result.status === 'owner') {
    return interaction.reply(fishingError('Somente o membro que encontrou a carpa pode jogar esta tentativa.'));
  }
  if (result.status === 'expired') {
    return interaction.update(fishingUpdateError('A carpa lendária escapou porque a tentativa expirou.'));
  }
  if (result.status === 'failed') {
    return interaction.update(await fishingArtworkPayload(
      `## ${FISH_LEGENDARY()} A carpa lendária escapou!\n` +
      `Você escolheu uma posição errada e perdeu esta oportunidade. A bênção da foca foi consumida.\n\n` +
       `${FISH_ROD()} Você poderá pescar novamente em **1 minuto**.`,
      'legendary',
      [],
      { large: true },
    ));
  }
  if (result.status === 'round') {
    const battle = legendaryBattlePayload(result.round);
    return interaction.update(await fishingArtworkPayload(
      `${battle.text}\n\n${FISH_LEGENDARY()} Boa! A carpa mordeu a isca. Tente a próxima rodada.`,
      battle.artwork,
      battle.components,
      { large: true },
    ));
  }

  return interaction.update(await fishingArtworkPayload(
    `## ${FISH_LEGENDARY()} Carpa lendária fisgada!\n` +
    `Você venceu a tentativa especial e guardou a captura no seu inventário.\n\n` +
    `${COIN()} Valor de venda: **2.400** ${COIN()}\n` +
       `${FISH_ROD()} Próxima pescaria em **1 minuto**.`,
    'legendary',
    [],
    { large: true },
  ));
}

async function handleSharkAttack(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guildId;
  const result = await prisma.$transaction(async tx => {
    const profile = await getFishingProfile(userId, guildId, tx);
    if (profile.sharkBattleHp <= 0) return { status: 'missing' };

    const damage = Math.floor(Math.random() * 3) + 2;
    const nextHp = Math.max(0, profile.sharkBattleHp - damage);
    if (nextHp > 0) {
      await tx.fishingProfile.update({
        where: { userId_guildId: { userId, guildId } },
        data: { sharkBattleHp: nextHp },
      });
      return { status: 'ongoing', hp: nextHp, reward: profile.sharkBattleReward, damage };
    }

    const reward = profile.sharkBattleReward;
    await tx.fishingProfile.update({
      where: { userId_guildId: { userId, guildId } },
      data: { sharkBattleHp: 0, sharkBattleReward: 0 },
    });
    await tx.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, balance: reward },
      update: { balance: { increment: reward } },
    });
    await tx.fishingCatch.upsert({
      where: { userId_guildId_fishKey: { userId, guildId, fishKey: 'escama_lendaria' } },
      create: { userId, guildId, fishKey: 'escama_lendaria', quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    return { status: 'defeated', reward, damage };
  });

  if (result.status === 'missing') {
    return interaction.update(fishingUpdateError('Esse tubarão já foi derrotado ou não está mais na sua linha.'));
  }
  const battle = result.status === 'defeated'
    ? sharkBattlePayload({ defeated: true, reward: result.reward })
    : sharkBattlePayload({ hp: result.hp, reward: result.reward });
  return interaction.update(await fishingArtworkPayload(
    `${battle.text}\n\n${FISH_SHARK()} Você causou **${result.damage}** de dano.`,
    battle.artwork,
    battle.components,
  ));
}

async function handleFishAbility(interaction) {
  const [, ownerId, fishKey, token] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    return interaction.reply(fishingError('Essa interação pertence a quem fisgou o peixe.'));
  }

  const fish = FISH_BY_KEY.get(fishKey);
  const ability = fish ? FISH_ABILITIES[fish.ability] : null;
  if (!fish || !ability || !token) {
    return interaction.reply(fishingError('Essa habilidade de pesca não existe mais.'));
  }

  if (fishAbilityClaims.has(token)) {
    return interaction.reply(fishingError('Esse peixe já usou sua habilidade nesta pescaria.'));
  }
  fishAbilityClaims.set(token, Date.now());
  setTimeout(() => fishAbilityClaims.delete(token), 15 * 60 * 1000).unref?.();

  try {
    const result = await prisma.$transaction(async tx => {
      const profile = await getFishingProfile(ownerId, interaction.guildId, tx);
      const scene = getFishingSpot(profile.selectedSpotKey).scene;
      const caught = await tx.fishingCatch.findUnique({
        where: { userId_guildId_fishKey: { userId: ownerId, guildId: interaction.guildId, fishKey } },
      });
      if (!caught?.quantity) return { status: 'missing', scene };

      if (fish.ability === 'piranha') {
        const bonus = 180;
        await tx.economy.upsert({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          create: { userId: ownerId, guildId: interaction.guildId, balance: bonus },
          update: { balance: { increment: bonus } },
        });
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
        });
        return { status: 'piranha', bonus, scene };
      }

      if (fish.ability === 'betta') {
        if (profile.sealBlessing) return { status: 'already_blessed', scene };
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: {
            sealBlessing: true,
            ...missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
          },
        });
        return { status: 'betta', scene };
      }

      if (fish.ability === 'marlin' || fish.ability === 'turtle') {
        const waitMs = fish.ability === 'turtle' ? 20 * 1000 : 15 * 1000;
        const nextFishingAt = new Date(Date.now() - (FISH_CD - waitMs));
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: {
            lastFishing: profile.lastFishing && profile.lastFishing < nextFishingAt
              ? profile.lastFishing
              : nextFishingAt,
            ...missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
          },
        });
        return { status: fish.ability, waitMs, scene };
      }

      if (fish.ability === 'lobster') {
        const bonus = 350;
        await tx.economy.upsert({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          create: { userId: ownerId, guildId: interaction.guildId, balance: bonus },
          update: { balance: { increment: bonus } },
        });
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
        });
        return { status: 'lobster', bonus, scene };
      }

      if (fish.ability === 'starfish') {
        if (profile.sealBlessing) return { status: 'already_blessed', scene };
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: {
            sealBlessing: true,
            ...missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
          },
        });
        return { status: 'starfish', scene };
      }

      if (fish.ability === 'octopus' || fish.ability === 'orca') {
        const bait = fish.ability === 'octopus'
          ? getFishingBait(['brilhante', 'eletrica'][Math.floor(Math.random() * 2)])
          : getFishingBait('brilhante');
        const bonus = fish.ability === 'orca' ? 1200 : 0;
        if (bonus) {
          await tx.economy.upsert({
            where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
            create: { userId: ownerId, guildId: interaction.guildId, balance: bonus },
            update: { balance: { increment: bonus } },
          });
        }
        await tx.fishingItem.upsert({
          where: { userId_guildId_itemKey: { userId: ownerId, guildId: interaction.guildId, itemKey: bait.key } },
          create: { userId: ownerId, guildId: interaction.guildId, itemKey: bait.key, quantity: 1 },
          update: { quantity: { increment: 1 } },
        });
        await tx.fishingProfile.update({
          where: { userId_guildId: { userId: ownerId, guildId: interaction.guildId } },
          data: missionUpdateData(profile, ownerId, interaction.guildId, null, Date.now(), 'ability'),
        });
        return { status: fish.ability, bait, bonus, scene };
      }

      return { status: 'unknown', scene };
    });

    if (result.status === 'missing') {
      return interaction.update(fishingUpdateError('Esse peixe não está mais no seu balde.'));
    }

    let text;
    if (result.status === 'piranha') {
      text = `## 🩸 Mordida domada!\nA **${fish.name}** respeitou sua coragem e deixou uma gorjeta de **+${result.bonus.toLocaleString('pt-BR')}** ${COIN()} na sua carteira.\n\nEla continua no seu balde — hoje vocês fizeram as pazes.`;
    } else if (result.status === 'already_blessed') {
      text = `## ✨ ${fish.name} já estava brilhando!\nA próxima pescaria já tinha uma bênção guardada. O animal fez uma festa extra e ficou todo convencido.`;
    } else if (result.status === 'betta') {
      text = `## ✨ Dança do Betta de Fogo!\nAs nadadeiras do **${fish.name}** chamaram a foca lendária. Sua próxima pescaria terá uma oportunidade garantida de carpa lendária.`;
    } else if (result.status === 'marlin') {
      text = `## ⚡ Carona no Agulhão Neon!\nO **${fish.name}** puxou sua linha pela correnteza. A próxima espera foi reduzida para **15 segundos**.`;
    } else if (result.status === 'turtle') {
      text = `## 🛡️ Casco protetor ativado!\nA **${fish.name}** abriu uma corrente tranquila. Sua próxima espera foi reduzida para **20 segundos**.`;
    } else if (result.status === 'lobster') {
      text = `## 🦞 Pinça da sorte!\nA **${fish.name}** respeitou sua coragem e deixou uma gorjeta de **+${result.bonus.toLocaleString('pt-BR')}** ${COIN()} na sua carteira.`;
    } else if (result.status === 'starfish') {
      text = `## 🌟 Pedido realizado!\nA **${fish.name}** brilhou no seu balde. Sua próxima pescaria terá uma oportunidade garantida de carpa lendária.`;
    } else if (result.status === 'octopus') {
      text = `## 🐙 Oito tentáculos, uma descoberta!\nO **${fish.name}** encontrou uma **${result.bait.name}** escondida entre as pedras e guardou a isca no seu bolso.`;
    } else if (result.status === 'orca') {
      text = `## 🌊 Chamado da matilha!\nA **${fish.name}** chamou a maré inteira. Você recebeu **+${result.bonus.toLocaleString('pt-BR')}** ${COIN()} e uma **${result.bait.name}**.`;
    } else {
      text = '## 🌊 A habilidade se perdeu na correnteza!\nO animal escapou antes de completar a interação.';
    }

    return interaction.update(await fishingArtworkPayload(text, fish.artwork, [], { large: true, scene: result.scene }));
  } catch (error) {
    fishAbilityClaims.delete(token);
    console.error('[PESCA HABILIDADE]', error);
    return interaction.update(fishingUpdateError('A habilidade escapou junto com a maré. Tente novamente.'));
  }
}

async function executeFishing(userId, guildId, isAdmin, reply, requestedSpotKey = null) {
  try {
    const result = await catchFish(userId, guildId, isAdmin, requestedSpotKey);
    const { outcome, rod, spot, condition, bait } = result;
    const contextText =
      `${spot.emoji} Ponto: **${spot.name}** · ${condition.emoji} **${condition.name}**\n` +
      `${bait ? `${bait.emoji} Isca usada: **${bait.name}**` : '🎣 Sem isca equipada'}`;
    if (outcome.type === 'seal') {
      return reply(await fishingArtworkPayload(
        `## ${FISH_SEAL()} Uma foca apareceu!\n` +
        `Ela encontrou você no mar e avisou que um **peixe lendário virá na sua próxima pescaria**.\n\n` +
        `${rodEmoji(rod)} Vara usada: **${rod.name}**\n` +
        `${contextText}\n` +
        `${FISH_ROD()} A bênção da foca está guardada. Próxima pescaria em **${fishingCooldownLabel(condition)}**.`,
        'seal',
        [],
        { large: true, scene: spot.scene },
      ));
    }
    if (outcome.type === 'legendary') {
      const battle = legendaryBattlePayload(1);
      return reply(await fishingArtworkPayload(`${battle.text}\n\n${contextText}`, battle.artwork, battle.components, { large: true, scene: spot.scene }));
    }
    if (outcome.type === 'angry_shark') {
      const battle = sharkBattlePayload({
        hp: SHARK_BATTLE_START_HP,
        reward: result.battleReward,
      });
      return reply(await fishingArtworkPayload(`${battle.text}\n\n${contextText}`, battle.artwork, battle.components, { large: true, scene: spot.scene }));
    }
    if (outcome.type === 'treasure') {
      const treasure = outcome.treasure;
      const rewardText = treasure.kind === 'coins'
        ? `Você encontrou **${treasure.amount.toLocaleString('pt-BR')}** ${COIN()}`
        : `Você encontrou **${treasure.quantity}x ${getFishingBait(treasure.baitKey)?.name ?? treasure.name}**`;
      return reply(await fishingArtworkPayload(
        `## ${treasure.emoji} Tesouro encontrado!\n` +
        `A linha puxou algo que não era peixe: **${treasure.name}**.\n\n` +
        `${rewardText}.\n${contextText}\n\n` +
        `A maré muda em **1 hora**. Volte para descobrir o próximo evento.`,
        'treasure',
        [],
        { large: true, scene: spot.scene },
      ));
    }

    const fish = outcome.fish;
    const ability = FISH_ABILITIES[fish.ability];
    const sharkCoins = result.coinReward
      ? `\n${COIN()} O tubarão trouxe **${result.coinReward.toLocaleString('pt-BR')}** ${COIN()} direto para sua carteira!`
      : `\n${COIN()} Valor de venda: **${fish.value.toLocaleString('pt-BR')}** ${COIN()}`;
    return reply(await fishingArtworkPayload(
      `## ${FISH_ROD()} Pescaria concluída!\n` +
      `${fishEmoji(fish)} Você pescou um **${fish.name}**!\n` +
      `${rodEmoji(rod)} Vara usada: **${rod.name}**\n` +
      `${contextText}\n` +
      sharkCoins + `\n\n` +
      `Use **/pesca vender** quando quiser trocar seus peixes por coins.\n` +
       `${FISH_ROD()} Próxima pescaria em **${fishingCooldownLabel(condition)}**.` +
       (ability ? `\n\n${ability.hint}` : ''),
      fish.artwork,
      buildFishAbilityComponents(fish, userId),
       { large: true, scene: spot.scene },
    ));
  } catch (error) {
    if (error?.message === 'cooldown') return reply(fishingError(`A maré ainda não virou. Aguarde **${msToHuman(error.remaining)}** para pescar novamente.`));
    if (error?.message === 'shark_battle') {
      return reply(fishingError('O tubarão raivoso ainda está na sua linha. Use o botão de ataque para derrotá-lo antes de pescar novamente.'));
    }
    if (error?.message === 'legendary_battle') {
      return reply(fishingError('A carpa lendária ainda está na sua linha. Use os botões da tentativa especial antes de pescar novamente.'));
    }
    console.error('[PESCA]', error);
    return reply(fishingError('A linha arrebentou. Tente novamente em instantes.'));
  }
}

const cmdPescar = {
  data: new SlashCommandBuilder()
    .setName('pescar')
    .setDescription('Pesque peixes para vender por coins (1 min cooldown)')
    .addStringOption(option => option
      .setName('ponto')
      .setDescription('Escolha onde jogar a linha')
      .setRequired(false)
      .addChoices(...FISHING_SPOTS.map(spot => ({ name: spot.name, value: spot.key })))),
  name: 'pescar',
  aliases: ['pesca', 'pescaria', 'fishing'],

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
    const spotKey = interaction.options.getString('ponto');
    return executeFishing(interaction.user.id, interaction.guildId, isAdmin, payload => interaction.reply(payload), spotKey);
  },

  async executePrefix(message, args) {
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) ?? false;
    return executeFishing(message.author.id, message.guildId, isAdmin, payload => message.reply(payload), args[0]?.toLowerCase());
  },
};

const cmdPesca = {
  data: new SlashCommandBuilder()
    .setName('pesca')
    .setDescription('Loja e inventário do sistema de pesca')
    .addSubcommand(s => s.setName('loja').setDescription('Abre a loja de varas'))
    .addSubcommand(s => s.setName('inventario').setDescription('Veja seus peixes e sua vara'))
    .addSubcommand(s => s.setName('vender').setDescription('Venda seus peixes por coins'))
    .addSubcommand(s => s.setName('iscas').setDescription('Compre e equipe iscas'))
    .addSubcommand(s => s.setName('pontos').setDescription('Escolha seu ponto de pesca'))
    .addSubcommand(s => s.setName('colecao').setDescription('Veja seu livro de espécies'))
    .addSubcommand(s => s.setName('missoes').setDescription('Veja e resgate sua missão diária')),
  name: 'pesca',
  aliases: ['lojapesca', 'loja-pesca'],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'loja') return interaction.reply(buildFishingShopPayload());
    if (sub === 'inventario') {
      const inventory = await getInventory(interaction.user.id, interaction.guildId);
      return interaction.reply(v2(buildInventoryText(interaction.user.id, interaction.guildId, inventory), { ephemeral: true }));
    }
    if (sub === 'iscas') return interaction.reply(buildFishingBaitShopPayload());
    if (sub === 'pontos') {
      const profile = await getFishingProfile(interaction.user.id, interaction.guildId);
      return interaction.reply(buildFishingSpotsPayload(profile.selectedSpotKey));
    }
    if (sub === 'colecao') {
      const catches = await prisma.fishingCatch.findMany({
        where: { userId: interaction.user.id, guildId: interaction.guildId, quantity: { gt: 0 } },
      });
      return interaction.reply(v2(buildCollectionText(catches), { ephemeral: true }));
    }
    if (sub === 'missoes') {
      const profile = await getFishingProfile(interaction.user.id, interaction.guildId);
      return interaction.reply(buildDailyMissionPayload(profile, interaction.user.id, interaction.guildId));
    }
    const { catches } = await getInventory(interaction.user.id, interaction.guildId);
    if (!catches.length) return interaction.reply(fishingError('Seu balde está vazio. Pesque algo antes de vender.'));
    return interaction.reply(buildFishSellSelectPayload(catches));
  },

  async executePrefix(message, args) {
    const sub = args[1]?.toLowerCase() ?? args[0]?.toLowerCase();
    if (sub === 'vender' || sub === 'venda') {
      const { catches } = await getInventory(message.author.id, message.guildId);
      if (!catches.length) return message.reply(fishingError('Seu balde está vazio. Pesque algo antes de vender.'));
      return message.reply(buildFishSellSelectPayload(catches));
    }
    if (sub === 'inventario' || sub === 'inventário' || sub === 'inv') {
      const inventory = await getInventory(message.author.id, message.guildId);
      return message.reply(v2(buildInventoryText(message.author.id, message.guildId, inventory)));
    }
    if (sub === 'iscas' || sub === 'isca') return message.reply(buildFishingBaitShopPayload());
    if (sub === 'pontos' || sub === 'ponto') {
      const profile = await getFishingProfile(message.author.id, message.guildId);
      return message.reply(buildFishingSpotsPayload(profile.selectedSpotKey));
    }
    if (sub === 'colecao' || sub === 'coleção' || sub === 'livro') {
      const catches = await prisma.fishingCatch.findMany({
        where: { userId: message.author.id, guildId: message.guildId, quantity: { gt: 0 } },
      });
      return message.reply(v2(buildCollectionText(catches)));
    }
    if (sub === 'missoes' || sub === 'missão' || sub === 'missao') {
      const profile = await getFishingProfile(message.author.id, message.guildId);
      return message.reply(buildDailyMissionPayload(profile, message.author.id, message.guildId));
    }
    return message.reply(buildFishingShopPayload());
  },
};

export default [cmdPescar, cmdPesca];
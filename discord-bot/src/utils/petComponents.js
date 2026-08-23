import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { getEmoji } from './emojiManager.js';

const PET_HEART = () => getEmoji('pet_heart');
const PET_TIME  = () => getEmoji('pet_time');
const PET_FOOD  = () => getEmoji('pet_food');
const PET_BALL  = () => getEmoji('pet_ball');

// Emoji oficial do Pimentinha. Este é um emoji customizado do servidor, não o
// emoji Unicode de gambá que foi usado em um cadastro anterior.
const PIMENTINHA_EMOJI = '<:05_angels:1511082383095365752>';

export const petInteractionEmojis = {
  heart: PET_HEART,
  time: PET_TIME,
  food: PET_FOOD,
  ball: PET_BALL,
};

export function getPetEmojiUrl(emojiStr) {
  const animated = emojiStr?.match(/<a:(\w+):(\d+)>/);
  if (animated) return `https://cdn.discordapp.com/emojis/${animated[2]}.gif?size=256&quality=lossless`;

  const staticEmoji = emojiStr?.match(/<:(\w+):(\d+)>/);
  if (staticEmoji) return `https://cdn.discordapp.com/emojis/${staticEmoji[2]}.png?size=256`;

  return null;
}

export function isCustomPetEmoji(emojiStr) {
  return /<a?:\w+:\d+>/.test(emojiStr ?? '');
}

function normalizedEmojiName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findGuildEmoji(source, name, id = null) {
  const cache = source?.emojis?.cache;
  if (!cache) return null;
  if (id) {
    const byId = cache.get(id);
    if (byId) return byId;
  }
  const target = normalizedEmojiName(name);
  if (!target) return null;
  return cache.find(item => normalizedEmojiName(item.name) === target) ?? null;
}

export function resolvePetEmoji(emojiStr, emojiSource = null) {
  const raw = typeof emojiStr === 'string' ? emojiStr.trim() : '';
  if (!raw) return '🐾';

  const custom = raw.match(/^<a?:([^:>\s]+):(\d+)>$/);
  if (custom) {
    // Preserve the exact custom emoji markup saved by `/criar-pet`.
    // Resolving it from the cache can substitute a different fallback; Discord
    // renders this `<:name:id>`/`<a:name:id>` value directly in message text.
    return raw;
  }

  const shortcode = raw.match(/^:([^:\s]+):$/);
  if (shortcode) {
    const emoji = findGuildEmoji(emojiSource, shortcode[1]);
    return emoji?.toString() ?? raw;
  }

  if (/^[\p{L}\p{N}_-]+$/u.test(raw)) {
    const emoji = findGuildEmoji(emojiSource, raw);
    if (emoji) return emoji.toString();
    // Do not hide an unknown configured value behind a generic paw.
    return raw;
  }

  return raw;
}

function petEmojiValue(pet) {
  if (!pet) return '';
  if (String(pet.name ?? '').trim().toLocaleLowerCase('pt-BR') === 'pimentinha') {
    return PIMENTINHA_EMOJI;
  }
  return pet.emoji;
}

export function petDisplayName(pet, emojiSource = null) {
  if (!pet) return 'seu pet';
  return `${resolvePetEmoji(petEmojiValue(pet), emojiSource)} ${pet.name}`;
}

function petThumbnailUrl(pet) {
  return pet?.imageUrl || getPetEmojiUrl(petEmojiValue(pet));
}

export function buildPetActionRows({ includeShop = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pet_action:brincar').setLabel('Brincar').setEmoji(PET_BALL()).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pet_action:alimentar').setLabel('Alimentar').setEmoji(PET_FOOD()).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pet_action:acariciar').setLabel('Acariciar').setEmoji(PET_HEART()).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pet_action:status').setLabel('Status').setEmoji(PET_TIME()).setStyle(ButtonStyle.Secondary),
  );

  if (!includeShop) return [row];

  return [
    row,
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('profile_pet_btn').setLabel('Seus pets').setEmoji('🐾').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildPetPanel({
  title,
  body,
  pet = null,
  includeActions = true,
  includeShop = true,
  extraRows = [],
} = {}) {
  const container = new ContainerBuilder();
  const text = new TextDisplayBuilder().setContent(`## ${title}\n\n${body}`);
  const thumbnailUrl = petThumbnailUrl(pet);

  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl)),
    );
  } else {
    container.addTextDisplayComponents(text);
  }

  return {
    components: [
      container,
      ...(includeActions ? buildPetActionRows({ includeShop }) : []),
      ...extraRows,
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}
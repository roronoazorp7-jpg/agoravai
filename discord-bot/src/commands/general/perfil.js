import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { generateProfileCard }         from '../../utils/profileCard.js';
import { generateAnimatedProfileCard, isGifUrl } from '../../utils/animatedProfileCard.js';
import { resolveBanner }               from '../../utils/shopData.js';

async function getGuildBadgeEmojis(guildId) {
  const overrides = await prisma.guildBadgeEmoji.findMany({ where: { guildId } }).catch(() => []);
  const map = {};
  for (const o of overrides) map[o.badgeKey] = o.emoji;
  return map;
}

async function fetchProfileData(userId, guildId) {
  const [eco, profile, purchases, guildBadgeEmojis] = await Promise.all([
    prisma.economy.findUnique({ where: { userId_guildId: { userId, guildId } } }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.userPurchase.count({ where: { userId } }),
    getGuildBadgeEmojis(guildId),
  ]);
  return { eco, profile, purchases, guildBadgeEmojis };
}

export default {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('🪪 Ver seu card de perfil com banner equipado'),
  name: 'perfil',
  aliases: ['profile', 'card'],

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.user;
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    const { eco, profile, purchases, guildBadgeEmojis } = await fetchProfileData(target.id, interaction.guildId);

    let activePetEmoji = null;
    if (profile?.activePet) {
      const pet = await prisma.pet.findUnique({ where: { id: profile.activePet } }).catch(() => null);
      activePetEmoji = pet?.emoji ?? null;
    }

    const cardParams = {
      username:        member?.displayName ?? target.username,
      avatarUrl:       target.displayAvatarURL({ extension: 'png', size: 256 }),
      balance:         eco?.balance          ?? 0,
      bank:            eco?.bank             ?? 0,
      xp:              eco?.xp               ?? 0,
      activeBanner:    profile?.activeBanner  ?? null,
      activeRing:      profile?.activeRing    ?? null,
      ringBorderColor: profile?.ringBorderColor ?? null,
      activePet:       activePetEmoji,
      marriedToName:   profile?.marriedToName  ?? null,
      bestFriendName:  profile?.bestFriendName ?? null,
      reps:            profile?.reps           ?? 0,
      bio:             profile?.bio            ?? null,
      cardBg1:         profile?.cardBg1        ?? null,
      cardBg2:         profile?.cardBg2        ?? null,
      cardPanelColor:  profile?.cardPanelColor ?? null,
      purchases,
      guildBadgeEmojis,
      guildId: interaction.guildId,
    };

    // Detecta se o banner ativo é um GIF para gerar card animado
    const bannerObj  = await resolveBanner(cardParams.activeBanner, interaction.guildId);
    const bannerIsGif = bannerObj?.imageUrl ? await isGifUrl(bannerObj.imageUrl) : false;

    let buf, filename;
    if (bannerIsGif) {
      buf      = await generateAnimatedProfileCard(cardParams);
      filename = 'perfil.gif';
    } else {
      buf      = await generateProfileCard(cardParams);
      filename = 'perfil.png';
    }

    const attachment = new AttachmentBuilder(buf, { name: filename });

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('profile_menu')
        .setPlaceholder('✨ Personalizar perfil...')
        .addOptions([
          { label: 'Banner',      value: 'profile_banner_btn',     emoji: '🖼️' },
          { label: 'Argola',      value: 'profile_ring_btn',       emoji: '💠' },
          { label: 'Molduras VIP', value: 'profile_ring_vip',      emoji: '👑' },
          { label: 'Fundo',       value: 'profile_bg_btn',         emoji: '🎨' },
          { label: 'Painel',      value: 'profile_panel_btn',      emoji: '🟦' },
          { label: 'Pet',         value: 'profile_pet_btn',        emoji: '🐾' },
          { label: 'Conquistas',  value: 'profile_conquistas_btn', emoji: '🏅' },
        ]),
    );

    return interaction.editReply({ files: [attachment], components: [menu] });
  },

  async executePrefix(message) {
    // Se mencionar alguém, mostra o perfil dessa pessoa
    const target = message.mentions.users.first() ?? message.author;
    const member = await message.guild.members.fetch(target.id).catch(() => null);
    const { eco, profile, purchases, guildBadgeEmojis } = await fetchProfileData(target.id, message.guildId);

    let activePetEmoji = null;
    if (profile?.activePet) {
      const pet = await prisma.pet.findUnique({ where: { id: profile.activePet } }).catch(() => null);
      activePetEmoji = pet?.emoji ?? null;
    }

    const cardParams = {
      username:        member?.displayName ?? target.username,
      avatarUrl:       target.displayAvatarURL({ extension: 'png', size: 256 }),
      balance:         eco?.balance          ?? 0,
      bank:            eco?.bank             ?? 0,
      xp:              eco?.xp               ?? 0,
      activeBanner:    profile?.activeBanner  ?? null,
      activeRing:      profile?.activeRing    ?? null,
      ringBorderColor: profile?.ringBorderColor ?? null,
      activePet:       activePetEmoji,
      marriedToName:   profile?.marriedToName  ?? null,
      bestFriendName:  profile?.bestFriendName ?? null,
      reps:            profile?.reps           ?? 0,
      bio:             profile?.bio            ?? null,
      cardBg1:         profile?.cardBg1        ?? null,
      cardBg2:         profile?.cardBg2        ?? null,
      cardPanelColor:  profile?.cardPanelColor ?? null,
      purchases,
      guildBadgeEmojis,
      guildId: message.guildId,
    };

    const bannerObj   = await resolveBanner(cardParams.activeBanner, message.guildId);
    const bannerIsGif = bannerObj?.imageUrl ? await isGifUrl(bannerObj.imageUrl) : false;

    let buf, filename;
    if (bannerIsGif) {
      buf      = await generateAnimatedProfileCard(cardParams);
      filename = 'perfil.gif';
    } else {
      buf      = await generateProfileCard(cardParams);
      filename = 'perfil.png';
    }

    return message.reply({ files: [new AttachmentBuilder(buf, { name: filename })] });
  },
};

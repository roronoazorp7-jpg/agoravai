import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from 'discord.js';
import prisma from '../../database/client.js';
import { generateProfileCard }         from '../../utils/profileCard.js';
import {
  generateAnimatedProfileCard,
  generateStaticProfileGifCard,
  isGifUrl,
} from '../../utils/animatedProfileCard.js';
import { resolveBanner }               from '../../utils/shopData.js';
import { getEmoji }                    from '../../utils/emojiManager.js';

const REFRESH = () => getEmoji('refresh_button');

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

async function renderProfileAttachment(cardParams) {
  const banner = await resolveBanner(cardParams.activeBanner, cardParams.guildId);
  const bannerIsGif = banner?.imageUrl ? await isGifUrl(banner.imageUrl) : false;

  if (bannerIsGif) {
    try {
      // Não usar Promise.race aqui: a renderização nativa não pode ser cancelada
      // com segurança. Iniciar o fallback antes dela terminar trava o canvas.
      const buf = await generateAnimatedProfileCard({
        ...cardParams,
        _resolvedBanner: banner,
      });
      return { buf, filename: 'perfil.gif' };
    } catch (error) {
      console.error('[perfil] Falha no card GIF animado; usando GIF de um frame:', error?.message ?? error);
      return {
        buf: await generateStaticProfileGifCard({
          ...cardParams,
          _resolvedBanner: banner,
        }),
        filename: 'perfil.gif',
      };
    }
  }

  return {
    buf: await generateProfileCard({
      ...cardParams,
      _resolvedBanner: banner,
    }),
    filename: 'perfil.png',
  };
}

function profileEditMenu() {
  return new ActionRowBuilder().addComponents(
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
}

export function profileRefreshRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`profile_refresh:${userId}`)
      .setLabel('Atualizar')
      .setEmoji(REFRESH())
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function buildProfilePayload({ userId, guildId, guild, target, includeCustomization = false }) {
  const member = await guild.members.fetch(userId).catch(() => null);
  const { eco, profile, purchases, guildBadgeEmojis } = await fetchProfileData(userId, guildId);

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
    guildId,
  };

  const { buf, filename } = await renderProfileAttachment(cardParams);
  const components = [];
  if (includeCustomization) components.push(profileEditMenu());
  components.push(profileRefreshRow(userId));

  return {
    files: [new AttachmentBuilder(buf, { name: filename })],
    components,
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('🪪 Ver seu card de perfil com banner equipado'),
  name: 'perfil',
  aliases: ['profile', 'card'],

  async execute(interaction) {
    await interaction.deferReply();

    try {
      // A renderização pode envolver download e composição de imagens. Atualiza
      // primeiro para o Discord não ficar preso mostrando apenas "pensando...".
      await interaction.editReply({ content: '⏳ Gerando seu perfil…' });

      const target = interaction.user;
      return interaction.editReply(await buildProfilePayload({
        userId: target.id,
        guildId: interaction.guildId,
        guild: interaction.guild,
        target,
        includeCustomization: true,
      }));
    } catch (error) {
      console.error('[perfil] Falha ao responder slash:', error?.stack ?? error);
      return interaction.editReply({
        content: '❌ Não consegui carregar seu perfil agora. O banner GIF foi preservado; tente novamente em alguns segundos.',
        components: [],
      }).catch(() => {});
    }
  },

  async executePrefix(message) {
    // Se mencionar alguém, mostra o perfil dessa pessoa
    const target = message.mentions.users.first() ?? message.author;
    return message.reply(await buildProfilePayload({
      userId: target.id,
      guildId: message.guildId,
      guild: message.guild,
      target,
    }));
  },
};

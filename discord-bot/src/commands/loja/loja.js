import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';
import prisma from '../../database/client.js';
import { getEmoji } from '../../utils/emojiManager.js';
import { buildLojaAdminPayload } from '../../utils/shopHandlers.js';
import { buildBannerUrl } from '../../utils/shopData.js';

const COIN          = () => getEmoji('futecoins');
const DEFAULT_CONV  = () => `> \`1000 mensagens\` → **500 ${COIN()}**\n> \`1 hora em call\` → **500 ${COIN()}**`;
const DEFAULT_TEXT  = () =>
  `Deseja adquirir **cargos** e **banners de perfil** exclusivos?\n` +
  `Aqui você pode comprar tudo com as suas **${COIN()}**!`;
const DIVIDER = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

function parseEmoji(str) {
  if (!str) return null;
  const match = str.match(/^<(a?):(\w+):(\d+)>$/);
  if (match) return { animated: !!match[1], name: match[2], id: match[3] };
  return str;
}

// ─── Painel público em Components V2 (sem barra lateral por padrão) ──────────
export function buildShopMain(guild, cfg = {}) {
  const title    = cfg.lojaTitle  ?? `🛒 Loja do ${guild.name}`;
  const conv     = cfg.lojaConversao ?? DEFAULT_CONV();
  const bodyText = cfg.lojaText   ?? DEFAULT_TEXT();
  const useDivider = cfg.lojaUseDivider ?? false;
  // A loja não herda o banner do servidor. Exibe somente imagens configuradas
  // pelo administrador no painel de configuração da loja.
  const shopBanner = buildBannerUrl(cfg.lojaBanner);
  const shopThumb = buildBannerUrl(cfg.lojaThumb);

  const sep  = useDivider ? `\n${DIVIDER}\n\n` : '\n\n';
  const fullText = `## ${title}\n\n${bodyText}${sep}**Conversão 🪙**\n${conv}`;

  const container = new ContainerBuilder();

  // Só define accentColor se o admin configurou uma cor — sem cor = sem barra lateral
  if (cfg.lojaColor) {
    const parsed = parseInt(cfg.lojaColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  const bannerPos = cfg.lojaBannerPos ?? 'top';

  // Banner no topo (padrão)
  if (shopBanner && bannerPos === 'top') {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(shopBanner)),
    );
  }

  const thumbUrl = shopThumb || guild.iconURL({ size: 128 }) || null;
  if (thumbUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText));
  }

  // Banner na base (opcional)
  if (shopBanner && bannerPos === 'bottom') {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(shopBanner)),
    );
  }

  if (useDivider) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Clique em um botão abaixo para começar.'));
  }

  const eComprar   = parseEmoji(cfg.shopEmojiComprar)   ?? '🛒';
  const eConverter = parseEmoji(cfg.shopEmojiConverter) ?? '🔄';
  const eGift      = parseEmoji(cfg.shopEmojiGift)      ?? '🎁';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_comprar').setLabel('Comprar').setEmoji(eComprar).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_converter').setLabel('Converter').setEmoji(eConverter).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('shop_gift').setLabel('Presentear').setEmoji(eGift).setStyle(ButtonStyle.Secondary),
  );

  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

async function getCfg(guildId) {
  return prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

export default {
  name:    'loja',
  aliases: ['shop', 'store'],
  data: new SlashCommandBuilder()
    .setName('loja')
    .setDescription('🛒 Sistema de loja do servidor')
    .addSubcommandGroup(group =>
      group
        .setName('painel')
        .setDescription('📢 Publicação do painel da loja')
        .addSubcommand(s =>
          s.setName('enviar').setDescription('📢 Envia o painel da loja no canal atual'))
        .addSubcommand(s =>
          s.setName('config').setDescription('📌 Publica o painel fixo neste canal (apenas admins)')))
    .addSubcommand(s =>
      s.setName('config').setDescription('⚙️ Abre o painel de administração da loja (apenas admins)')),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();

    if (group === 'painel' && sub === 'enviar') {
      const cfg     = await getCfg(interaction.guildId);
      const payload = buildShopMain(interaction.guild, cfg);
      return interaction.reply(payload);
    }

    if (group === 'painel' && sub === 'config') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Apenas administradores podem publicar o painel fixo da loja.', ephemeral: true });
      }

      const cfg = await getCfg(interaction.guildId);
      await interaction.channel.send(buildShopMain(interaction.guild, cfg));
      return interaction.reply({ content: '✅ Painel fixo da loja publicado neste canal.', ephemeral: true });
    }

    if (sub === 'config') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Apenas administradores podem acessar as configurações da loja.', ephemeral: true });
      }
      const cfg = await getCfg(interaction.guildId);
      return interaction.reply({ ...buildLojaAdminPayload(cfg), ephemeral: true });
    }

  },

  async executePrefix(message, args) {
    const sub   = args[0]?.toLowerCase() ?? 'painel';
    const action = args[1]?.toLowerCase();

    if ((sub === 'painel' || sub === 'p' || sub === 'panel') && action === 'config') {
      const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) return message.reply({ content: '❌ Apenas administradores podem publicar o painel fixo da loja.' });
      const cfg = await getCfg(message.guildId);
      await message.channel.send(buildShopMain(message.guild, cfg));
      return message.reply('✅ Painel fixo da loja publicado neste canal.');
    }

    if (sub === 'painel' || sub === 'p' || sub === 'panel') {
      const cfg = await getCfg(message.guildId);
      return message.reply(buildShopMain(message.guild, cfg));
    }

    if (sub === 'config' || sub === 'c' || sub === 'cfg') {
      const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) return message.reply({ content: '❌ Apenas administradores podem acessar as configurações da loja.' });
      const cfg = await getCfg(message.guildId);
      return message.reply({ ...buildLojaAdminPayload(cfg) });
    }

    // Padrão: mostra painel
    const cfg = await getCfg(message.guildId);
    return message.reply(buildShopMain(message.guild, cfg));
  },
};

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import prisma from '../../database/client.js';
import { BANNERS, buildBannerUrl, cacheBannerImage } from '../../utils/shopData.js';

import { getEmoji } from '../../utils/emojiManager.js';
const COIN = () => getEmoji('futecoins');

async function validateImageUrl(imageUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(imageUrl, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SavageBot/1.0)' },
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) throw new Error(`Tipo inválido: ${ct}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('criar-banner')
    .setDescription('🖼️ [Admin] Cria ou atualiza um banner personalizado para a loja')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('nome').setDescription('Nome do banner (ex: Gang Angel)').setRequired(true).setMaxLength(50))
    .addStringOption(o => o.setName('imagem').setDescription('URL direta da imagem (Imgur, imgbb, Discord CDN, etc.)').setRequired(true))
    .addIntegerOption(o => o.setName('preco').setDescription('Preço em coins').setRequired(false).setMinValue(1))
    .addStringOption(o => o.setName('chave').setDescription('Chave do banner existente (para atualizar a imagem)').setRequired(false)),
  name: 'criar-banner',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const nome   = interaction.options.getString('nome');
    const imagem = interaction.options.getString('imagem');
    const preco  = interaction.options.getInteger('preco');
    const chaveExistente = interaction.options.getString('chave');

    if (!/^https?:\/\/.+/.test(imagem))
      return interaction.editReply({ content: '❌ URL da imagem inválida. Use um link direto (http/https).' });

    // Valida se a URL realmente aponta para uma imagem
    try {
      await validateImageUrl(imagem);
    } catch (err) {
      return interaction.editReply({ content: `❌ Não foi possível acessar a imagem: \`${err.message}\`\n\nUse URLs diretas de Imgur, imgbb ou Discord CDN.` });
    }

    // ── Modo atualização: chave fornecida ──────────────────────────────────────
    if (chaveExistente) {
      const existing = await prisma.customBanner.findFirst({
        where: { key: chaveExistente, guildId: interaction.guildId },
      });
      if (!existing)
        return interaction.editReply({ content: `❌ Banner com chave \`${chaveExistente}\` não encontrado.` });

      const storedImage = await cacheBannerImage(imagem, `${interaction.guildId}_${existing.key}`);
      if (!storedImage) {
        return interaction.editReply({ content: '❌ Não foi possível salvar uma cópia permanente da imagem. Use uma URL direta de imagem acessível.' });
      }

      await prisma.customBanner.update({
        where: { id: existing.id },
        data: { imageUrl: storedImage, active: true, name: nome },
      });

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Banner Atualizado!')
            .setDescription(`O banner **${nome}** foi atualizado com sucesso!`)
            .setImage(buildBannerUrl(storedImage) || imagem)
            .addFields({ name: '🔑 Chave', value: `\`${chaveExistente}\``, inline: true })
            .setFooter({ text: 'Use /loja painel → Vitrine para ver o banner' }),
        ],
      });
    }

    // ── Modo criação ────────────────────────────────────────────────────────────
    const priceVal = preco ?? 1000;
    // Prefixo "c_" garante que a chave de um banner personalizado nunca colida com
    // a de um banner estático (galaxy, neon, ocean, etc), evitando que clicar em um
    // banner no menu acabe equipando/exibindo outro.
    const slug = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 30);
    const chave = `c_${slug}`;
    const staticKeys = new Set(BANNERS.map(b => b.key));

    const existing = await prisma.customBanner.findUnique({
      where: { guildId_key: { guildId: interaction.guildId, key: chave } },
    });
    const finalKey = (existing || staticKeys.has(chave)) ? `${chave}_${Date.now().toString(36)}` : chave;

    const storedImage = await cacheBannerImage(imagem, `${interaction.guildId}_${finalKey}`);
    if (!storedImage) {
      return interaction.editReply({ content: '❌ Não foi possível salvar uma cópia permanente da imagem. Use uma URL direta de imagem acessível.' });
    }

    await prisma.customBanner.create({
      data: {
        guildId:     interaction.guildId,
        key:         finalKey,
        name:        nome,
        description: '',
        price:       priceVal,
        imageUrl:    storedImage,
        gradient1:   '#1a0533',
        gradient2:   '#4a1a8a',
        emoji:       '🖼️',
        active:      true,
      },
    });

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9B4FD6)
          .setTitle('✅ Banner Criado!')
          .setDescription(`O banner **${nome}** foi adicionado à loja!\nOs membros já podem comprar e equipar.`)
          .setImage(buildBannerUrl(storedImage) || imagem)
          .addFields(
            { name: '💰 Preço', value: `**${priceVal.toLocaleString('pt-BR')} ${COIN()}**`, inline: true },
            { name: '🔑 Chave', value: `\`${finalKey}\``, inline: true },
          )
          .setFooter({ text: 'Guarde a chave para atualizar a imagem com /criar-banner chave:...' }),
      ],
    });
  },

  async executePrefix(message) {
    return message.reply({ content: '⚠️ Use o comando slash `/criar-banner` para criar banners personalizados.' });
  },
};

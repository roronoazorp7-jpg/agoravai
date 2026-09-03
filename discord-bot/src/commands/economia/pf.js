import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../../database/client.js';
import { generateBalanceCard } from '../../utils/economyCards.js';
import { getEmoji } from '../../utils/emojiManager.js';

const REFRESH = () => getEmoji('refresh_button');

// ─── VIP helpers ─────────────────────────────────────────────────────────────

function parseDuration(str) {
  const match = str?.match(/^(\d+)(d|h|m)$/i);
  if (!match) return null;
  const val  = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'm') return val * 60 * 1000;
  return null;
}

function humanDuration(ms) {
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d} dia${d > 1 ? 's' : ''}${h > 0 ? ` e ${h}h` : ''}`;
  if (h > 0) return `${h}h${m > 0 ? ` e ${m}m` : ''}`;
  return `${m} minuto${m !== 1 ? 's' : ''}`;
}

// ─── Build card ───────────────────────────────────────────────────────────────

export async function buildWalletCard(userId, guildId, guild, target) {
  const [eco, profile] = await Promise.all([
    prisma.economy.findFirst({ where: { userId, guildId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
  ]);
  const member   = await guild.members.fetch(userId).catch(() => null);
  const username = member?.displayName ?? target.username;
  const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 1024 });

  const buf = await generateBalanceCard({
    username,
    avatarUrl,
    balance:          eco?.balance          ?? 0,
    bank:             eco?.bank             ?? 0,
    cardBg1:          profile?.cardBg1      ?? null,
    cardBg2:          profile?.cardBg2      ?? null,
    cardPanelColor:   profile?.cardPanelColor ?? null,
    walletRing:       profile?.walletRing       ?? null,
    walletRingBorder: profile?.walletRingBorder ?? null,
    walletBg:         profile?.walletBg     ?? null,
  });
  return new AttachmentBuilder(buf, { name: 'carteira.png' });
}

// ─── Menu de personalização ────────────────────────────────────────────────────

function editMenu() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('wallet_menu')
        .setPlaceholder('✨ Personalizar carteira...')
        .addOptions([
          { label: 'Fundos', value: 'wallet_fundo_preset_btn', emoji: '🖼️' },
          { label: 'Fundo por link', value: 'wallet_fundo_btn', emoji: '🔗' },
          { label: 'Argola', value: 'wallet_ring_btn', emoji: '💠' },
          { label: 'Molduras VIP', value: 'wallet_ring_vip', emoji: '👑' },
          { label: 'Cor do fundo', value: 'profile_bg_btn', emoji: '🎨' },
          { label: 'Painel', value: 'profile_panel_btn', emoji: '🟦' },
          { label: 'Limpar fundo', value: 'wallet_fundo_reset', emoji: '↩️' },
        ]),
    ),
  ];
}

export function walletRefreshRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wallet_refresh:${userId}`)
      .setLabel('Atualizar')
      .setEmoji(REFRESH())
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
  name: 'pf',
  aliases: ['carteira'],

  data: new SlashCommandBuilder()
    .setName('carteira')
    .setDescription('Ver e personalizar sua carteira de economia'),

  async execute(interaction) {
    await interaction.deferReply();
    const file = await buildWalletCard(
      interaction.user.id,
      interaction.guildId,
      interaction.guild,
      interaction.user,
    );
    return interaction.editReply({
      files: [file],
      components: [...editMenu(), walletRefreshRow(interaction.user.id)],
    });
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase();

    // savage pf vip @user 30d @cargo
    if (sub === 'vip') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
        return message.reply('❌ Você precisa da permissão **Gerenciar Servidor**.');

      const target     = message.mentions.users.first();
      const roleTarget = message.mentions.roles.first();
      const tempoStr   = args.find(a => /^\d+[dhm]$/i.test(a));

      if (!target || !roleTarget)
        return message.reply('❌ Use: `savage pf vip @user 30d @cargo`');

      const ms = parseDuration(tempoStr ?? '');
      if (!ms) return message.reply('❌ Formato inválido. Use: 30d, 12h, 60m');

      const member = await message.guild.members.fetch(target.id).catch(() => null);
      if (!member) return message.reply('❌ Membro não encontrado.');

      const expiresAt = new Date(Date.now() + ms);
      await member.roles.add(roleTarget.id).catch(() => {});
      await prisma.vipGrant.upsert({
        where:  { guildId_userId_roleId: { guildId: message.guildId, userId: target.id, roleId: roleTarget.id } },
        create: { guildId: message.guildId, userId: target.id, roleId: roleTarget.id, expiresAt },
        update: { expiresAt },
      });

      const ts = Math.floor(expiresAt.getTime() / 1000);
      return message.reply(
        `✅ **${member.displayName}** recebeu o cargo **${roleTarget.name}** por **${humanDuration(ms)}**!\nExpira: <t:${ts}:F> (<t:${ts}:R>)`,
      );
    }

    // savage pf [@user] → view carteira (com botão de atualização)
    const target = message.mentions.users.first() ?? message.author;
    const file   = await buildWalletCard(target.id, message.guildId, message.guild, target);
    return message.reply({ files: [file], components: [walletRefreshRow(target.id)] });
  },
};

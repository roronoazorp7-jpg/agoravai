import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import prisma from '../../database/client.js';
import { getEmoji } from '../../utils/emojiManager.js';

// ─── Emojis — resolvidos como application emojis ────────────────────────────
const COIN    = () => getEmoji('futecoins');
const VIP_TAG = '⭐'; // emoji unicode padrão (substitua por getEmoji se criar emoji VIP na app)

// ─── Defaults ─────────────────────────────────────────────────────────────────
const VIP_COLOR = 0x5865F2;
const DEFAULT_VIP_TITLE = `${VIP_TAG} Painel VIP`;
const DEFAULT_VIP_INTRO = 'Compre VIP com carrinho publico e libere bonus reais na economia.';
const DEFAULT_VIP_TEXT  = () => [
  `${COIN()} +35% em recompensas`,
  `🕒 Cooldowns reduzidos`,
  `🛡️ Mais proteção contra roubos`,
  `🌿 Bonus extra na mineração`,
  `🎣 Bonus na pesca`,
  `🏹 Bonus na caça`,
  `🌾 Bonus na fazenda`,
  `🏛️ Banco 2.5x maior`,
  `💵 Juros 50% maiores`,
].join('\n');
const DEFAULT_VIP_PRICE_LABEL = 'R$ 20/mes';
const DEFAULT_VIP_BTN_ESCOLHER  = 'Escolher VIP';
const DEFAULT_VIP_BTN_CARRINHO  = 'Meu carrinho';

async function getCfg(guildId) {
  return prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

async function getCfgWithPlans(guildId) {
  return prisma.guildConfig.upsert({
    where:   { guildId },
    create:  { guildId },
    update:  {},
    include: { vipPlans: { orderBy: { position: 'asc' } } },
  });
}

const VIP_TIME_UNITS = {
  minutos: 60 * 1000,
  horas: 60 * 60 * 1000,
  dias: 24 * 60 * 60 * 1000,
  meses: 30 * 24 * 60 * 60 * 1000,
};

function formatVipDuration(amount, unit) {
  const labels = {
    minutos: amount === 1 ? 'minuto' : 'minutos',
    horas: amount === 1 ? 'hora' : 'horas',
    dias: amount === 1 ? 'dia' : 'dias',
    meses: amount === 1 ? 'mês' : 'meses',
  };
  return `${amount} ${labels[unit]}`;
}

async function grantVip(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: '❌ Você precisa da permissão **Gerenciar cargos** para conceder VIP.',
      ephemeral: true,
    });
  }

  const user = interaction.options.getUser('membro');
  const role = interaction.options.getRole('cargo');
  const amount = interaction.options.getInteger('tempo');
  const unit = interaction.options.getString('unidade');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    return interaction.reply({ content: '❌ Esse membro não está neste servidor.', ephemeral: true });
  }
  if (!role || role.managed || role.id === interaction.guild.id) {
    return interaction.reply({
      content: '❌ Escolha um cargo normal. Cargos integrados e o @everyone não podem ser usados como VIP.',
      ephemeral: true,
    });
  }
  if (!amount || amount < 1 || amount > 3650) {
    return interaction.reply({
      content: '❌ O tempo deve estar entre 1 e 3650 unidades.',
      ephemeral: true,
    });
  }

  const botMember = interaction.guild.members.me
    ?? await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: '❌ Eu preciso da permissão **Gerenciar cargos** para conceder e remover VIP.',
      ephemeral: true,
    });
  }
  if (role.position >= botMember.roles.highest.position) {
    return interaction.reply({
      content: '❌ Meu cargo precisa estar acima do cargo VIP escolhido.',
      ephemeral: true,
    });
  }
  if (role.position >= interaction.member.roles.highest.position && interaction.member.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: '❌ Seu cargo precisa estar acima do cargo VIP escolhido.',
      ephemeral: true,
    });
  }

  const now = new Date();
  const existing = await prisma.vipGrant.findUnique({
    where: {
      guildId_userId_roleId: {
        guildId: interaction.guildId,
        userId: user.id,
        roleId: role.id,
      },
    },
  });
  const startsAt = existing?.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = new Date(startsAt.getTime() + amount * VIP_TIME_UNITS[unit]);

  try {
    await member.roles.add(role, `VIP concedido por ${interaction.user.tag}`);
    await prisma.vipGrant.upsert({
      where: {
        guildId_userId_roleId: {
          guildId: interaction.guildId,
          userId: user.id,
          roleId: role.id,
        },
      },
      create: { guildId: interaction.guildId, userId: user.id, roleId: role.id, expiresAt },
      update: { expiresAt },
    });
  } catch (error) {
    console.error('[VIP] Erro ao conceder VIP:', error);
    return interaction.reply({
      content: '❌ Não consegui conceder esse VIP. Verifique minhas permissões e a hierarquia dos cargos.',
      ephemeral: true,
    });
  }

  const expiration = Math.floor(expiresAt.getTime() / 1000);
  return interaction.reply({
    content:
      `✅ VIP concedido com sucesso!\n` +
      `**Membro:** ${member}\n` +
      `**Cargo:** ${role}\n` +
      `**Duração adicionada:** ${formatVipDuration(amount, unit)}\n` +
      `**Expira:** <t:${expiration}:F> (<t:${expiration}:R>)`,
    ephemeral: false,
  });
}

function safeEmoji(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const match = s.match(/^<(a?):([^:>\s]+):(\d+)>$/);
  if (match) {
    const id = match[3];
    if (id.length < 17 || id.length > 20) return null;
    return { animated: match[1] === 'a', name: match[2], id };
  }
  return s || null;
}

// ─── Build do painel VIP em Components V2 (sem barra lateral por padrão) ─────
export function buildVipPanel(cfg = {}, plans = []) {
  const container = new ContainerBuilder();

  // Sem cor = sem barra lateral
  if (cfg.vipColor) {
    const parsed = parseInt(cfg.vipColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  const coin  = cfg.vipEmojiCoin || COIN();
  const tag   = cfg.vipEmojiTag  || VIP_TAG;
  const title = cfg.vipTitle     || DEFAULT_VIP_TITLE;
  const intro = cfg.vipIntro     || DEFAULT_VIP_INTRO;
  const introText = `## ${title}\n${intro}`;

  // Banner no topo
  if (cfg.vipBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.vipBanner)),
    );
  }

  if (cfg.vipThumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(introText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.vipThumb)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(introText));
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  // Benefícios
  const beneficios = cfg.vipText || DEFAULT_VIP_TEXT();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ⭐ Beneficios VIP\n${beneficios}`),
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Planos
  if (plans && plans.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${coin} Planos disponíveis`),
    );
    // Máx 5 botões por row — divide em grupos de 5
    for (let i = 0; i < Math.min(plans.length, 10); i += 5) {
      const slice = plans.slice(i, i + 5);
      const btns = slice.map(p => {
        const b = new ButtonBuilder()
          .setCustomId(`vip_escolher_plano:${p.id}`)
          .setLabel(`${p.name} · ${p.price}`)
          .setStyle(ButtonStyle.Primary);
        const e = safeEmoji(p.emoji);
        if (e) { try { b.setEmoji(e); } catch {} }
        return b;
      });
      container.addActionRowComponents(new ActionRowBuilder().addComponents(...btns));
    }
  } else {
    const priceLabel = cfg.vipPriceLabel || DEFAULT_VIP_PRICE_LABEL;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### ${coin} Plano principal\n${tag} **${priceLabel}**`),
    );
    const escolherBtn = new ButtonBuilder()
      .setCustomId('vip_escolher')
      .setLabel(cfg.vipBtnEscolherLabel || DEFAULT_VIP_BTN_ESCOLHER)
      .setStyle(ButtonStyle.Primary);
    const e1 = safeEmoji(cfg.vipEmojiBtn1);
    if (e1) { try { escolherBtn.setEmoji(e1); } catch {} }

    const carrinhoBtn = new ButtonBuilder()
      .setCustomId('vip_carrinho')
      .setLabel(cfg.vipBtnCarrinhoLabel || DEFAULT_VIP_BTN_CARRINHO)
      .setStyle(ButtonStyle.Secondary);
    const e2 = safeEmoji(cfg.vipEmojiBtn2);
    if (e2) { try { carrinhoBtn.setEmoji(e2); } catch {} }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(escolherBtn, carrinhoBtn));
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ─── Configuração (admin) ─────────────────────────────────────────────────────

const VIP_CFG_FIELDS = {
  titulo:     { label: 'Título',                          db: 'vipTitle',            max: 100,  paragraph: false },
  intro:      { label: 'Texto Introdutório',              db: 'vipIntro',            max: 200,  paragraph: true  },
  texto:      { label: 'Texto de Benefícios',             db: 'vipText',             max: 1000, paragraph: true  },
  banner:     { label: 'URL do Banner',                   db: 'vipBanner',           max: 500,  paragraph: false },
  thumb:      { label: 'URL da Thumbnail',                db: 'vipThumb',            max: 500,  paragraph: false },
  cor:        { label: 'Cor Hex (sem #)',                 db: 'vipColor',            max: 6,    paragraph: false },
  preco:      { label: 'Rótulo do Preço',                 db: 'vipPriceLabel',       max: 60,   paragraph: false },
  escolher:   { label: 'Rótulo botão "Escolher VIP"',    db: 'vipBtnEscolherLabel', max: 40,   paragraph: false },
  carrinho:   { label: 'Rótulo botão "Meu carrinho"',    db: 'vipBtnCarrinhoLabel', max: 40,   paragraph: false },
  emoji_coin: { label: 'Emoji da Moeda (<a:name:ID>)',    db: 'vipEmojiCoin',        max: 100,  paragraph: false },
  emoji_tag:  { label: 'Emoji VIP (<:name:ID>)',          db: 'vipEmojiTag',         max: 100,  paragraph: false },
  emoji_btn1: { label: 'Emoji Botão "Escolher VIP"',     db: 'vipEmojiBtn1',        max: 100,  paragraph: false },
  emoji_btn2: { label: 'Emoji Botão "Meu Carrinho"',     db: 'vipEmojiBtn2',        max: 100,  paragraph: false },
};

// V2 — sem embed, com ContainerBuilder
export function buildVipConfigPayload(cfg, plans = []) {
  // ── Container 1: campos de texto ─────────────────────────────────────────
  const c1 = new ContainerBuilder();
  if (cfg.vipColor) {
    const p = parseInt(cfg.vipColor, 16);
    if (!isNaN(p)) c1.setAccentColor(p);
  }

  const coin = cfg.vipEmojiCoin || COIN;
  const tag  = cfg.vipEmojiTag  || VIP_TAG;

  c1.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    [
      '⚙️ **Configuração — VIP**',
      `🏷️ **Título:** ${cfg.vipTitle || '*(padrão)*'}`,
      `📝 **Intro:** ${cfg.vipIntro ? cfg.vipIntro.slice(0, 80) + (cfg.vipIntro.length > 80 ? '…' : '') : '*(padrão)*'}`,
      `🎨 **Cor lateral:** ${cfg.vipColor ? `#${cfg.vipColor}` : '*(sem lateral)*'}`,
      `🖼️ **Banner:** ${cfg.vipBanner ? `[Ver](<${cfg.vipBanner}>)` : '*(nenhum)*'}  📷 **Thumb:** ${cfg.vipThumb ? `[Ver](<${cfg.vipThumb}>)` : '*(nenhuma)*'}`,
      `💰 **Preço:** ${cfg.vipPriceLabel || DEFAULT_VIP_PRICE_LABEL}`,
      `${coin} Emoji moeda · ${tag} Emoji VIP`,
      `⭐ **Benefícios:** ${(cfg.vipText || DEFAULT_VIP_TEXT()).split('\n').slice(0, 3).join(' · ')}${(cfg.vipText || DEFAULT_VIP_TEXT()).split('\n').length > 3 ? ' …' : ''}`,
    ].join('\n'),
  ));

  // Linha 1: campos de texto
  c1.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vip_cfg_titulo').setLabel('Título').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_intro').setLabel('Intro').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_texto').setLabel('Benefícios').setEmoji('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_preco').setLabel('Preço').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_escolher').setLabel('Btn Escolher').setStyle(ButtonStyle.Secondary),
  ));

  // Linha 2: visual
  c1.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vip_cfg_banner').setLabel('Banner').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_thumb').setLabel('Thumb').setEmoji('📷').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_cor').setLabel('Cor').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_sem_cor').setLabel('Sem Lateral').setEmoji('◻️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_carrinho').setLabel('Btn Carrinho').setStyle(ButtonStyle.Secondary),
  ));

  // Linha 3: emojis + reset
  c1.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('vip_cfg_emoji_coin').setLabel('Emoji Moeda').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_emoji_tag').setLabel('Emoji VIP').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_emoji_btn1').setLabel('Emoji Btn1').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_emoji_btn2').setLabel('Emoji Btn2').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('vip_cfg_reset').setLabel('Resetar').setEmoji('♻️').setStyle(ButtonStyle.Danger),
  ));

  // ── Container 2: planos ───────────────────────────────────────────────────
  const c2 = new ContainerBuilder();

  if (plans.length > 0) {
    c2.addTextDisplayComponents(new TextDisplayBuilder().setContent('**📋 Planos VIP**'));
    for (const plan of plans.slice(0, 4)) {
      const emoji = plan.emoji ? `${plan.emoji} ` : '';
      c2.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pm_vip_plano_del:${plan.id}`)
          .setLabel(`${emoji}${plan.name} · ${plan.price} — Remover`)
          .setStyle(ButtonStyle.Danger),
      ));
    }
  } else {
    c2.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '**📋 Planos VIP** — *nenhum configurado*\nAdicione planos para o painel VIP mostrar opções de compra.',
    ));
  }

  c2.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pm_vip_plano_add').setLabel('+ Adicionar Plano').setStyle(ButtonStyle.Success),
  ));

  return { components: [c1, new SeparatorBuilder(), c2], flags: MessageFlags.IsComponentsV2 };
}

async function handleVipConfig(interaction) {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) return interaction.reply({ content: '❌ Apenas administradores podem configurar o painel VIP.', ephemeral: true });

  const cfg    = await getCfg(interaction.guildId);
  const method = interaction.isButton() ? 'update' : 'reply';
  return interaction[method]({ ...buildVipConfigPayload(cfg), ...(method === 'reply' ? { ephemeral: true } : {}) });
}

async function handleVipCfgBtn(interaction) {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) return interaction.reply({ content: '❌ Apenas administradores.', ephemeral: true });

  const field = interaction.customId.replace('vip_cfg_', '');

  if (field === 'reset') {
    await prisma.guildConfig.upsert({
      where:  { guildId: interaction.guildId },
      create: { guildId: interaction.guildId },
      update: {
        vipTitle: null, vipIntro: null, vipText: null, vipBanner: null, vipThumb: null,
        vipColor: null, vipPriceLabel: null, vipBtnEscolherLabel: null, vipBtnCarrinhoLabel: null,
        vipEmojiCoin: null, vipEmojiTag: null, vipEmojiBtn1: null, vipEmojiBtn2: null,
      },
    });
    const cfg = await getCfgWithPlans(interaction.guildId);
    return interaction.update(buildVipConfigPayload(cfg, cfg.vipPlans));
  }

  if (field === 'sem_cor') {
    await prisma.guildConfig.upsert({
      where:  { guildId: interaction.guildId },
      create: { guildId: interaction.guildId },
      update: { vipColor: null },
    });
    const cfg = await getCfgWithPlans(interaction.guildId);
    return interaction.update(buildVipConfigPayload(cfg, cfg.vipPlans));
  }

  const def = VIP_CFG_FIELDS[field];
  if (!def) return;

  const cfg = await getCfg(interaction.guildId);
  const cur = cfg[def.db] ?? '';

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(def.label)
    .setStyle(def.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(def.max)
    .setPlaceholder('(vazio = voltar ao padrão)');

  if (cur) input.setValue(cur);

  const modal = new ModalBuilder()
    .setCustomId(`vip_cfg_modal_${field}`)
    .setTitle(`Editar: ${def.label}`)
    .addComponents(new ActionRowBuilder().addComponents(input));

  return interaction.showModal(modal);
}

export async function handleVipConfigModal(interaction) {
  await interaction.deferUpdate();

  const field = interaction.customId.replace('vip_cfg_modal_', '');
  const def   = VIP_CFG_FIELDS[field];
  if (!def) return;

  let value = interaction.fields.getTextInputValue('value').trim() || null;
  if (value && field === 'cor') value = value.replace(/^#/, '').toUpperCase().slice(0, 6);

  await prisma.guildConfig.upsert({
    where:  { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, [def.db]: value },
    update: { [def.db]: value },
  });

  const cfg = await getCfgWithPlans(interaction.guildId);
  await interaction.message.edit(buildVipConfigPayload(cfg, cfg.vipPlans));
}

// ─── Handler dos botões VIP ───────────────────────────────────────────────────
export async function handleVipButton(interaction) {
  const id = interaction.customId;

  if (id.startsWith('vip_cfg_')) return handleVipCfgBtn(interaction);
  if (id === 'vip_admin_config')  return handleVipConfig(interaction);

  if (id === 'vip_escolher') {
    const cfg = await getCfg(interaction.guildId);
    const priceLabel = cfg.vipPriceLabel || DEFAULT_VIP_PRICE_LABEL;
    const c = new ContainerBuilder();
    if (cfg.vipColor) {
      const parsed = parseInt(cfg.vipColor, 16);
      if (!isNaN(parsed)) c.setAccentColor(parsed);
    }
    c.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${VIP_TAG} Adquirir VIP\n` +
        `Para comprar o VIP, entre em contato com a equipe do servidor.\n\n` +
        `**Plano:** ${VIP_TAG} ${priceLabel}\n` +
        `${COIN()} Após ativação, seus bônus são aplicados automaticamente.`,
      ),
    );
    return interaction.reply({
      components: [c],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (id === 'vip_carrinho') {
    // Verifica se o usuário tem algum VipGrant ativo
    const [cfg, grants] = await Promise.all([
      getCfg(interaction.guildId),
      prisma.vipGrant.findMany({
        where: {
          guildId: interaction.guildId,
          userId:  interaction.user.id,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const c = new ContainerBuilder();
    if (cfg.vipColor) {
      const parsed = parseInt(cfg.vipColor, 16);
      if (!isNaN(parsed)) c.setAccentColor(parsed);
    }
    if (grants.length === 0) {
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🛒 Meu Carrinho\nVocê não possui VIP ativo no momento.\n\n` +
          `Clique em **Escolher VIP** para adquirir.`,
        ),
      );
    } else {
      const linhas = grants.map(g => {
        const ts = Math.floor(g.expiresAt.getTime() / 1000);
        return `${VIP_TAG} Cargo <@&${g.roleId}> — expira <t:${ts}:R>`;
      });
      c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🛒 Meu Carrinho\n${linhas.join('\n')}`,
        ),
      );
    }
    return interaction.reply({
      components: [c],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
}

// ─── Comando ──────────────────────────────────────────────────────────────────
export default {
  name: 'vip',

  data: new SlashCommandBuilder()
    .setName('vip')
    .setDescription('🏷️ Sistema VIP do servidor')
    .addSubcommand(s =>
      s.setName('painel').setDescription('📢 Envia o painel VIP no canal atual'),
    )
    .addSubcommand(s =>
      s.setName('config').setDescription('⚙️ Abre o painel de configuração do VIP (apenas admins)'),
    )
    .addSubcommand(s =>
      s
        .setName('dar')
        .setDescription('👑 Concede um cargo VIP por tempo determinado')
        .addUserOption(option =>
          option.setName('membro').setDescription('Membro que receberá o VIP').setRequired(true),
        )
        .addRoleOption(option =>
          option.setName('cargo').setDescription('Cargo que dá acesso às molduras VIP').setRequired(true),
        )
        .addIntegerOption(option =>
          option
            .setName('tempo')
            .setDescription('Quantidade de tempo do VIP')
            .setMinValue(1)
            .setMaxValue(3650)
            .setRequired(true),
        )
        .addStringOption(option =>
          option
            .setName('unidade')
            .setDescription('Unidade de tempo')
            .setRequired(true)
            .addChoices(
              { name: 'Minutos', value: 'minutos' },
              { name: 'Horas', value: 'horas' },
              { name: 'Dias', value: 'dias' },
              { name: 'Meses (30 dias)', value: 'meses' },
            ),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'painel') {
      const cfg = await getCfgWithPlans(interaction.guildId);
      return interaction.reply(buildVipPanel(cfg, cfg.vipPlans));
    }

    if (sub === 'config') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Apenas administradores podem acessar as configurações do VIP.', ephemeral: true });
      }
      const cfg = await getCfg(interaction.guildId);
      return interaction.reply({ ...buildVipConfigPayload(cfg), ephemeral: true });
    }

    if (sub === 'dar') return grantVip(interaction);
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase() ?? 'painel';

    if (sub === 'config' || sub === 'c' || sub === 'cfg') {
      const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) return message.reply({ content: '❌ Apenas administradores podem acessar as configurações do VIP.' });
      const cfg = await getCfg(message.guildId);
      return message.reply({ ...buildVipConfigPayload(cfg) });
    }

    const cfg = await getCfgWithPlans(message.guildId);
    return message.reply(buildVipPanel(cfg, cfg.vipPlans));
  },
};

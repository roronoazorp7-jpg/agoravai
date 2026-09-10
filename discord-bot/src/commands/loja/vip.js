import {
  ChannelType,
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
const DEFAULT_VIP_INTRO = 'Aproveite seus benefícios exclusivos e configure sua própria call no servidor.';
const DEFAULT_VIP_TEXT  = () => [
  '🖼️ Permissão para enviar imagens, links e arquivos',
  '✨ Uso de figurinhas e emojis externos',
  '✏️ Alteração de apelido',
  '🎙️ Call VIP exclusiva e configurável',
].join('\n');
const DEFAULT_VIP_PRICE_LABEL = 'R$ 20/mes';
const DEFAULT_VIP_BTN_ESCOLHER  = 'Escolher VIP';
const DEFAULT_VIP_BTN_CARRINHO  = 'Meu carrinho';
const VIP_CALL_TOPIC_PREFIX = 'vip-call:';
const VIP_CUSTOM_ROLE_ANCHOR_ID = '1546692504966004786';
const VIP_CALL_REGIONS = new Set([
  'brazil',
  'hongkong',
  'india',
  'japan',
  'rotterdam',
  'russia',
  'singapore',
  'southafrica',
  'sydney',
  'us-central',
  'us-east',
  'us-south',
  'us-west',
]);

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

async function getActiveVipGrants(guildId, userId) {
  return prisma.vipGrant.findMany({
    where: {
      guildId,
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { expiresAt: 'desc' },
  });
}

function vipCallTopic(guildId, userId) {
  return `${VIP_CALL_TOPIC_PREFIX}${guildId}:${userId}`;
}

function vipCallName(member) {
  const base = (member?.displayName ?? member?.user?.username ?? 'membro')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18) || 'membro';
  return `call-${base}`;
}

function findVipCall(guild, userId) {
  const topic = vipCallTopic(guild.id, userId);
  return guild.channels.cache.find(channel => (
    channel.type === ChannelType.GuildVoice && channel.topic === topic
  ));
}

async function getVipCustomRole(guild, userId) {
  const record = await prisma.vipCustomRole.findUnique({
    where: {
      guildId_userId: {
        guildId: guild.id,
        userId,
      },
    },
  });
  if (!record) return null;

  const role = guild.roles.cache.get(record.roleId)
    ?? await guild.roles.fetch(record.roleId).catch(() => null);
  if (role) return { record, role };

  await prisma.vipCustomRole.delete({ where: { id: record.id } }).catch(() => {});
  return null;
}

async function getVipBotMember(interaction) {
  // Atualiza cargos e permissões no Discord antes da checagem. O membro em
  // cache pode continuar sem permissões atualizadas depois de uma alteração.
  return interaction.guild.members.fetchMe()
    .catch(() => interaction.guild.members.me ?? null);
}

function buildVipMemberPanel(cfg, grants, call, customRole, userId) {
  const container = new ContainerBuilder();
  if (cfg.vipColor) {
    const parsed = parseInt(cfg.vipColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  const expiration = Math.floor(grants[0].expiresAt.getTime() / 1000);
  const intro = cfg.vipIntro || 'Este é o seu espaço exclusivo para aproveitar os benefícios VIP.';
  const benefits = cfg.vipText || DEFAULT_VIP_TEXT();
  const role = customRole?.role;
  if (cfg.vipBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.vipBanner)),
    );
  }

  if (cfg.vipThumb) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## ${cfg.vipTitle || DEFAULT_VIP_TITLE}\n${intro}`,
        ))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.vipThumb)),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${cfg.vipTitle || DEFAULT_VIP_TITLE}\n${intro}`),
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '**Benefícios do VIP**',
      '🟢 Crie uma call temporária e configure o seu espaço.',
      '🟢 Crie e gerencie o seu próprio cargo personalizado.',
      '🟢 O cargo é estético e começa sem nenhuma permissão.',
      '',
      benefits,
    ].join('\n')),
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `✅ **VIP ativo**\nSeu acesso está liberado até <t:${expiration}:F> (<t:${expiration}:R>).\n` +
      'Gerencie aqui os seus benefícios:',
    ),
  );

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      '**Cargo personalizado**',
      role
        ? `🟢 Seu cargo: ${role}\nNome: **${role.name}** · Cor: **${roleColorSummary(role)}**${role.iconURL() ? ` · Ícone: [ver](<${role.iconURL()}>)` : ''}`
        : '⚪ Você ainda não criou seu cargo estético.',
      role
        ? 'Você pode editar o nome, as cores, o gradiente e o ícone a qualquer momento.'
        : 'Crie um cargo do seu jeitinho para usar no seu perfil e com seus amigos.',
    ].join('\n')),
  );
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    role
      ? new ButtonBuilder()
          .setCustomId(`vip_role_edit:${userId}:${role.id}`)
          .setLabel('Editar meu cargo')
          .setStyle(ButtonStyle.Primary)
      : new ButtonBuilder()
          .setCustomId(`vip_role_create:${userId}`)
          .setLabel('Criar meu cargo')
          .setStyle(ButtonStyle.Success),
    ...(role
      ? [new ButtonBuilder()
          .setCustomId(`vip_role_delete:${userId}:${role.id}`)
          .setLabel('Excluir cargo')
          .setStyle(ButtonStyle.Danger)]
      : []),
  ));

  container.addSeparatorComponents(new SeparatorBuilder());
  if (call) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Call temporária**',
        `🟢 ${call}`,
        `Nome: **${call.name}**`,
        'Configure nome, limite, bitrate, região e visibilidade.',
      ].join('\n')),
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vip_call_edit:${userId}:${call.id}`)
        .setLabel('Configurar call')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`vip_call_delete:${userId}:${call.id}`)
        .setLabel('Excluir call')
        .setStyle(ButtonStyle.Danger),
    ));
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Call temporária**\n⚪ Você ainda não criou sua call.\n' +
        'Crie uma call exclusiva e configure nome, limite, bitrate, região e visibilidade.',
      ),
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`vip_call_create:${userId}`)
        .setLabel('Criar call temporária')
        .setEmoji('🎙️')
        .setStyle(ButtonStyle.Success),
    ));
  }

  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vip_refresh:${userId}`)
      .setLabel('Atualizar painel')
      .setStyle(ButtonStyle.Secondary),
  );

  return { components: [container, refreshRow], flags: MessageFlags.IsComponentsV2 };
}

async function openVipMemberPanel(interaction) {
  let grants;
  try {
    grants = await getActiveVipGrants(interaction.guildId, interaction.user.id);
  } catch (error) {
    console.error('[VIP] Erro ao consultar VIP ativo:', error);
    return interaction.reply({
      content: '❌ Não consegui verificar seu VIP agora. Tente novamente em instantes.',
      ephemeral: true,
    });
  }

  if (grants.length === 0) {
    return interaction.reply({
      content: '❌ Você não possui um VIP ativo neste servidor.',
      ephemeral: true,
    });
  }

  const [cfg, call, customRole] = await Promise.all([
    getCfg(interaction.guildId),
    Promise.resolve(findVipCall(interaction.guild, interaction.user.id)),
    getVipCustomRole(interaction.guild, interaction.user.id),
  ]);
  return interaction.reply(buildVipMemberPanel(cfg, grants, call, customRole, interaction.user.id));
}

function buildVipCallModal({ mode, userId, call, member }) {
  const modal = new ModalBuilder()
    .setCustomId(
      mode === 'edit'
        ? `vip_call_modal_edit:${userId}:${call.id}`
        : `vip_call_modal_create:${userId}`,
    )
    .setTitle(mode === 'edit' ? 'Configurar call VIP' : 'Criar call VIP');

  const name = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Nome da call')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(call?.name ?? vipCallName(member));

  const limit = new TextInputBuilder()
    .setCustomId('limit')
    .setLabel('Limite de usuários (0 = ilimitado)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(2)
    .setValue(String(call?.userLimit ?? 0));

  const bitrate = new TextInputBuilder()
    .setCustomId('bitrate')
    .setLabel('Bitrate em kbps (8 a 384)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(3)
    .setValue(String(Math.round((call?.bitrate ?? 64000) / 1000)));

  const region = new TextInputBuilder()
    .setCustomId('region')
    .setLabel('Região (auto, brazil, us-east...)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(20)
    .setValue(call?.rtcRegion ?? 'auto');

  const visibility = new TextInputBuilder()
    .setCustomId('visibility')
    .setLabel('Visibilidade: privada ou publica')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(8)
    .setValue(call?.permissionOverwrites?.cache?.get(call.guild.roles.everyone.id)
      ?.deny?.has(PermissionFlagsBits.ViewChannel) ? 'privada' : 'publica');

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(limit),
    new ActionRowBuilder().addComponents(bitrate),
    new ActionRowBuilder().addComponents(region),
    new ActionRowBuilder().addComponents(visibility),
  );
  return modal;
}

function vipRoleName(member) {
  const base = (member?.displayName ?? member?.user?.username ?? 'membro')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'membro';
  return `VIP • ${base}`;
}

function formatRoleColor(color) {
  return typeof color === 'number' && color > 0
    ? color.toString(16).padStart(6, '0').toUpperCase()
    : '';
}

function roleColorSummary(role) {
  if (!role) return '';
  const primary = formatRoleColor(role.colors?.primaryColor);
  const secondary = formatRoleColor(role.colors?.secondaryColor);
  if (secondary) return `#${primary} → #${secondary}`;
  return primary ? `#${primary}` : role.hexColor;
}

function buildVipRoleModal({ mode, userId, role, member }) {
  const modal = new ModalBuilder()
    .setCustomId(
      mode === 'edit'
        ? `vip_role_modal_edit:${userId}:${role.id}`
        : `vip_role_modal_create:${userId}`,
    )
    .setTitle(mode === 'edit' ? 'Editar meu cargo VIP' : 'Criar meu cargo VIP');

  const name = new TextInputBuilder()
    .setCustomId('name')
    .setLabel('Nome do cargo')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)
    .setValue(role?.name ?? vipRoleName(member));

  const color = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Cor principal (hexadecimal)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(6)
    .setPlaceholder('Ex: FF4FD8 — deixe vazio para preto')
    .setValue(formatRoleColor(role?.colors?.primaryColor));

  const gradient = new TextInputBuilder()
    .setCustomId('gradient')
    .setLabel('Cor do gradiente (opcional)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(6)
    .setPlaceholder('Ex: 7B61FF — precisa da cor principal')
    .setValue(formatRoleColor(role?.colors?.secondaryColor));

  const icon = new TextInputBuilder()
    .setCustomId('icon')
    .setLabel('Ícone: URL, emoji personalizado ou comum')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(4000)
    .setPlaceholder('URL PNG/JPG/WebP, emoji ou "remover"')
    .setValue(role?.iconURL() ?? role?.unicodeEmoji ?? '');

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(color),
    new ActionRowBuilder().addComponents(gradient),
    new ActionRowBuilder().addComponents(icon),
  );
  return modal;
}

function parseVipRoleForm(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const colorRaw = interaction.fields.getTextInputValue('color').trim().replace(/^#/, '').toUpperCase();
  const gradientRaw = interaction.fields.getTextInputValue('gradient').trim().replace(/^#/, '').toUpperCase();
  const iconRaw = interaction.fields.getTextInputValue('icon').trim();

  if (!name) return { error: 'Informe um nome para o cargo.' };
  if (colorRaw && !/^[0-9A-F]{6}$/.test(colorRaw)) {
    return { error: 'A cor principal deve ter exatamente 6 caracteres hexadecimais, como `FF4FD8`.' };
  }
  if (gradientRaw && !/^[0-9A-F]{6}$/.test(gradientRaw)) {
    return { error: 'A cor do gradiente deve ter exatamente 6 caracteres hexadecimais, como `7B61FF`.' };
  }
  if (gradientRaw && !colorRaw) {
    return { error: 'Informe também uma cor principal para usar o gradiente.' };
  }
  const isCustomEmoji = /^<a?:[\w~+-]+:\d+>$/.test(iconRaw) || /^\d{17,20}$/.test(iconRaw);
  const isImageOrCustomEmoji = /^https?:\/\/\S+$/i.test(iconRaw) || isCustomEmoji;
  const isUnicodeEmoji = iconRaw && !isImageOrCustomEmoji && iconRaw.toLowerCase() !== 'remover'
    && iconRaw.length <= 8 && !/\s/.test(iconRaw);
  if (iconRaw && iconRaw.toLowerCase() !== 'remover' && !isImageOrCustomEmoji && !isUnicodeEmoji) {
    return { error: 'O ícone deve ser uma URL pública, emoji personalizado, emoji comum ou `remover`.' };
  }

  return {
    name,
    colors: {
      primaryColor: colorRaw ? parseInt(colorRaw, 16) : 0,
      ...(gradientRaw ? { secondaryColor: parseInt(gradientRaw, 16) } : {}),
    },
    // Undefined mantém o ícone atual ao editar; "remover" o limpa.
    icon: iconRaw.toLowerCase() === 'remover' || isImageOrCustomEmoji ? (iconRaw.toLowerCase() === 'remover' ? null : iconRaw) : undefined,
    unicodeEmoji: iconRaw.toLowerCase() === 'remover' ? null : (isUnicodeEmoji ? iconRaw : undefined),
  };
}

async function placeVipRoleBelowAnchor(guild, role, botMember) {
  const anchor = guild.roles.cache.get(VIP_CUSTOM_ROLE_ANCHOR_ID)
    ?? await guild.roles.fetch(VIP_CUSTOM_ROLE_ANCHOR_ID).catch(() => null);

  if (!anchor) {
    throw new Error(`O cargo de referência ${VIP_CUSTOM_ROLE_ANCHOR_ID} não foi encontrado.`);
  }
  if (anchor.id === guild.id || anchor.position <= 1) {
    throw new Error('O cargo de referência não permite colocar o cargo VIP abaixo dele.');
  }

  const targetPosition = anchor.position - 1;
  if (targetPosition >= botMember.roles.highest.position) {
    throw new Error('O cargo de referência está acima do meu cargo mais alto.');
  }

  await role.setPosition(targetPosition, {
    reason: `Cargo VIP mantido abaixo de ${VIP_CUSTOM_ROLE_ANCHOR_ID}`,
  });
}

function parseVipCallForm(interaction) {
  const name = interaction.fields.getTextInputValue('name').trim();
  const limit = Number(interaction.fields.getTextInputValue('limit').trim() || 0);
  const bitrate = Number(interaction.fields.getTextInputValue('bitrate').trim() || 64);
  const regionRaw = interaction.fields.getTextInputValue('region').trim().toLowerCase() || 'auto';
  const visibility = interaction.fields.getTextInputValue('visibility').trim().toLowerCase() || 'privada';

  if (!name) return { error: 'Informe um nome para a call.' };
  if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
    return { error: 'O limite deve ser um número inteiro entre 0 e 99.' };
  }
  if (!Number.isInteger(bitrate) || bitrate < 8 || bitrate > 384) {
    return { error: 'O bitrate deve ser um número inteiro entre 8 e 384 kbps.' };
  }
  if (regionRaw !== 'auto' && !VIP_CALL_REGIONS.has(regionRaw)) {
    return { error: 'Região inválida. Use `auto`, `brazil`, `us-east`, `us-west` ou outra região oficial do Discord.' };
  }
  if (!['privada', 'publica'].includes(visibility)) {
    return { error: 'A visibilidade deve ser `privada` ou `publica`.' };
  }
  return {
    name,
    userLimit: limit,
    bitrate: bitrate * 1000,
    rtcRegion: regionRaw === 'auto' ? null : regionRaw,
    isPrivate: visibility === 'privada',
  };
}

function callPermissionOverwrites(interaction, isPrivate) {
  const botId = interaction.client.user.id;
  const base = [
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.Stream,
        PermissionFlagsBits.UseVAD,
      ],
    },
  ];
  if (isPrivate) {
    base.unshift({
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  } else {
    base.unshift({
      id: interaction.guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  }
  return base;
}

function canManageVipCall(botMember) {
  const permissions = botMember?.permissions;
  return Boolean(
    permissions?.has(PermissionFlagsBits.Administrator)
    || permissions?.has(PermissionFlagsBits.ManageChannels),
  );
}

function canManageVipRole(botMember) {
  const permissions = botMember?.permissions;
  return Boolean(
    permissions?.has(PermissionFlagsBits.Administrator)
    || permissions?.has(PermissionFlagsBits.ManageRoles),
  );
}

function getVipVoiceOptions(interaction, form, extra = {}) {
  const maximumBitrate = Number(interaction.guild.maximumBitrate) || 96_000;
  const bitrate = Math.min(form.bitrate, maximumBitrate);
  const options = {
    ...extra,
    userLimit: form.userLimit,
    bitrate,
    permissionOverwrites: callPermissionOverwrites(interaction, form.isPrivate),
  };

  // "auto" deve deixar o Discord escolher a região. Enviar null em alguns
  // endpoints/versões pode causar uma rejeição desnecessária na criação.
  if (form.rtcRegion) options.rtcRegion = form.rtcRegion;
  return options;
}

async function refreshVipPanelMessage(interaction) {
  if (!interaction.message) return;
  const [cfg, grants, customRole] = await Promise.all([
    getCfg(interaction.guildId),
    getActiveVipGrants(interaction.guildId, interaction.user.id),
    getVipCustomRole(interaction.guild, interaction.user.id),
  ]);
  const call = findVipCall(interaction.guild, interaction.user.id);
  await interaction.message.edit(
    buildVipMemberPanel(cfg, grants, call, customRole, interaction.user.id),
  ).catch(() => {});
}

async function handleVipRoleButton(interaction) {
  const [action, userId, roleId] = interaction.customId.split(':');
  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: '❌ Apenas o dono deste VIP pode gerenciar este cargo.',
      ephemeral: true,
    });
  }
  if ((await getActiveVipGrants(interaction.guildId, userId)).length === 0) {
    return interaction.reply({
      content: '❌ Seu VIP não está mais ativo neste servidor.',
      ephemeral: true,
    });
  }

  if (action === 'vip_refresh') {
    await interaction.deferUpdate();
    return refreshVipPanelMessage(interaction);
  }

  const botMember = await getVipBotMember(interaction);
  if (!canManageVipRole(botMember)) {
    return interaction.reply({
      content: '❌ Eu preciso da permissão **Gerenciar Cargos** para criar e editar seu cargo VIP.',
      ephemeral: true,
    });
  }

  const existing = await getVipCustomRole(interaction.guild, userId);
  if (action === 'vip_role_create') {
    if (existing) {
      return interaction.reply({
        content: `❌ Você já possui um cargo VIP: ${existing.role}`,
        ephemeral: true,
      });
    }
    return interaction.showModal(buildVipRoleModal({
      mode: 'create',
      userId,
      member: interaction.member,
    }));
  }

  if (!existing || existing.role.id !== roleId) {
    return interaction.reply({
      content: '❌ Seu cargo VIP não existe mais. Use **Criar meu cargo** para criar outro.',
      ephemeral: true,
    });
  }

  if (action === 'vip_role_edit') {
    return interaction.showModal(buildVipRoleModal({
      mode: 'edit',
      userId,
      role: existing.role,
    }));
  }

  if (action === 'vip_role_delete') {
    if (!existing.role.editable) {
      return interaction.reply({
        content: '❌ Não consigo excluir esse cargo porque ele está acima do meu cargo mais alto.',
        ephemeral: true,
      });
    }
    await interaction.deferUpdate();
    const deleted = await existing.role
      .delete('Cargo VIP estético excluído pelo proprietário')
      .then(() => true)
      .catch(() => false);
    if (!deleted) {
      return interaction.followUp({
        content: '❌ Não consegui excluir esse cargo. Confira se meu cargo está acima dele.',
        ephemeral: true,
      });
    }
    await prisma.vipCustomRole.delete({ where: { id: existing.record.id } }).catch(() => {});
    return refreshVipPanelMessage(interaction);
  }
}

async function handleVipCallButton(interaction) {
  const [action, userId, channelId] = interaction.customId.split(':');
  if (interaction.user.id !== userId) {
    return interaction.reply({ content: '❌ Apenas o dono deste VIP pode gerenciar esta call.', ephemeral: true });
  }
  if ((await getActiveVipGrants(interaction.guildId, userId)).length === 0) {
    return interaction.reply({ content: '❌ Seu VIP não está mais ativo neste servidor.', ephemeral: true });
  }

  const existing = findVipCall(interaction.guild, userId);
  if (action === 'vip_call_create') {
    if (existing) {
      return interaction.reply({ content: `❌ Você já possui uma call VIP: ${existing}`, ephemeral: true });
    }
    return interaction.showModal(buildVipCallModal({
      mode: 'create',
      userId,
      member: interaction.member,
    }));
  }

  const call = existing?.id === channelId
    ? existing
    : await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!call || call.type !== ChannelType.GuildVoice) {
    return interaction.reply({ content: '❌ Essa call VIP não existe mais. Use **Criar call** para criar outra.', ephemeral: true });
  }

  if (action === 'vip_call_edit') {
    return interaction.showModal(buildVipCallModal({ mode: 'edit', userId, call }));
  }

  if (action === 'vip_call_delete') {
    await interaction.deferUpdate();
    await call.delete('Call VIP excluída pelo proprietário').catch(() => {});
    return refreshVipPanelMessage(interaction);
  }
}

export async function handleVipRoleModal(interaction) {
  const parts = interaction.customId.split(':');
  const mode = parts[0].replace('vip_role_modal_', '');
  const userId = parts[1];
  const roleId = parts[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({
      content: '❌ Apenas o dono deste VIP pode configurar este cargo.',
      ephemeral: true,
    });
  }
  if ((await getActiveVipGrants(interaction.guildId, userId)).length === 0) {
    return interaction.reply({
      content: '❌ Seu VIP não está mais ativo neste servidor.',
      ephemeral: true,
    });
  }

  const form = parseVipRoleForm(interaction);
  if (form.error) {
    return interaction.reply({ content: `❌ ${form.error}`, ephemeral: true });
  }

  const botMember = await getVipBotMember(interaction);
  if (!canManageVipRole(botMember)) {
    return interaction.reply({
      content: '❌ Eu preciso da permissão **Gerenciar Cargos** para criar e editar seu cargo VIP.',
      ephemeral: true,
    });
  }

  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return interaction.reply({
      content: '❌ Não consegui encontrar seu membro neste servidor.',
      ephemeral: true,
    });
  }

  const existing = await getVipCustomRole(interaction.guild, userId);
  if (mode === 'create' && existing) {
    return interaction.reply({
      content: `❌ Você já possui um cargo VIP: ${existing.role}`,
      ephemeral: true,
    });
  }
  if (mode === 'edit' && (!existing || existing.role.id !== roleId)) {
    return interaction.reply({
      content: '❌ Seu cargo VIP não existe mais. Use **Criar meu cargo** para criar outro.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    let role;
    if (mode === 'create') {
      role = await interaction.guild.roles.create({
        name: form.name,
        colors: form.colors,
        permissions: [],
        hoist: false,
        mentionable: false,
        ...(form.icon !== undefined ? { icon: form.icon } : {}),
        ...(form.unicodeEmoji !== undefined ? { unicodeEmoji: form.unicodeEmoji } : {}),
        reason: `Cargo VIP estético criado por ${interaction.user.tag}`,
      });

      try {
        await placeVipRoleBelowAnchor(interaction.guild, role, botMember);
        await member.roles.add(role, 'Cargo VIP estético atribuído ao proprietário');
        await prisma.vipCustomRole.create({
          data: {
            guildId: interaction.guildId,
            userId,
            roleId: role.id,
          },
        });
      } catch (error) {
        await role.delete('Rollback de cargo VIP estético').catch(() => {});
        throw error;
      }
    } else {
      role = existing.role;
      if (!role.editable) {
        return interaction.editReply(
          '❌ Não consigo editar esse cargo porque ele está acima do meu cargo mais alto.',
        );
      }

      await role.edit({
        name: form.name,
        colors: form.colors,
        permissions: [],
        hoist: false,
        mentionable: false,
        ...(form.icon !== undefined ? { icon: form.icon } : {}),
        ...(form.unicodeEmoji !== undefined ? { unicodeEmoji: form.unicodeEmoji } : {}),
        reason: 'Cargo VIP estético atualizado pelo proprietário',
      });
      await placeVipRoleBelowAnchor(interaction.guild, role, botMember);
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'Cargo VIP estético reatribuído ao proprietário');
      }
    }

    await refreshVipPanelMessage(interaction);
    return interaction.editReply(
      `✅ Seu cargo VIP foi ${mode === 'create' ? 'criado' : 'atualizado'} com sucesso: ${role}`,
    );
  } catch (error) {
    console.error('[VIP] Falha ao configurar cargo VIP:', error);
    return interaction.editReply(
      error?.code === 50013
        ? '❌ O Discord recusou a alteração. Confira se meu cargo está acima do cargo VIP e se tenho **Gerenciar Cargos**.'
        : '❌ Não consegui configurar seu cargo VIP. Tente novamente em instantes.',
    );
  }
}

export async function handleVipCallModal(interaction) {
  const parts = interaction.customId.split(':');
  const mode = parts[0].replace('vip_call_modal_', '');
  const userId = parts[1];
  const channelId = parts[2];

  if (interaction.user.id !== userId) {
    return interaction.reply({ content: '❌ Apenas o dono deste VIP pode configurar esta call.', ephemeral: true });
  }
  if ((await getActiveVipGrants(interaction.guildId, userId)).length === 0) {
    return interaction.reply({ content: '❌ Seu VIP não está mais ativo neste servidor.', ephemeral: true });
  }

  const form = parseVipCallForm(interaction);
  if (form.error) {
    return interaction.reply({ content: `❌ ${form.error}`, ephemeral: true });
  }

  const botMember = await getVipBotMember(interaction);
  if (!canManageVipCall(botMember)) {
    return interaction.reply({
      content: '❌ Não consegui confirmar **Administrador** ou **Gerenciar Canais** no cargo do bot neste servidor. ' +
        'Atualize as permissões do bot e tente novamente.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    let call;
    if (mode === 'edit') {
      call = await interaction.guild.channels.fetch(channelId).catch(() => null);
      if (
        !call ||
        call.type !== ChannelType.GuildVoice ||
        call.topic !== vipCallTopic(interaction.guildId, userId)
      ) {
        return interaction.editReply('❌ Essa call VIP não existe mais. Use o botão **Criar call**.');
      }

      await call.edit({
        name: form.name,
        ...getVipVoiceOptions(interaction, form),
      }, 'Configuração da call VIP atualizada pelo proprietário');
    } else {
      const parentId = interaction.channel?.parent?.type === ChannelType.GuildCategory
        ? interaction.channel.parentId
        : undefined;
      call = await interaction.guild.channels.create({
        name: form.name || vipCallName(interaction.member),
        type: ChannelType.GuildVoice,
        parent: parentId,
        topic: vipCallTopic(interaction.guildId, userId),
        ...getVipVoiceOptions(interaction, form),
      });
    }

    await refreshVipPanelMessage(interaction);
    return interaction.editReply(
      `✅ Call VIP ${mode === 'edit' ? 'atualizada' : 'criada'} com sucesso: ${call}`,
    );
  } catch (error) {
    console.error('[VIP] Falha ao configurar call VIP:', error);
    const permissionError = error?.code === 50013;
    return interaction.editReply(
      permissionError
        ? '❌ O Discord recusou a criação da call. Confira se o cargo do bot tem **Administrador** ou **Gerenciar Canais** e se ele consegue acessar a categoria escolhida.'
        : '❌ Não consegui configurar essa call. Tente novamente e confira os valores informados.',
    );
  }
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
  if (role?.managed || role?.id === interaction.guild.id) {
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

  if (role) {
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
  }

  const now = new Date();
  const existing = await prisma.vipGrant.findUnique({
    where: {
      guildId_userId_roleId: {
        guildId: interaction.guildId,
        userId: user.id,
        roleId: role?.id ?? '',
      },
    },
  });
  const startsAt = existing?.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = new Date(startsAt.getTime() + amount * VIP_TIME_UNITS[unit]);

  try {
    if (role) await member.roles.add(role, `VIP concedido por ${interaction.user.tag}`);
    await prisma.vipGrant.upsert({
      where: {
        guildId_userId_roleId: {
          guildId: interaction.guildId,
          userId: user.id,
        roleId: role?.id ?? '',
        },
      },
      create: { guildId: interaction.guildId, userId: user.id, roleId: role?.id ?? '', expiresAt },
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
      `**Cargo:** ${role ? role : 'VIP direto (sem cargo)'}\n` +
      `**Duração adicionada:** ${formatVipDuration(amount, unit)}\n` +
      `**Expira:** <t:${expiration}:F> (<t:${expiration}:R>)`,
    ephemeral: false,
  });
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

  if (id.startsWith('vip_call_')) return handleVipCallButton(interaction);
  if (id.startsWith('vip_role_') || id.startsWith('vip_refresh')) {
    return handleVipRoleButton(interaction);
  }
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
    .addStringOption(option =>
      option
        .setName('acao')
        .setDescription('Ação administrativa opcional')
        .addChoices(
          { name: 'Abrir configuração (admin)', value: 'config' },
          { name: 'Conceder VIP (admin)', value: 'dar' },
        ),
    )
    .addUserOption(option =>
      option.setName('membro').setDescription('Membro que receberá o VIP (ação: conceder)'),
    )
    .addIntegerOption(option =>
      option
        .setName('tempo')
        .setDescription('Quantidade de tempo do VIP (ação: conceder)')
        .setMinValue(1)
        .setMaxValue(3650),
    )
    .addStringOption(option =>
      option
        .setName('unidade')
        .setDescription('Unidade de tempo (ação: conceder)')
        .addChoices(
          { name: 'Minutos', value: 'minutos' },
          { name: 'Horas', value: 'horas' },
          { name: 'Dias', value: 'dias' },
          { name: 'Meses (30 dias)', value: 'meses' },
        ),
    )
    .addRoleOption(option =>
      option.setName('cargo').setDescription('Cargo opcional que também dará acesso ao VIP'),
    ),

  async execute(interaction) {
    const action = interaction.options.getString('acao');

    if (action === 'config') {
      const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) {
        return interaction.reply({ content: '❌ Apenas administradores podem acessar as configurações do VIP.', ephemeral: true });
      }
      const cfg = await getCfg(interaction.guildId);
      return interaction.reply({ ...buildVipConfigPayload(cfg), ephemeral: true });
    }

    if (action === 'dar') return grantVip(interaction);
    return openVipMemberPanel(interaction);
  },

  async executePrefix(message, args) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'config' || sub === 'c' || sub === 'cfg') {
      const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
      if (!isAdmin) return message.reply({ content: '❌ Apenas administradores podem acessar as configurações do VIP.' });
      const cfg = await getCfg(message.guildId);
      return message.reply({ ...buildVipConfigPayload(cfg) });
    }

    const fakeInteraction = {
      guildId: message.guildId,
      guild: message.guild,
      user: message.author,
      member: message.member,
      client: message.client,
      reply: payload => message.reply(payload),
    };
    return openVipMemberPanel(fakeInteraction);
  },
};

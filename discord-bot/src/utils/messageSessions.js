import {
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';

// ─── Session store ─────────────────────────────────────────────────────────────

const sessions = new Map();

// Guarda config dos menus publicados (messageId → selectMenu config)
export const publishedMenus = new Map();

// Guarda textos dos botões info (messageId → [texto0, texto1, ...])
export const publishedInfoBtns = new Map();

function key(userId, guildId) { return `${guildId}_${userId}`; }

export function createMsgSession(userId, guildId, options = {}) {
  const s = {
    userId,
    guildId,
    globalMode:   options.globalMode === true,
    accentColor: 0x5865F2,
    blocks: [],
    thumbnail:   null,
    banner:      null,
    msgButtons:  [],
    selectMenu:  null,  // { placeholder, options: [{emoji, label, description, roleId?}] }
    previewMessageId: null,
    previewChannelId: null,
  };
  sessions.set(key(userId, guildId), s);
  return s;
}

export function getMsgSession(userId, guildId) {
  return sessions.get(key(userId, guildId)) ?? null;
}

export function deleteMsgSession(userId, guildId) {
  sessions.delete(key(userId, guildId));
}

export function msgTotalCount(session) {
  return (
    session.blocks.length +
    session.msgButtons.length +
    (session.banner    ? 1 : 0) +
    (session.thumbnail ? 1 : 0) +
    (session.selectMenu?.options?.length > 0 ? 1 : 0)
  );
}

// ─── Builders internos ─────────────────────────────────────────────────────────

function buildSection(blocks, color, headerText) {
  let desc = headerText ? `${headerText}\n\n` : '';
  for (const block of blocks) {
    if (block.type === 'roles') {
      for (const roleId of block.roleIds) desc += `• <@&${roleId}>\n`;
      desc += '\n';
    } else if (block.type === 'text') {
      desc += `${block.content}\n\n`;
    }
  }
  const embed = new EmbedBuilder().setDescription(desc.trim() || '\u200b');
  if (color !== null) embed.setColor(color);
  return embed;
}

const BTN_STYLE_FROM_KEY = {
  azul:      ButtonStyle.Primary,
  cinza:     ButtonStyle.Secondary,
  verde:     ButtonStyle.Success,
  vermelho:  ButtonStyle.Danger,
};

function resolveStyle(key) {
  return BTN_STYLE_FROM_KEY[key?.toLowerCase()] ?? ButtonStyle.Secondary;
}

function buildPublishedButtonRow(msgButtons) {
  if (!msgButtons?.length) return null;
  const row = new ActionRowBuilder();
  for (const [i, btn] of msgButtons.slice(0, 5).entries()) {
    if (btn.type === 'role') {
      row.addComponents(
        new ButtonBuilder().setCustomId(`msg_rb_${btn.roleId}`).setLabel(btn.label).setStyle(resolveStyle(btn.style))
      );
    } else if (btn.type === 'link') {
      row.addComponents(
        new ButtonBuilder().setURL(btn.url).setLabel(btn.label).setStyle(ButtonStyle.Link)
      );
    } else if (btn.type === 'info') {
      row.addComponents(
        new ButtonBuilder().setCustomId(`msg_info_${i}`).setLabel(btn.label).setStyle(resolveStyle(btn.style))
      );
    }
  }
  return row;
}

function buildPublishedSelectMenu(selectMenu) {
  if (!selectMenu?.options?.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('msg_ms')
    .setPlaceholder(selectMenu.placeholder || 'Selecione uma opção...')
    .addOptions(
      selectMenu.options.map((opt, i) => {
        const o = new StringSelectMenuOptionBuilder()
          .setLabel(opt.label)
          .setValue(opt.roleId ? `r:${opt.roleId}` : `t:${i}`);
        if (opt.emoji) {
          try { o.setEmoji(opt.emoji); } catch {}
        }
        if (opt.description) o.setDescription(opt.description.slice(0, 100));
        return o;
      })
    );
  return new ActionRowBuilder().addComponents(menu);
}

// ─── buildMsgPayloadV2 (sem lateral — múltiplos containers p/ gap visual) ──────

function buildMsgPayloadV2(session) {
  const containers = [];
  let current = new ContainerBuilder();
  let pendingText = '';
  let currentHasContent = false;

  const flushText = () => {
    const t = pendingText.trimEnd();
    if (t) {
      current.addTextDisplayComponents(new TextDisplayBuilder().setContent(t));
      pendingText = '';
      currentHasContent = true;
    }
  };

  // Finaliza container atual e começa um novo (cria o "pulo" visual)
  const newSection = () => {
    flushText();
    if (currentHasContent) {
      containers.push(current);
      current = new ContainerBuilder();
      currentHasContent = false;
    }
  };

  if (session.blocks.length === 0) {
    current.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# 💬 Mensagem vazia — use os botões abaixo para adicionar blocos.')
    );
    containers.push(current);
  } else {
    for (const block of session.blocks) {
      if (block.type === 'text') {
        pendingText += block.content + '\n\n';
      } else if (block.type === 'roles') {
        for (const roleId of block.roleIds) pendingText += `• <@&${roleId}>\n`;
        pendingText += '\n';
      } else if (block.type === 'separator') {
        newSection();
        if (block.content) {
          current.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
          currentHasContent = true;
        }
      } else if (block.type === 'separator_img') {
        newSection();
        const gallery = new MediaGalleryBuilder();
        gallery.addItems(new MediaGalleryItemBuilder().setURL(block.url));
        current.addMediaGalleryComponents(gallery);
        currentHasContent = true;
        // imagem isolada → fecha container imediatamente para criar o gap depois
        containers.push(current);
        current = new ContainerBuilder();
        currentHasContent = false;
      }
    }
    flushText();
    if (currentHasContent) containers.push(current);
  }

  if (session.banner) {
    const bannerCont = new ContainerBuilder();
    const gallery = new MediaGalleryBuilder();
    gallery.addItems(new MediaGalleryItemBuilder().setURL(session.banner));
    bannerCont.addMediaGalleryComponents(gallery);
    containers.push(bannerCont);
  }

  const components = [
    ...containers,
    buildPublishedButtonRow(session.msgButtons),
    buildPublishedSelectMenu(session.selectMenu),
  ].filter(Boolean);

  return { components, flags: MessageFlags.IsComponentsV2 };
}

// ─── buildMsgPayload ───────────────────────────────────────────────────────────

export function buildMsgPayload(session) {
  if (session.accentColor === null) return buildMsgPayloadV2(session);

  let embeds;

  if (session.blocks.length === 0) {
    const empty = new EmbedBuilder()
      .setDescription('-# 💬 Mensagem vazia — use os botões abaixo para adicionar blocos.')
      .setColor(session.accentColor);
    embeds = [empty];
  } else {
    // Lógica original: cada separator inicia um novo embed (gap visual)
    const sections = [];
    let currentHeader = null;
    let currentBlocks = [];

    for (const block of session.blocks) {
      if (block.type === 'separator') {
        sections.push({ header: currentHeader, blocks: currentBlocks, img: null });
        currentHeader = block.content;
        currentBlocks = [];
      } else if (block.type === 'separator_img') {
        sections.push({ header: currentHeader, blocks: currentBlocks, img: null });
        currentHeader = null;
        currentBlocks = [];
        sections.push({ header: null, blocks: [], img: block.url }); // embed isolado com imagem
      } else {
        currentBlocks.push(block);
      }
    }
    sections.push({ header: currentHeader, blocks: currentBlocks, img: null });

    embeds = sections
      .filter(s => s.img !== null || s.header !== null || s.blocks.length > 0)
      .slice(0, 10)
      .map(s => {
        if (s.img !== null) {
          return new EmbedBuilder().setImage(s.img).setColor(session.accentColor);
        }
        return buildSection(s.blocks, session.accentColor, s.header);
      });
  }

  if (session.thumbnail && embeds.length > 0) embeds[0].setThumbnail(session.thumbnail);
  if (session.banner    && embeds.length > 0) embeds[embeds.length - 1].setImage(session.banner);

  const components = [
    buildPublishedButtonRow(session.msgButtons),
    buildPublishedSelectMenu(session.selectMenu),
  ].filter(Boolean);

  return { embeds, components };
}

// ─── Painéis de controle ───────────────────────────────────────────────────────

export function buildMsgMainControls(session) {
  const total = msgTotalCount(session);
  const isGlobal = session.globalMode === true;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_add_role').setLabel('Cargo').setStyle(ButtonStyle.Primary).setEmoji('👤').setDisabled(isGlobal),
      new ButtonBuilder().setCustomId('msg_add_text').setLabel('Texto').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('msg_add_sep').setLabel('Texto 2').setStyle(ButtonStyle.Secondary).setEmoji('➕'),
      new ButtonBuilder().setCustomId('msg_color').setLabel('Cor').setStyle(ButtonStyle.Secondary).setEmoji('🎨'),
      new ButtonBuilder().setCustomId('msg_add_cargos').setLabel('Adicionar Cargos').setStyle(ButtonStyle.Secondary).setEmoji('➕').setDisabled(isGlobal),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_banner').setLabel('Banner').setStyle(ButtonStyle.Secondary).setEmoji('🖼️'),
      new ButtonBuilder().setCustomId('msg_thumb').setLabel('Miniatura').setStyle(ButtonStyle.Secondary).setEmoji('🔷'),
      new ButtonBuilder().setCustomId('msg_sep_img').setLabel('Imagem').setStyle(ButtonStyle.Secondary).setEmoji('🌄'),
      new ButtonBuilder().setCustomId('msg_add_btn').setLabel('Botão').setStyle(ButtonStyle.Secondary).setEmoji('🔘').setDisabled(session.msgButtons.length >= 5),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_remove_last').setLabel('Remover Último').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setDisabled(total === 0),
      new ButtonBuilder()
        .setCustomId(isGlobal ? 'msg_global_send' : 'msg_publish')
        .setLabel(isGlobal ? 'Enviar para todos' : 'Publicar')
        .setStyle(ButtonStyle.Success)
        .setEmoji(isGlobal ? '📣' : '✅')
        .setDisabled(total === 0),
      new ButtonBuilder().setCustomId('msg_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    ),
  ];
}

export function buildMsgButtonTypeSelector(globalMode = false) {
  if (globalMode) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('msg_btn_link').setLabel('🔗 Link (abre URL)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
      ),
    ];
  }

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_btn_info').setLabel('💬 Info (mostra texto)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('msg_btn_link').setLabel('🔗 Link (abre URL)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
    ),
  ];
}

export function buildCargoRoleSelector() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('msg_cargo_sel')
        .setPlaceholder('Selecione os cargos para o menu dropdown...')
        .setMinValues(1)
        .setMaxValues(25)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
    ),
  ];
}

export function buildMsgMenuEditor(session) {
  const opts = session.selectMenu?.options ?? [];
  const hasMenu = !!session.selectMenu;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_menu_add_opt').setLabel('Adicionar Opção').setStyle(ButtonStyle.Primary).setEmoji('➕').setDisabled(opts.length >= 25),
      new ButtonBuilder().setCustomId('msg_menu_rm_opt').setLabel('Remover Última').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setDisabled(opts.length === 0),
      new ButtonBuilder().setCustomId('msg_menu_save').setLabel('Salvar Menu').setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(opts.length === 0),
      new ButtonBuilder().setCustomId('msg_menu_clear').setLabel('Limpar Tudo').setStyle(ButtonStyle.Danger).setEmoji('🔄').setDisabled(!hasMenu),
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setEmoji('↩️'),
    ),
  ];
}

export function buildMsgColorPicker() {
  const COLORS = [
    { label: '🚫 Sem Lateral', id: 'none'   },
    { label: '🟣 Roxo',      id: 'purple' },
    { label: '🔵 Azul',      id: 'blue'   },
    { label: '🩵 Ciano',     id: 'cyan'   },
    { label: '🟢 Verde',     id: 'green'  },
    { label: '🟡 Amarelo',   id: 'yellow' },
    { label: '🔴 Vermelho',  id: 'red'    },
    { label: '🟠 Laranja',   id: 'orange' },
  ];
  return [
    new ActionRowBuilder().addComponents(
      ...COLORS.slice(0, 4).map(c =>
        new ButtonBuilder().setCustomId(`msg_color_${c.id}`).setLabel(c.label).setStyle(ButtonStyle.Secondary)
      )
    ),
    new ActionRowBuilder().addComponents(
      ...COLORS.slice(4).map(c =>
        new ButtonBuilder().setCustomId(`msg_color_${c.id}`).setLabel(c.label).setStyle(ButtonStyle.Secondary)
      )
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
    ),
  ];
}

export function buildRoleSelector() {
  return [
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder()
        .setCustomId('msg_role_sel')
        .setPlaceholder('Selecione um ou mais cargos...')
        .setMinValues(1)
        .setMaxValues(10)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
    ),
  ];
}

export const MSG_COLOR_MAP = {
  none:   null,
  purple: 0x9B4FD6,
  blue:   0x5865F2,
  cyan:   0x00B0F4,
  green:  0x57F287,
  yellow: 0xFEE75C,
  red:    0xED4245,
  orange: 0xE67E22,
};

export function buildSepTypeSelector() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('msg_sep_text').setLabel('Texto').setStyle(ButtonStyle.Primary).setEmoji('📝'),
      new ButtonBuilder().setCustomId('msg_sep_img').setLabel('Imagem').setStyle(ButtonStyle.Primary).setEmoji('🖼️'),
      new ButtonBuilder().setCustomId('msg_back').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
    ),
  ];
}

// ─── parseMsgFromMessage ────────────────────────────────────────────────────
// Tenta reconstruir os blocos de uma sessão a partir de uma mensagem publicada.
export function parseMsgFromMessage(message) {
  const result = {
    blocks:      [],
    accentColor: 0x5865F2,
    thumbnail:   null,
    banner:      null,
  };

  const embeds = message.embeds ?? [];

  // Mensagem de embed (accentColor != null no original)
  if (embeds.length > 0) {
    const first = embeds[0];
    result.accentColor = first.color ?? 0x5865F2;
    result.thumbnail   = first.thumbnail?.url ?? null;

    for (let i = 0; i < embeds.length; i++) {
      const embed = embeds[i];

      // Embed com só imagem → separator_img
      if (embed.image?.url && !embed.description) {
        result.blocks.push({ type: 'separator_img', url: embed.image.url });
        if (i === embeds.length - 1) result.banner = embed.image.url;
        continue;
      }

      // Banner no último embed
      if (embed.image?.url && i === embeds.length - 1) {
        result.banner = embed.image.url;
      }

      // Adiciona separador entre embeds (exceto no primeiro)
      if (i > 0) {
        result.blocks.push({ type: 'separator', content: '' });
      }

      const desc = embed.description ?? '';
      const lines = desc.split('\n');
      let roleIds    = [];
      let pendingTxt = '';

      const flushRoles = () => {
        if (roleIds.length > 0) {
          result.blocks.push({ type: 'roles', roleIds: [...roleIds] });
          roleIds = [];
        }
      };
      const flushText = () => {
        const t = pendingTxt.trim();
        if (t) {
          result.blocks.push({ type: 'text', content: t });
          pendingTxt = '';
        }
      };

      for (const line of lines) {
        const roleMatch = line.match(/^•\s*<@&(\d+)>/);
        if (roleMatch) {
          flushText();
          roleIds.push(roleMatch[1]);
        } else {
          flushRoles();
          if (line.trim()) {
            pendingTxt += (pendingTxt ? '\n' : '') + line;
          }
        }
      }
      flushRoles();
      flushText();
    }
    return result;
  }

  // Mensagem Components V2 — tenta extrair texto dos TextDisplay
  if (message.components?.length > 0) {
    result.accentColor = null; // sem cor lateral
    for (const row of message.components) {
      for (const comp of (row.components ?? [])) {
        // TextDisplay (type 10 nos dados brutos)
        if (comp.type === 10 && comp.content) {
          const lines = comp.content.split('\n');
          let roleIds    = [];
          let pendingTxt = '';

          const flushRoles = () => {
            if (roleIds.length > 0) {
              result.blocks.push({ type: 'roles', roleIds: [...roleIds] });
              roleIds = [];
            }
          };
          const flushText = () => {
            const t = pendingTxt.trim();
            if (t) {
              result.blocks.push({ type: 'text', content: t });
              pendingTxt = '';
            }
          };

          for (const line of lines) {
            const roleMatch = line.match(/^•\s*<@&(\d+)>/);
            if (roleMatch) {
              flushText();
              roleIds.push(roleMatch[1]);
            } else {
              flushRoles();
              if (line.trim()) pendingTxt += (pendingTxt ? '\n' : '') + line;
            }
          }
          flushRoles();
          flushText();
        }
      }
    }
  }

  return result;
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  MessageFlags,
} from 'discord.js';
import { buildConfigEmbed, Colors } from './embed.js';

// ─── Emoji helper — valida antes de enviar à API do Discord ──────────────────
// Emojis customizados com IDs inválidos (não-snowflake) causam COMPONENT_INVALID_EMOJI.
// Retorna objeto/string seguro para setEmoji(), ou null se inválido.
function parseEmoji(raw) {
  if (!raw) return null;
  const s = raw.trim();
  const match = s.match(/^<(a?):([^:>\s]+):(\d+)>$/);
  if (match) {
    const id = match[3];
    if (id.length < 17 || id.length > 20) return null; // ID inválido — não envia
    return { animated: match[1] === 'a', name: match[2], id };
  }
  return s || null;
}

// ─── Botão de abrir ticket ────────────────────────────────────────────────────

const BTN_STYLE_MAP = {
  Primary:   ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success:   ButtonStyle.Success,
  Danger:    ButtonStyle.Danger,
};

export function buildTicketOpenButton(cfg) {
  const label  = cfg.ticketBtnLabel || 'Abrir Ticket';
  const style  = BTN_STYLE_MAP[cfg.ticketBtnStyle] ?? ButtonStyle.Primary;
  const btn    = new ButtonBuilder().setCustomId('ticket_open').setLabel(label).setStyle(style);
  const emoji  = parseEmoji(cfg.ticketBtnEmoji) ?? '🎫';
  try { btn.setEmoji(emoji); } catch { btn.setEmoji('🎫'); }
  return btn;
}

// ─── Painel público V2 (sem barra lateral quando sem cor) ─────────────────────

// options = array de TicketOption do banco (passados pelo caller que faz query assíncrona)
export function buildTicketPanelV2(cfg, options = [], client = null) {
  const container = new ContainerBuilder();
  const bannerPos = cfg.ticketBannerPosition ?? 'top';

  // Só define accentColor se o admin configurou uma cor — sem cor = sem barra lateral
  if (cfg.ticketColor) {
    const parsed = parseInt(cfg.ticketColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  const onlyBanner = cfg.ticketOnlyBanner ?? false;

  if (onlyBanner) {
    // Modo só banner: apenas imagem + botão/menu, sem nenhum texto
    if (cfg.ticketBanner) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.ticketBanner)),
      );
    }
  } else {
    const base = cfg.ticketText ?? DEFAULT_TICKET_TEXT;
    const body = cfg.ticketUseSeparator
      ? `──────────────────────────────────\n\n${base}`
      : base;

    const titleLine = cfg.ticketTitle ? `## ${cfg.ticketTitle}\n\n` : '';
    const fullText  = `${titleLine}${body}`;

    // Banner no topo
    if (cfg.ticketBanner && bannerPos === 'top') {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.ticketBanner)),
      );
    }

    if (cfg.ticketThumb) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.ticketThumb));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText));
    }

    if (cfg.ticketFooter) {
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${cfg.ticketFooter}`));
    }

    // Banner na base
    if (cfg.ticketBanner && bannerPos === 'bottom') {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.ticketBanner)),
      );
    }
  }

  // ── Modo menu (select) ou botão único ────────────────────────────────────
  const useMenu = cfg.ticketUseMenu && options.length > 0;
  if (useMenu) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('ticket_menu_sel')
      .setPlaceholder(cfg.ticketBtnLabel || 'Selecione o tipo de suporte…')
      .addOptions(
        options.map(o => {
          const opt = new StringSelectMenuOptionBuilder()
            .setLabel(o.label.slice(0, 100))
            .setValue(o.id)
            .setDescription((o.description?.slice(0, 100)) || 'Clique para abrir um ticket');
          const emoji = parseEmoji(o.emoji);
          if (emoji) {
            if (typeof emoji === 'string') {
              try { opt.setEmoji(emoji); } catch {}
            } else if (client?.emojis?.cache?.has(emoji.id)) {
              try { opt.setEmoji(emoji); } catch {}
            }
            // customizado sem acesso → omite (evita COMPONENT_INVALID_EMOJI)
          }
          return opt;
        }),
      );
    const row = new ActionRowBuilder().addComponents(select);
    return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
  }

  const row = new ActionRowBuilder().addComponents(buildTicketOpenButton(cfg));
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

export function buildTellonymPanelV2(cfg) {
  const container = new ContainerBuilder();

  // Só define accentColor se o admin configurou uma cor — sem cor = sem barra lateral
  if (cfg.tellonymColor) {
    const parsed = parseInt(cfg.tellonymColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  // null = nunca configurado → usa texto padrão; '' = usuário limpou → sem texto
  const body      = (cfg.tellonymText == null) ? DEFAULT_TELLONYM_TEXT : cfg.tellonymText;
  const titleLine = cfg.tellonymTitle ? `## ${cfg.tellonymTitle}\n\n` : '';
  const fullText  = `${titleLine}${body}`.trim();

  if (cfg.tellonymBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.tellonymBanner)),
    );
  }

  if (fullText) {
    if (cfg.tellonymThumb) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(cfg.tellonymThumb));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText));
    }
  }

  if (cfg.tellonymFooter) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${cfg.tellonymFooter}`));
  }

  const btnLabel = cfg.tellonymBtnLabel?.trim() || 'Enviar Mensagem';
  const btnEmoji = cfg.tellonymBtnEmoji?.trim() || '💌';
  const sendBtn = new ButtonBuilder().setCustomId('tellonym_send').setLabel(btnLabel).setStyle(ButtonStyle.Secondary);
  try { sendBtn.setEmoji(parseEmoji(btnEmoji) ?? '💌'); } catch { sendBtn.setEmoji('💌'); }
  const row = new ActionRowBuilder().addComponents(sendBtn);
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

export function buildTellonymChoicePanelV2() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 💌 Enviar mensagem\n\nEscolha como deseja enviar sua mensagem.',
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '-# Você pode enviar de forma anônima ou marcar alguém da comunidade.',
      ),
    );

  const anonymousButton = new ButtonBuilder()
    .setCustomId('tellonym_anon')
    .setLabel('Anônimo')
    .setEmoji('🕵️')
    .setStyle(ButtonStyle.Secondary);
  const taggedButton = new ButtonBuilder()
    .setCustomId('tellonym_tag')
    .setLabel('Marcar alguém')
    .setEmoji('🎯')
    .setStyle(ButtonStyle.Primary);

  return {
    components: [container, new ActionRowBuilder().addComponents(anonymousButton, taggedButton)],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function buildTellonymComposerPanelV2(session = {}) {
  const targetIds = session.targetIds ?? [];
  const targetText = targetIds.length
    ? targetIds.map(id => `<@${id}>`).join(' ')
    : 'Nenhuma pessoa selecionada ainda';
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 💌 Mandar uma tell\n\n' +
        '⚠️ **Não compartilhe sua senha ou outras informações confidenciais.**\n\n' +
        `**Para quem**\n${targetText}\n\n` +
        '-# Escolha uma ou mais pessoas e avance para escrever sua mensagem.',
      ),
    );
  const select = new UserSelectMenuBuilder()
    .setCustomId('tellonym_target')
    .setPlaceholder('Faça uma seleção')
    .setMinValues(1)
    .setMaxValues(5);
  const next = new ButtonBuilder()
    .setCustomId('tellonym_message')
    .setLabel('Continuar')
    .setEmoji('✍️')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(!targetIds.length);
  return {
    components: [
      container,
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(next),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function buildTellonymIdentityPanelV2(session = {}) {
  const targets = (session.targetIds ?? []).map(id => `<@${id}>`).join(' ');
  const preview = String(session.message ?? '').slice(0, 700);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 💌 Mandar uma tell\n\n**Para quem**\n${targets}\n\n` +
        `**Mensagem**\n> ${preview.replace(/\n/g, '\n> ')}`,
      ),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tellonym_identity_anon')
      .setLabel('Anônimo')
      .setEmoji('🕵️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('tellonym_identity_public')
      .setLabel('Mostrar meu nome')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Secondary),
  );
  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

// ─── Botões de Config ─────────────────────────────────────────────────────────

export function ticketConfigButtons(cfg = {}) {
  const sepEnabled  = cfg.ticketUseSeparator ?? false;
  const bannerPos   = cfg.ticketBannerPosition ?? 'top';
  const onlyBanner  = cfg.ticketOnlyBanner ?? false;
  const useMenu     = cfg.ticketUseMenu ?? false;
  const aiEnabled   = cfg.ticketAiEnabled ?? false;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tcfg_cor').setLabel('Cor').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_sem_cor').setLabel('Sem Lateral').setEmoji('◻️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_titulo').setLabel('Título').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_banner').setLabel('Banner').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_thumb').setLabel('Thumbnail').setEmoji('📷').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tcfg_botao').setLabel('Botão / Menu').setEmoji('🔘').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_rodape').setLabel('Rodapé').setEmoji('👇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_texto').setLabel('Texto').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_abertura').setLabel('Txt Abertura').setEmoji('💬').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_separador').setLabel('Separador').setEmoji('➖').setStyle(sepEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tcfg_categoria').setLabel('Categoria').setEmoji('📂').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tcfg_enviar').setLabel('Enviar Painel').setEmoji('🚀').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tcfg_ping').setLabel('Ping Cargos').setEmoji('🔔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tcfg_ping_user').setLabel('Ping Usuários').setEmoji('👤').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tcfg_banner_pos').setLabel(bannerPos === 'top' ? 'Banner ⬆️ Cima' : 'Banner ⬇️ Baixo').setStyle(ButtonStyle.Secondary),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tcfg_use_menu').setLabel('Modo Menu').setEmoji('📋').setStyle(useMenu ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_menu_opts').setLabel('Opções do Menu').setEmoji('⚙️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tcfg_only_banner').setLabel('Só Banner').setEmoji('🖼️').setStyle(onlyBanner ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_salvar').setLabel('Salvar Preset').setEmoji('💾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg_carregar').setLabel('Carregar Preset').setEmoji('📂').setStyle(ButtonStyle.Secondary),
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tcfg_ai')
      .setLabel(aiEnabled ? 'IA Ativa' : 'Atendimento por IA')
      .setEmoji('🤖')
      .setStyle(aiEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  return [row1, row2, row3, row4, row5];
}

export function tellonymConfigButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tncfg_cor').setLabel('Cor').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_sem_cor').setLabel('Sem Lateral').setEmoji('◻️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_titulo').setLabel('Título').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_banner').setLabel('Banner').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_thumb').setLabel('Thumbnail').setEmoji('📷').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tncfg_rodape').setLabel('Rodapé').setEmoji('👇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_texto').setLabel('Texto').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_botao').setLabel('Botão').setEmoji('🔘').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_canal').setLabel('Canal').setEmoji('📣').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tncfg_enviar').setLabel('Enviar Painel').setEmoji('🚀').setStyle(ButtonStyle.Success),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tncfg_salvar').setLabel('Salvar Preset').setEmoji('💾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tncfg_carregar').setLabel('Carregar Preset').setEmoji('📂').setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3];
}

export function formatDeleteTime(seconds) {
  if (!seconds) return 'Desativado';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}min`;
  return `${m}min ${s}s`;
}

export function welcomeConfigButtons(cfg = {}) {
  const enabled    = cfg.welcomeEnabled ?? true;
  const sepOn      = cfg.welcomeUseDivider ?? false;
  const bannerPos  = cfg.welcomeBannerPosition ?? 'top';
  const showTitle  = cfg.welcomeShowTitle  ?? true;
  const showAvatar = cfg.welcomeShowAvatar ?? true;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wcfg_cor').setLabel('Cor').setEmoji('🎨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_sem_cor').setLabel('Sem Lateral').setEmoji('◻️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_titulo').setLabel('Título').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_banner').setLabel('Banner').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_banner_pos').setLabel(bannerPos === 'top' ? 'Banner ⬆️ Cima' : 'Banner ⬇️ Baixo').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wcfg_thumb').setLabel('Thumbnail').setEmoji('📷').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_rodape').setLabel('Rodapé').setEmoji('👇').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_texto').setLabel('Texto').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_separador').setLabel('Divisória').setEmoji('➖').setStyle(sepOn ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wcfg_canal').setLabel('Canal').setEmoji('📣').setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wcfg_cargos').setLabel('Cargos').setEmoji('🔔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wcfg_canais').setLabel('Canais').setEmoji('🔗').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wcfg_toggle_titulo').setLabel(showTitle ? 'Sem Título' : 'Com Título').setEmoji(showTitle ? '🔤' : '✖️').setStyle(showTitle ? ButtonStyle.Secondary : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wcfg_toggle_avatar').setLabel(showAvatar ? 'Sem Avatar' : 'Com Avatar').setEmoji(showAvatar ? '👤' : '✖️').setStyle(showAvatar ? ButtonStyle.Secondary : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wcfg_test').setLabel('Testar').setEmoji('🧪').setStyle(ButtonStyle.Success),
  );
  const deleteAfter = cfg.welcomeDeleteAfter ?? null;
  const deleteLabel = deleteAfter ? `⏱️ Sumir: ${formatDeleteTime(deleteAfter)}` : '⏱️ Sumir: Desativado';
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wcfg_sumir').setLabel(deleteLabel).setStyle(deleteAfter ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wcfg_toggle')
      .setLabel(enabled ? 'Desativar Sistema' : 'Ativar Sistema')
      .setEmoji(enabled ? '🔴' : '🟢')
      .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
  );
  return [row1, row2, row3, row4];
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TICKET_TEXT      = '> Clique no botão abaixo para abrir um ticket de suporte.\n> Nossa equipe irá te atender em breve.';
export const DEFAULT_TICKET_OPEN_TEXT = 'Aguarde um instante, em breve um membro da equipe irá lhe atender.';
export const DEFAULT_TELLONYM_TEXT    = '> Clique no botão abaixo para enviar uma mensagem.\n> Você poderá escolher entre **anônimo** ou **marcar alguém**.';
export const DEFAULT_WELCOME_TITLE    = '👋 Bem-vindo(a) ao {server}!';
export const DEFAULT_WELCOME_TEXT     = '> Seja bem-vindo(a), {user}!\n> Esperamos que você tenha uma ótima experiência aqui.\n> Você é o membro nº **{count}**!';

export const DEFAULT_QUESTIONS = [
  'Qual é o assunto do ticket?',
  'Descreva o problema com detalhes',
  'Há alguma informação adicional relevante?',
];

// ─── Payload builders (painel de configuração admin) ─────────────────────────

const BTN_STYLE_LABELS = {
  Primary:   '🔵 Azul (Primary)',
  Secondary: '⚫ Cinza (Secondary)',
  Success:   '🟢 Verde (Success)',
  Danger:    '🔴 Vermelho (Danger)',
};

export function buildTicketConfigPayload(cfg) {
  const texto    = cfg.ticketText    || DEFAULT_TICKET_TEXT;
  const openText = cfg.ticketOpenText || DEFAULT_TICKET_OPEN_TEXT;
  const btnStyleLabel = BTN_STYLE_LABELS[cfg.ticketBtnStyle] ?? '🔵 Azul (Primary)';
  const sepStatus = cfg.ticketUseSeparator ? '✅' : '❌';

  const info = [
    '## 🎫 Tickets',
    `🎨 **Cor:** ${cfg.ticketColor ? `\`#${cfg.ticketColor}\`` : '*(sem lateral)*'}   📝 **Título:** ${cfg.ticketTitle || '*(não definido)*'}   👇 **Rodapé:** ${cfg.ticketFooter || '*(não definido)*'}`,
    `🖼️ **Banner:** ${cfg.ticketBanner ? `✅ — ${(cfg.ticketBannerPosition ?? 'top') === 'top' ? '⬆️ cima' : '⬇️ baixo'}${cfg.ticketOnlyBanner ? ' · Só Banner' : ''}` : '*(não definido)*'}   📷 **Thumb:** ${cfg.ticketThumb ? '✅' : '*(não definido)*'}`,
    `📂 **Categoria:** ${cfg.ticketCategory ? `<#${cfg.ticketCategory}>` : '*(não definido)*'}`,
    `🔔 **Ping Cargos:** ${cfg.ticketPingRole ? cfg.ticketPingRole.split(',').map(id => `<@&${id.trim()}>`).join(' ') : '*(desativado)*'}`,
    `👤 **Ping Usuários:** ${cfg.ticketPingUser ? cfg.ticketPingUser.split(',').map(id => `<@${id.trim()}>`).join(' ') : '*(desativado)*'}`,
    `🔘 **Botão:** \`${cfg.ticketBtnLabel || 'Abrir Ticket'}\` ${cfg.ticketBtnEmoji || '🎫'} — ${btnStyleLabel}   ➖ **Separador:** ${sepStatus}`,
    `✏️ **Texto painel:** ${texto.length > 80 ? texto.slice(0, 77) + '...' : texto}`,
    `💬 **Texto abertura:** ${openText.length > 80 ? openText.slice(0, 77) + '...' : openText}`,
    `🤖 **Atendimento por IA:** ${cfg.ticketAiEnabled ? '✅ Ativo' : '❌ Desativado'} — responde dúvidas, moderação e denúncias até a equipe assumir`,
  ].join('\n');

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

  return { components: [container, ...ticketConfigButtons(cfg)], flags: MessageFlags.IsComponentsV2 };
}

export function buildTellonymConfigPayload(cfg) {
  const texto = cfg.tellonymText ?? DEFAULT_TELLONYM_TEXT;

  const info = [
    '## 💌 Tellonym',
    `🎨 **Cor:** ${cfg.tellonymColor ? `\`#${cfg.tellonymColor}\`` : '*(sem lateral)*'}   📝 **Título:** ${cfg.tellonymTitle || '*(não definido)*'}`,
    `👇 **Rodapé:** ${cfg.tellonymFooter || '*(não definido)*'}`,
    `🖼️ **Banner:** ${cfg.tellonymBanner ? '✅' : '*(não definido)*'}   📷 **Thumb:** ${cfg.tellonymThumb ? '✅' : '*(não definido)*'}`,
    `📣 **Canal:** ${cfg.tellonymChannel ? `<#${cfg.tellonymChannel}>` : '*(não definido)*'}`,
    `✏️ **Texto:** ${texto.length > 100 ? texto.slice(0, 97) + '...' : texto}`,
  ].join('\n');

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

  return { components: [container, ...tellonymConfigButtons()], flags: MessageFlags.IsComponentsV2 };
}

export function buildWelcomeV2(cfg, vars) {
  const titulo = cfg.welcomeTitle ?? DEFAULT_WELCOME_TITLE;
  const texto  = cfg.welcomeText  ?? DEFAULT_WELCOME_TEXT;
  const bannerPos = cfg.welcomeBannerPosition ?? 'top';

  const replaceVars = str => str
    .replace(/\{user\}/g,     vars.user)
    .replace(/\{username\}/g, vars.username)
    .replace(/\{server\}/g,   vars.server)
    .replace(/\{count\}/g,    vars.count);

  const showTitle  = cfg.welcomeShowTitle  ?? true;
  const showAvatar = cfg.welcomeShowAvatar ?? true;

  const SEP = '──────────────────────────────────';
  const titleResolved = replaceVars(titulo);
  const textResolved  = replaceVars(texto).replace(/\{sep\}/g, SEP);
  const hasSepInText  = textResolved.includes(SEP);
  const sepLine = (!hasSepInText && cfg.welcomeUseDivider) ? `${SEP}\n\n` : '';
  const titleLine = showTitle ? `## ${titleResolved}\n\n` : '';
  const fullText = `${titleLine}${sepLine}${textResolved}`;

  const container = new ContainerBuilder();

  if (cfg.welcomeColor) {
    const parsed = parseInt(cfg.welcomeColor, 16);
    if (!isNaN(parsed)) container.setAccentColor(parsed);
  }

  // Banner no topo
  if (cfg.welcomeBanner && bannerPos === 'top') {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.welcomeBanner)),
    );
  }

  const thumbUrl = cfg.welcomeThumb || (showAvatar ? vars.avatarUrl : null) || null;
  if (thumbUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fullText));
  }

  // Banner embaixo
  if (cfg.welcomeBanner && bannerPos === 'bottom') {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(cfg.welcomeBanner)),
    );
  }

  if (cfg.welcomeFooter) {
    const footerText = replaceVars(cfg.welcomeFooter);
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerText}`));
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

export function buildWelcomeConfigPayload(cfg) {
  const titulo  = cfg.welcomeTitle ?? DEFAULT_WELCOME_TITLE;
  const texto   = cfg.welcomeText  ?? DEFAULT_WELCOME_TEXT;
  const enabled = cfg.welcomeEnabled ?? true;
  const sepOn   = cfg.welcomeUseDivider ?? false;

  const rolesStr = cfg.welcomeRoles
    ? cfg.welcomeRoles.split(',').filter(Boolean).map(id => `<@&${id.trim()}>`).join(' ') || '*(nenhum)*'
    : '*(nenhum)*';
  const chansStr = cfg.welcomeChannels
    ? cfg.welcomeChannels.split(',').filter(Boolean).map(id => `<#${id.trim()}>`).join(' ') || '*(nenhum)*'
    : '*(nenhum)*';

  const info = [
    `## 🎉 Boas-Vindas — ${enabled ? '🟢 ATIVO' : '🔴 DESATIVADO'}`,
    `Placeholders: \`{user}\` \`{username}\` \`{server}\` \`{count}\` \`{sep}\``,
    `📣 **Canal:** ${cfg.welcomeChannel ? `<#${cfg.welcomeChannel}>` : '*(não definido)*'}   🎨 **Cor:** ${cfg.welcomeColor ? `\`#${cfg.welcomeColor}\`` : '*(sem lateral)*'}`,
    `📝 **Título:** ${titulo.length > 60 ? titulo.slice(0, 57) + '...' : titulo}`,
    `👇 **Rodapé:** ${cfg.welcomeFooter || '*(não definido)*'}`,
    `🖼️ **Banner:** ${cfg.welcomeBanner ? `✅ — ${(cfg.welcomeBannerPosition ?? 'top') === 'top' ? '⬆️ cima' : '⬇️ baixo'}` : '*(não definido)*'}   📷 **Thumb:** ${cfg.welcomeThumb ? '✅' : '*(avatar)*'}`,
    `➖ **Divisória:** ${sepOn ? '✅' : '❌'}   🔤 **Título:** ${(cfg.welcomeShowTitle ?? true) ? '✅' : '❌'}   👤 **Avatar:** ${(cfg.welcomeShowAvatar ?? true) ? '✅' : '❌'}`,
    `⏱️ **Sumir:** ${cfg.welcomeDeleteAfter ? `após ${formatDeleteTime(cfg.welcomeDeleteAfter)}` : '*(desativado)*'}`,
    `🔔 **Cargos:** ${rolesStr}   🔗 **Canais:** ${chansStr}`,
    `✏️ **Texto:** ${texto.length > 100 ? texto.slice(0, 97) + '...' : texto}`,
  ].join('\n');

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

  return { components: [container, ...welcomeConfigButtons(cfg)], flags: MessageFlags.IsComponentsV2 };
}

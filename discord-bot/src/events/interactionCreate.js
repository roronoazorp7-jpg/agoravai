import {
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';
import prisma from '../database/client.js';
import { generateTranscript } from '../utils/transcript.js';
import { baseEmbed, buildConfigEmbed, errorEmbed, successEmbed, v2Simple, Colors } from '../utils/embed.js';
import { ACTIONS, REJECTION_GIFS, buildInteractionEmbed, fetchGif } from '../commands/interacoes/interacoes.js';
import { generateTellonymCard } from '../utils/cardGenerator.js';
import { buildWeddingCardPayload, getMarriageStats } from '../utils/weddingCard.js';
import { likesMap, postDataMap } from '../utils/instaState.js';
import { buildTicketConfigPayload, buildTellonymConfigPayload, buildWelcomeConfigPayload, buildWelcomeV2, buildTicketPanelV2, buildTellonymPanelV2, buildTellonymComposerPanelV2, buildTellonymIdentityPanelV2, DEFAULT_TICKET_TEXT, DEFAULT_TICKET_OPEN_TEXT, DEFAULT_TELLONYM_TEXT, formatDeleteTime } from '../utils/configPanels.js';
import { buildMenuOptsPanel, buildOptionDetailPanel, buildAddOptionModal, buildEditOptionModal, parseIdList } from '../utils/ticketMenuHandlers.js';
import { buildPartnerConfigPayload } from '../utils/partnershipPanels.js';
import {
  getSession,
  deleteSession,
  buildContainerPayload,
  buildMainControls,
  buildTypeSelector,
  buildColorPicker,
  buildEditMenu,
  COLOR_MAP,
} from '../utils/containerSessions.js';
import { handleShopInteraction } from '../utils/shopHandlers.js';
import { handlePetButton } from '../commands/general/pet.js';
import { handleModerationButton } from '../commands/admin/moderacao.js';
import { handleVipButton, handleVipConfigModal } from '../commands/loja/vip.js';
import { handleFishingInteraction } from '../commands/economia/pescaria.js';
import { handleWorkInteraction } from '../commands/economia/eco.js';
import { handleBankInteraction } from '../utils/bankHandlers.js';
import { handleCardPackInteraction, handleFutPackInteraction, handleCardCollectionInteraction } from '../commands/general/cartas.js';
import { handleBattleInteraction } from '../commands/jogos/batalha.js';
import { isCommandBlocked, COMMAND_BLOCK_COMMAND } from '../utils/commandBlock.js';
import { handleBJHit, handleBJStand, handleMinesCell, handleMinesCashout } from '../utils/gameHandlers.js';
import { handleAjudaCatSel } from '../commands/general/ajuda.js';
import { radioSessions, createRadioSession } from '../utils/radioManager.js';
import { buildControlPanel as buildRadioPanel } from '../commands/general/radio.js';
import { musicSessions } from '../utils/musicManager.js';
import { buildMusicPanel } from '../commands/general/musica.js';
import {
  getMsgSession,
  deleteMsgSession,
  buildMsgPayload,
  buildMsgMainControls,
  buildMsgButtonTypeSelector,
  buildCargoRoleSelector,
  buildMsgColorPicker,
  buildRoleSelector,
  MSG_COLOR_MAP,
  msgTotalCount,
  publishedMenus,
  publishedInfoBtns,
} from '../utils/messageSessions.js';
import {
  getRPSession,
  deleteRPSession,
  buildRPPayload,
  buildRPControls,
  buildRPRoleSelector,
  buildRPColorPicker,
  RP_COLOR_MAP,
} from '../utils/rolePanelSessions.js';
import { handleDropClaim, handleDropItemSelect } from '../utils/dropHandlers.js';
import { handleDeathEventInteraction } from '../utils/deathEvent.js';
import { awardInteractionXp } from '../utils/reputation.js';
import {
  handlePainelFuncoes,
  handlePainelVoltar,
  handlePainelModuloSel,
  handlePainelCfgBtn,
  handleAntiLinkCfgBtn,
  handleAntiLinkCfgModal,
  handleInstaCfgBtn,
  handleInstaCfgModal,
  handlePainelModuleBtn,
  handlePainelModuleModal,
  handleBoostCfgRoleSelect,
  handleBoostCfgBtn,
  handleBumpCfgBtn,
  handleBumpCfgChannelSelect,
} from '../utils/painelHandlers.js';

const tellonymSessions = new Map();
const tellonymSessionKey = (interaction) => `${interaction.guildId}:${interaction.user.id}`;

// ─── Emoji resolver ───────────────────────────────────────────────────────────

function resolveEmojis(text, client) {
  if (!text || !client) return text;
  // Passo 1: protege padrões <:name:id> e <a:name:id> já formatados
  const slots = [];
  const safe = text.replace(/<(a?):([a-zA-Z0-9_]+):(\d+)>/g, (match) => {
    slots.push(match);
    return `\x00EMOJI${slots.length - 1}\x00`;
  });
  // Passo 2: converte :shortcode: para o emoji personalizado (busca em todos os servidores)
  const resolved = safe.replace(/:([a-zA-Z0-9_]+):/g, (match, name) => {
    const emoji = client.emojis.cache.find(e => e.name === name);
    if (!emoji) return match;
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  });
  // Passo 3: restaura os padrões protegidos
  return resolved.replace(/\x00EMOJI(\d+)\x00/g, (_, i) => slots[+i]);
}

// ─── Msg preview updater (V1/V2-aware) ──────────────────────────────────────

async function refreshMsgPreview(session, guild) {
  try {
    const ch = guild.channels.cache.get(session.previewChannelId);
    if (!ch) return;
    const m = await ch.messages.fetch(session.previewMessageId).catch(() => null);
    if (!m) return;
    const payload = buildMsgPayload(session);
    const needsV2 = !!payload.flags;
    const currentlyEmbed = (m.embeds?.length ?? 0) > 0;
    if ((needsV2 && currentlyEmbed) || (!needsV2 && !currentlyEmbed)) {
      await m.delete().catch(() => {});
      const newMsg = await ch.send(payload).catch(() => null);
      if (newMsg) session.previewMessageId = newMsg.id;
    } else {
      await m.edit(payload).catch(e => console.error('[MSG PREVIEW]', e?.message ?? e));
    }
  } catch (e) {
    console.error('[MSG PREVIEW]', e?.message ?? e);
  }
}

// ─── Container preview updater ────────────────────────────────────────────────

async function updateContainerPreview(session, client) {
  try {
    const ch = client.channels.cache.get(session.previewChannelId);
    if (!ch) return;
    const msg = await ch.messages.fetch(session.previewMessageId).catch(() => null);
    if (msg) await msg.edit(buildContainerPayload(session));
  } catch (e) {
    console.error('[CONTAINER PREVIEW]', e?.message ?? e);
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function getCfg(guildId) {
  return prisma.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

// Mensagens enviadas com IS_COMPONENTS_V2 não podem ser atualizadas com
// `content` ou `embeds`. Os seletores de configuração também precisam usar
// Components V2 para que o Discord aceite a atualização da interação.
// Nota: usar ContainerBuilder + ActionRowBuilder juntos no topo causava erro
// ao exibir ChannelSelectMenu via interaction.update(). Usar TextDisplayBuilder
// diretamente no topo é mais compatível com a API do Discord.
function buildV2SelectionPayload(prompt, select, cancelBtn) {
  return {
    components: [
      new TextDisplayBuilder().setContent(prompt),
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(cancelBtn),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

// ─── Resolve links discord.com/channels → URL de imagem real ─────────────────

async function resolveImageUrl(rawUrl, client) {
  if (!rawUrl) return rawUrl;
  const match = rawUrl.match(/https?:\/\/(?:www\.)?discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
  if (!match) return rawUrl;
  const [, , channelId, messageId] = match;
  try {
    const ch  = await client.channels.fetch(channelId);
    if (!ch) return null;
    const msg = await ch.messages.fetch(messageId);
    const img = [...msg.attachments.values()].find(a => a.contentType?.startsWith('image/'));
    if (img) return img.url;
    if (msg.embeds[0]?.image?.url) return msg.embeds[0].image.url;
    return null;
  } catch (e) {
    console.error('[LINK RESOLVER]', e.message);
    return null;
  }
}

// ─── Helper: monta botão "Abrir Ticket" com label/emoji/style configuráveis ───

const BTN_STYLE_MAP = {
  Primary:   ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success:   ButtonStyle.Success,
  Danger:    ButtonStyle.Danger,
};

function buildTicketOpenButton(cfg) {
  const label    = cfg?.ticketBtnLabel || 'Abrir Ticket';
  const emojiRaw = (cfg?.ticketBtnEmoji || '🎫').trim();
  const style    = BTN_STYLE_MAP[cfg?.ticketBtnStyle] ?? ButtonStyle.Primary;
  const btn = new ButtonBuilder().setCustomId('ticket_open').setLabel(label).setStyle(style);
  const match = emojiRaw.match(/^<(a?):([^:>\s]+):(\d+)>$/);
  if (match) btn.setEmoji({ animated: match[1] === 'a', name: match[2], id: match[3] });
  else if (emojiRaw) btn.setEmoji(emojiRaw);
  return btn;
}

function idList(...values) {
  return [...new Set(
    values
      .flatMap(value => String(value ?? '').split(','))
      .map(value => value.trim())
      .filter(Boolean),
  )];
}

async function handleWeddingCardAction(interaction, action, leftId, rightId) {
  const isPairMember = interaction.user.id === leftId || interaction.user.id === rightId;
  if (!isPairMember) {
    return interaction.reply({
      content: '❌ Apenas uma das pessoas do casal pode usar esta ação.',
      ephemeral: true,
    });
  }

  if (action === 'refresh') {
    await interaction.deferUpdate();
  } else if (action === 'manage') {
    await interaction.deferReply({ ephemeral: true });
  } else {
    return interaction.reply({
      content: '❌ Ação de casamento inválida.',
      ephemeral: true,
    });
  }

  if (action === 'manage') {
    const partnerId = interaction.user.id === leftId ? rightId : leftId;
    const partner = await interaction.client.users.fetch(partnerId).catch(() => null);
    const partnerName = partner?.globalName ?? partner?.username ?? 'seu/sua parceiro(a)';
    const divorceRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`divorciar_confirm_${interaction.user.id}_${partnerId}`)
        .setLabel('Confirmar divórcio')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`divorciar_cancel_${interaction.user.id}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    );
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('💔 Gerenciar casamento')
          .setDescription(
            `Você realmente quer se divorciar de **${partnerName}**?\n\n` +
            'Essa ação remove o vínculo dos dois perfis e não pode ser desfeita automaticamente.',
          ),
      ],
      components: [divorceRow],
    });
  }

  const [leftUser, rightUser, leftMember, rightMember, leftProfile] = await Promise.all([
    interaction.client.users.fetch(leftId),
    interaction.client.users.fetch(rightId),
    interaction.guild.members.fetch(leftId).catch(() => null),
    interaction.guild.members.fetch(rightId).catch(() => null),
    prisma.userProfile.findUnique({ where: { userId: leftId } }),
  ]);
  const stats = await getMarriageStats(leftId, rightId, leftProfile?.marriedAt);
  return interaction.editReply(await buildWeddingCardPayload({
    left: {
      id: leftId,
      displayName: leftMember?.displayName ?? leftUser.globalName ?? leftUser.username,
      username: leftUser.username,
      avatarUrl: leftUser.displayAvatarURL({
        extension: 'png',
        forceStatic: true,
        size: 256,
      }),
    },
    right: {
      id: rightId,
      displayName: rightMember?.displayName ?? rightUser.globalName ?? rightUser.username,
      username: rightUser.username,
      avatarUrl: rightUser.displayAvatarURL({
        extension: 'png',
        forceStatic: true,
        size: 256,
      }),
    },
    stats,
  }));
}

function isPartnershipTicket(label = '') {
  return /\b(parceria|parcerias|partner|partnership)\b/i.test(label);
}

function buildTicketActionMenu(channelId, claimedBy = null) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`ticket_actions_${channelId}`)
    .setPlaceholder('🛠️ Ações do ticket')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(claimedBy ? 'Ticket já assumido' : 'Assumir ticket')
        .setDescription(claimedBy ? 'Este ticket já tem um atendente.' : 'Assuma o atendimento deste ticket.')
        .setValue('assume')
        .setEmoji('✅')
        .setDefault(false),
      new StringSelectMenuOptionBuilder()
        .setLabel('Notificar atendentes')
        .setDescription('Chama novamente a equipe responsável pelo ticket.')
        .setValue('notify')
        .setEmoji('🔔'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Fechar ticket')
        .setDescription('Fecha e remove este canal em 5 segundos.')
        .setValue('close')
        .setEmoji('🔒'),
    );

  return new ActionRowBuilder().addComponents(select);
}

function ticketActionContainer({ channelId, title, avatar, claimedBy, text }) {
  return new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(title))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `**Assumido por:** ${claimedBy ? `<@${claimedBy}>` : 'Ninguém'}`,
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
    .addActionRowComponents(buildTicketActionMenu(channelId, claimedBy));
}

async function getTicketOwnerDetails(ticket, guild, client) {
  const member = await guild.members.fetch(ticket.userId).catch(() => null);
  const user = member?.user ?? await client.users.fetch(ticket.userId).catch(() => null);
  return {
    name: member?.displayName ?? user?.username ?? 'Usuário',
    avatar: member?.displayAvatarURL({ size: 128, extension: 'png' })
      ?? user?.displayAvatarURL({ size: 128, extension: 'png' })
      ?? client.user.displayAvatarURL({ size: 128, extension: 'png' }),
  };
}

async function getTicketNotificationTargets(ticket, guild) {
  const [config, option] = await Promise.all([
    prisma.guildConfig.findUnique({ where: { guildId: ticket.guildId } }),
    ticket.reason
      ? prisma.ticketOption.findFirst({ where: { guildId: ticket.guildId, label: ticket.reason } })
      : null,
  ]);

  const partnershipTicket = isPartnershipTicket(ticket.reason ?? '');
  return {
    roleIds: idList(
      option?.pingRole,
      config?.ticketPingRole,
      partnershipTicket ? config?.partnerResponsibleRole : null,
    ),
    userIds: idList(option?.pingUser, config?.ticketPingUser),
  };
}

async function refreshTicketActionMessage(interaction, ticket, client, text) {
  const owner = await getTicketOwnerDetails(ticket, interaction.guild, client);
  const container = ticketActionContainer({
    channelId: ticket.channelId,
    title: `# ${ticket.reason || 'Ticket'} - ${owner.name}`,
    avatar: owner.avatar,
    claimedBy: ticket.claimedBy,
    text,
  });
  await interaction.message.edit({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ─── Mapeamento dos campos de modal ───────────────────────────────────────────

const TICKET_MODAL_FIELDS = {
  cor:    { label: 'Cor (hex, ex: 5865F2)',      db: 'ticketColor',  placeholder: '5865F2 (deixe vazio para padrão)',           isUrl: false, isLong: false },
  titulo: { label: 'Título do painel',           db: 'ticketTitle',  placeholder: 'Abertura de Ticket (deixe vazio para remover)', isUrl: false, isLong: false },
  banner: { label: 'URL da imagem do banner',    db: 'ticketBanner', placeholder: 'https://... ou discord.com/channels/... (deixe vazio para remover)', isUrl: true, isLong: false },
  thumb:  { label: 'URL da thumbnail',           db: 'ticketThumb',  placeholder: 'https://... ou discord.com/channels/... (deixe vazio para remover)', isUrl: true, isLong: false },
  rodape: { label: 'Texto do rodapé',            db: 'ticketFooter', placeholder: 'Sistema de Suporte (deixe vazio para remover)', isUrl: false, isLong: false },
  texto:  { label: 'Texto principal do painel',  db: 'ticketText',   placeholder: 'Clique no botão para abrir um ticket... (deixe vazio para padrão)', isUrl: false, isLong: true },
};

const TELLONYM_MODAL_FIELDS = {
  cor:    { label: 'Cor (hex, ex: 2B2D31)',      db: 'tellonymColor',  placeholder: '2B2D31 (deixe vazio para padrão)',              isUrl: false, isLong: false },
  titulo: { label: 'Título do painel',           db: 'tellonymTitle',  placeholder: '💌 Tellonym (deixe vazio para remover)',         isUrl: false, isLong: false },
  banner: { label: 'URL da imagem do banner',    db: 'tellonymBanner', placeholder: 'https://... ou discord.com/channels/... (deixe vazio para remover)', isUrl: true, isLong: false },
  thumb:  { label: 'URL da thumbnail',           db: 'tellonymThumb',  placeholder: 'https://... ou discord.com/channels/... (deixe vazio para remover)', isUrl: true, isLong: false },
  rodape: { label: 'Texto do rodapé',            db: 'tellonymFooter', placeholder: 'Savage Bot · Tellonym (deixe vazio para remover)',  isUrl: false, isLong: false },
  texto:  { label: 'Texto principal do painel',  db: 'tellonymText',   placeholder: 'Clique no botão para enviar uma mensagem... (deixe vazio para remover o texto)', isUrl: false, isLong: true },
};

const WELCOME_MODAL_FIELDS = {
  cor:    { label: 'Cor (hex, ex: 5865F2)',           db: 'welcomeColor',  placeholder: '5865F2 (deixe vazio para sem lateral)',          isUrl: false, isLong: false },
  titulo: { label: 'Título (use {server}, {count})', db: 'welcomeTitle',  placeholder: '👋 Bem-vindo(a) ao {server}!',                   isUrl: false, isLong: false },
  banner: { label: 'URL do banner',                  db: 'welcomeBanner', placeholder: 'https://... (deixe vazio para remover)',           isUrl: true,  isLong: false },
  thumb:  { label: 'URL da thumbnail',               db: 'welcomeThumb',  placeholder: 'https://... (deixe vazio para avatar do usuário)', isUrl: true,  isLong: false },
  rodape: { label: 'Rodapé (use {server}, {count})', db: 'welcomeFooter', placeholder: '{server} • Membro nº {count}',                   isUrl: false, isLong: false },
  texto:  { label: 'Texto livre — use {user} {count} e menções', db: 'welcomeText', placeholder: 'Ex: Bem-vindo {user}! Veja <#CANAL_ID> e pegue <@&CARGO_ID>', isUrl: false, isLong: true },
};

const PARTNER_MODAL_FIELDS = {
  cor:      { label: 'Cor (hex, ex: A020F0)',    db: 'partnerColor',     isUrl: false, isLong: false, placeholder: 'A020F0 (deixe vazio para padrão)' },
  imagem:   { label: 'URL da imagem/banner',      db: 'partnerImage',     isUrl: true,  isLong: false, placeholder: 'https://... (deixe vazio para padrão)' },
  thumb:    { label: 'URL da thumbnail',          db: 'partnerThumbnail', isUrl: true,  isLong: false, placeholder: 'https://... (deixe vazio para padrão)' },
  footer:   { label: 'Rodapé do embed',           db: 'partnerFooter',    isUrl: false, isLong: false, placeholder: 'Savage Bot · Parcerias' },
  mensagem: { label: 'Mensagem de agradecimento', db: 'partnerMessage',   isUrl: false, isLong: true,  placeholder: '★ Obrigado por fortalecer nossa comunidade!' },
};

// ─── Handler principal ────────────────────────────────────────────────────────

export default {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client) {
    try {
      if (
        interaction.isChatInputCommand()
        || interaction.isButton()
        || interaction.isStringSelectMenu()
        || interaction.isRoleSelectMenu()
        || interaction.isChannelSelectMenu()
        || interaction.isUserSelectMenu()
        || interaction.isModalSubmit()
      ) {
        awardInteractionXp(interaction);
      }
      if (interaction.isButton() && await handleDeathEventInteraction(interaction, client)) return;

      // ── SLASH COMMANDS ─────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        if (interaction.commandName !== COMMAND_BLOCK_COMMAND) {
          const blocked = await isCommandBlocked(interaction, interaction.commandName);
          if (blocked) return interaction.reply({ content: blocked.message, ephemeral: true });
        }
        return await cmd.execute(interaction, client);
      }

      // ── ROLE SELECT MENUS ──────────────────────────────────────────────────
      if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === 'boost_roles_select') {
          return handleBoostCfgRoleSelect(interaction);
        }

        // ── MONTAR-MENSAGEM: Cargo no embed ──────────────────────────────
        if (interaction.customId === 'msg_role_sel') {
          const session = getMsgSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.update({ content: '❌ Sessão expirada. Use `/montar-mensagem` novamente.', components: [] });

          const roleIds = interaction.values;
          session.blocks.push({ type: 'roles', roleIds });

          const ch = interaction.guild.channels.cache.get(session.previewChannelId);
          if (ch) {
            const msg = await ch.messages.fetch(session.previewMessageId).catch(() => null);
            if (msg) await msg.edit(buildMsgPayload(session)).catch(() => {});
          }

          return interaction.update({
            content: `**💬 Montador de Mensagem**\n✅ ${roleIds.length} cargo(s) adicionado(s)! Total: **${msgTotalCount(session)}** item(s).`,
            components: buildMsgMainControls(session),
          });
        }

        // ── MONTAR-MENSAGEM: Criar menu dropdown com cargos ──────────────
        if (interaction.customId === 'msg_cargo_sel') {
          const session = getMsgSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.update({ content: '❌ Sessão expirada. Use `/montar-mensagem` novamente.', components: [] });

          const roles = [...interaction.roles.values()];
          session.selectMenu = {
            placeholder: 'Seleciona os cargos',
            options: roles.map(role => ({ label: role.name, roleId: role.id })),
          };

          const ch = interaction.guild.channels.cache.get(session.previewChannelId);
          if (ch) {
            const msg = await ch.messages.fetch(session.previewMessageId).catch(() => null);
            if (msg) await msg.edit(buildMsgPayload(session)).catch(() => {});
          }

          const mentions = roles.map(r => `<@&${r.id}>`).join(', ');
          return interaction.update({
            content: `**💬 Montador de Mensagem**\n✅ Menu criado com ${roles.length} cargo(s): ${mentions}\nTotal: **${msgTotalCount(session)}** item(s).`,
            components: buildMsgMainControls(session),
          });
        }

        // ── PAINEL DE CARGOS: Adicionar cargo ao painel ───────────────────
        if (interaction.customId === 'rp_role_sel') {
          const session = getRPSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.update({ content: '❌ Sessão expirada. Use `/painel-cargos` novamente.', components: [] });

          const added = [];
          for (const [, role] of interaction.roles) {
            if (session.roles.length >= 25) break;
            const already = session.roles.find(r => r.roleId === role.id);
            if (!already) {
              session.roles.push({ roleId: role.id, label: role.name, emoji: '' });
              added.push(role.name);
            }
          }

          const rpCh = interaction.guild.channels.cache.get(session.previewChannelId);
          if (rpCh) {
            const rpMsg = await rpCh.messages.fetch(session.previewMessageId).catch(() => null);
            if (rpMsg) await rpMsg.edit(buildRPPayload(session)).catch(() => {});
          }

          return interaction.update({
            content: [
              '**👤 Painel de Cargos — Editor**',
              added.length > 0
                ? `✅ Cargo(s) adicionado(s): **${added.join(', ')}**`
                : '⚠️ Cargo(s) já adicionado(s) ou limite atingido.',
              '',
              `📋 Cargos: **${session.roles.length}** | Divisória: **${session.useSeparator ? 'Sim' : 'Não'}**`,
            ].join('\n'),
            components: buildRPControls(session),
          });
        }

        return;
      }

      // ── STRING SELECT MENUS ────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('work_select:')) {
          return handleWorkInteraction(interaction);
        }
        if (
          interaction.customId.startsWith('battle_team_select:')
          || interaction.customId.startsWith('battle_move:')
          || interaction.customId.startsWith('battle_switch:')
        ) {
          return handleBattleInteraction(interaction);
        }
        if (interaction.customId.startsWith('pokemon_dex_card:')) {
          return handleCardCollectionInteraction(interaction);
        }
        if (interaction.customId.startsWith('pokemon_sell_card:')) {
          return handleCardCollectionInteraction(interaction);
        }

        if (
          interaction.customId === 'fish_rod_select' ||
          interaction.customId === 'fish_sell_select' ||
          interaction.customId === 'fish_spot_select' ||
          interaction.customId === 'fish_bait_buy_select' ||
          interaction.customId === 'fish_bait_equip_select'
        ) {
          return handleFishingInteraction(interaction);
        }

        if (interaction.customId.startsWith('casar_action_')) {
          const [, , leftId, rightId] = interaction.customId.split('_');
          return handleWeddingCardAction(interaction, interaction.values[0], leftId, rightId);
        }

        // ── MONTAR-MENSAGEM: Menu publicado ──────────────────────────────
        if (interaction.customId === 'msg_ms') {
          const value = interaction.values[0];

          if (value.startsWith('r:')) {
            const roleId = value.slice(2);
            const member = interaction.member;
            try {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                return interaction.reply({ content: `✅ Cargo <@&${roleId}> removido.`, ephemeral: true });
              } else {
                await member.roles.add(roleId);
                return interaction.reply({ content: `✅ Cargo <@&${roleId}> concedido!`, ephemeral: true });
              }
            } catch {
              return interaction.reply({ content: '❌ Sem permissão para gerenciar esse cargo.', ephemeral: true });
            }
          }

          if (value.startsWith('t:')) {
            const idx    = parseInt(value.slice(2), 10);
            const msgId  = interaction.message.id;
            let config = publishedMenus.get(msgId);
            if (!config) {
              const row = await prisma.publishedMsgData.findUnique({ where: { messageId: msgId } }).catch(() => null);
              if (row) {
                try { const parsed = JSON.parse(row.data); config = parsed.selectMenu ?? null; } catch {}
                if (config) publishedMenus.set(msgId, config);
              }
            }
            const opt    = config?.options?.[idx];
            const reply  = opt?.replyText || `✅ **${opt?.label ?? 'Opção'}** selecionada!`;
            return interaction.reply({ content: reply, ephemeral: true });
          }

          return interaction.reply({ content: '✅ Opção selecionada!', ephemeral: true });
        }
      }

      // ── CHANNEL SELECT MENUS ───────────────────────────────────────────────
      if (interaction.isChannelSelectMenu()) {
        const channelId = interaction.values[0];

        if (interaction.customId === 'bump_channel_select') {
          return handleBumpCfgChannelSelect(interaction);
        }

        if (interaction.customId === 'chansel_wc') {
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, welcomeChannel: channelId },
            update: { welcomeChannel: channelId },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildWelcomeConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        if (interaction.customId === 'chansel_tc') {
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, ticketCategory: channelId },
            update: { ticketCategory: channelId },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        if (interaction.customId === 'chansel_tn') {
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, tellonymChannel: channelId },
            update: { tellonymChannel: channelId },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTellonymConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        if (interaction.customId === 'chansel_pc') {
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, partnerChannel: channelId },
            update: { partnerChannel: channelId },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildPartnerConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        return;
      }

      // ── TELLONYM: destinatários do formulário ─────────────────────────────
      if (interaction.isUserSelectMenu() && interaction.customId === 'tellonym_target') {
        const key = tellonymSessionKey(interaction);
        const session = tellonymSessions.get(key) ?? { targetIds: [], message: null };
        session.targetIds = interaction.values;
        tellonymSessions.set(key, session);
        return interaction.update({
          ...buildTellonymComposerPanelV2(session),
          content: null,
        });
      }

      // ── STRING SELECT MENUS ────────────────────────────────────────────────
      if (interaction.isStringSelectMenu()) {
        // ── DROP: Admin escolheu item na gavetinha ──────────────────────────
        if (interaction.customId === 'drop_item_sel') {
          return handleDropItemSelect(interaction);
        }

        // ── TICKET: Painel público — menu de categorias ──────────────────────
        if (interaction.customId === 'ticket_menu_sel') {
          await interaction.deferReply({ ephemeral: true });
          const optId  = interaction.values[0];
          const option = await prisma.ticketOption.findUnique({ where: { id: optId } });
          if (!option) return interaction.editReply({ embeds: [errorEmbed('Opção não encontrada. Contate um administrador.')] });

          const guild  = interaction.guild;
          const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

          const existing = await prisma.ticket.findFirst({ where: { userId: interaction.user.id, guildId: guild.id, status: 'open' } });
          if (existing) {
            const existingChannel = guild.channels.cache.get(existing.channelId)
              ?? await guild.channels.fetch(existing.channelId).catch(() => null);
            if (!existingChannel) {
              await prisma.ticket.updateMany({ where: { userId: interaction.user.id, guildId: guild.id, status: 'open' }, data: { status: 'closed' } });
            } else {
              return interaction.editReply({ embeds: [errorEmbed(`Você já tem um ticket aberto: <#${existing.channelId}>`)] });
            }
          }

          const ticketCount  = await prisma.ticket.count({ where: { guildId: guild.id } });
          const ticketNumber = ticketCount + 1;

          const partnershipTicket = isPartnershipTicket(option.label);
          const pingRole = idList(
            option.pingRole,
            config?.ticketPingRole,
            partnershipTicket ? config?.partnerResponsibleRole : null,
          ).join(',');
          const pingUser = option.pingUser || config?.ticketPingUser || null;

          const permissionOverwrites = [
            { id: guild.roles.everyone, deny:  [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
          ];
          if (pingRole) {
            for (const rId of idList(pingRole)) {
              permissionOverwrites.push({ id: rId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
            }
          }

          let category = null;
          if (config?.ticketCategory) {
            const cat = guild.channels.cache.get(config.ticketCategory);
            if (cat && cat.type === ChannelType.GuildCategory) category = config.ticketCategory;
          }

          const channel = await guild.channels.create({
            name:  `${option.emoji || '📌'}・${option.label}・N°${ticketNumber}`,
            type:  ChannelType.GuildText,
            topic: `${option.label} — ${interaction.member?.displayName ?? interaction.user.username}`,
            parent: category,
            permissionOverwrites,
          });

          await prisma.ticket.create({
            data: {
              channelId: channel.id,
              userId: interaction.user.id,
              guildId: guild.id,
              reason: option.label,
            },
          });

          const memberAvatar = interaction.member?.displayAvatarURL({ size: 128, extension: 'png' }) ?? interaction.user.displayAvatarURL({ size: 128, extension: 'png' });
          const memberName   = interaction.member?.displayName ?? interaction.user.username;

          const pingRoleMentions = pingRole ? pingRole.split(',').map(s => `<@&${s.trim()}>`).filter(Boolean).join(' ') : '';
          const pingUserMentions = pingUser ? pingUser.split(',').map(s => `<@${s.trim()}>`).filter(Boolean).join(' ') : '';
          const extraPings = [pingRoleMentions, pingUserMentions].filter(Boolean).join(' ');
          const pingLine = extraPings ? `<@${interaction.user.id}> ${extraPings}` : `<@${interaction.user.id}>`;

          const pingDisplay    = new TextDisplayBuilder().setContent(pingLine);
          const openText       = config?.ticketOpenText || 'Aguarde um instante, em breve um promotor irá lhe atender.';
           const ticketContainer = ticketActionContainer({
             channelId: channel.id,
             title: `# ${option.label} - ${memberName}`,
             avatar: memberAvatar,
             claimedBy: null,
             text: openText,
           });

          try {
            await channel.send({ components: [pingDisplay, ticketContainer], flags: MessageFlags.IsComponentsV2 });
             if (partnershipTicket) {
               await channel.send({
                 content: `${pingRoleMentions || '<@&' + guild.roles.everyone.id + '>'}\n🤝 **Atendimento de parceria solicitado.** Um atendente responsável foi chamado para analisar este ticket.`,
                 allowedMentions: {
                   roles: idList(pingRole),
                 },
               });
             }
             if (config?.ticketAiEnabled) {
              await channel.send(
                '🤖 **Atendimento automático ativado.**\n' +
                'Olá! Sou o suporte oficial do servidor e posso ajudar com dúvidas gerais, regras, moderação e denúncias. ' +
                'Descreva o que aconteceu de forma objetiva; se for necessário, um moderador da equipe assumirá o atendimento.',
              );
            }
          } catch (err) {
            console.error('[TICKET MENU SEND ERROR]', err?.message ?? err);
            await channel.delete().catch(() => {});
            await prisma.ticket.deleteMany({ where: { channelId: channel.id } }).catch(() => {});
            return interaction.editReply({ embeds: [errorEmbed('Não foi possível criar o ticket. Tente novamente.')] });
          }
          return interaction.editReply({ embeds: [successEmbed('Ticket Criado', `Seu ticket foi aberto em ${channel}.`)] });
        }

        // ── TICKET: Ações do atendimento (menu V2) ─────────────────────────
        if (interaction.customId.startsWith('ticket_actions_')) {
          await interaction.deferReply({ ephemeral: true });

          const channelId = interaction.customId.slice('ticket_actions_'.length);
          const action = interaction.values[0];
          const ticket = await prisma.ticket.findUnique({ where: { channelId } });

          if (!ticket || ticket.status !== 'open') {
            return interaction.editReply({ content: '❌ Este ticket já foi fechado ou não foi encontrado.' });
          }

          if (action === 'assume') {
            if (ticket.claimedBy) {
              return interaction.editReply({
                content: `❌ Ticket já assumido por <@${ticket.claimedBy}>.`,
              });
            }

            const claimed = await prisma.ticket.updateMany({
              where: { channelId, status: 'open', claimedBy: null },
              data: { claimedBy: interaction.user.id },
            });

            if (claimed.count === 0) {
              const current = await prisma.ticket.findUnique({ where: { channelId } });
              return interaction.editReply({
                content: current?.claimedBy
                  ? `❌ Ticket já assumido por <@${current.claimedBy}>.`
                  : '❌ Não foi possível assumir este ticket. Tente novamente.',
              });
            }

            const updatedTicket = { ...ticket, claimedBy: interaction.user.id };
            await refreshTicketActionMessage(
              interaction,
              updatedTicket,
              client,
              `✅ Atendimento assumido por <@${interaction.user.id}>. Em breve a equipe continuará o suporte.`,
            );
            return interaction.editReply({ content: '✅ Você assumiu este ticket.' });
          }

          if (action === 'notify') {
            const { roleIds, userIds } = await getTicketNotificationTargets(ticket, interaction.guild);
            const mentions = [
              ...roleIds.map(id => `<@&${id}>`),
              ...userIds.map(id => `<@${id}>`),
            ];

            if (mentions.length === 0) {
              return interaction.editReply({
                content: '⚠️ Nenhum cargo ou atendente está configurado para receber a notificação deste ticket.',
              });
            }

            await interaction.channel.send({
              content: `🔔 ${mentions.join(' ')}\n<@${ticket.userId}> solicitou a atenção da equipe neste ticket.`,
              allowedMentions: { roles: roleIds, users: [...userIds, ticket.userId] },
            });
            return interaction.editReply({ content: '✅ Atendentes notificados.' });
          }

          if (action === 'close') {
            await prisma.ticket.update({
              where: { channelId },
              data: { status: 'closed' },
            });
            await interaction.editReply({ content: '🔒 Ticket fechado. O canal será removido em 5 segundos.' });
            setTimeout(() => interaction.channel?.delete().catch(() => {}), 5000);
            return;
          }

          return interaction.editReply({ content: '❌ Ação de ticket inválida.' });
        }

        // ── TICKET ADMIN: Selecionar opção para gerenciar ───────────────────
        if (interaction.customId === 'tcfg_menu_opt_sel') {
          const optId  = interaction.values[0];
          const option = await prisma.ticketOption.findUnique({ where: { id: optId } });
          if (!option) return interaction.update({ content: '❌ Opção não encontrada.', embeds: [], components: [] });
          await interaction.deferUpdate();
          return interaction.editReply(await buildOptionDetailPanel(option));
        }

        // ── RÁDIO: Selecionar playlist ──────────────────────────────────────
        if (interaction.customId.startsWith('radio_playlist_sel')) {
          // Acknowledge immediately to avoid 3-second timeout
          await interaction.deferUpdate();

          const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
          if (!isAdmin) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Apenas administradores podem iniciar o rádio.')],
              components: [],
            });
          }

          const channelId    = interaction.customId.split(':')[1];
          const voiceChannel = interaction.guild.channels.cache.get(channelId)
            ?? await interaction.guild.channels.fetch(channelId).catch(() => null);
          if (!voiceChannel) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Canal de voz não encontrado.')],
              components: [],
            });
          }

          // ── Verificação de permissão ANTES de tentar conectar ──────────────
          const botMember = interaction.guild.members.me
            ?? await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
          const perms = voiceChannel.permissionsFor(botMember);
          const hasConnect = perms?.has(PermissionFlagsBits.Connect);
          const hasSpeak   = perms?.has(PermissionFlagsBits.Speak);

          if (!hasConnect || !hasSpeak) {
            const missing = [!hasConnect && '**Conectar**', !hasSpeak && '**Falar**'].filter(Boolean).join(' e ');
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
                `❌ Sem permissão em **${voiceChannel.name}**.\n` +
                `Dê ao bot a permissão ${missing} nesse canal e tente novamente.`
              )],
              components: [],
            });
          }

          await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x9B4FD6).setDescription(`📻 Carregando estação e entrando em **${voiceChannel.name}**...`)],
            components: [],
          });

          const playlistKey = interaction.values[0];
          const session = await createRadioSession({ guild: interaction.guild, channelId: voiceChannel.id, playlistKey });

          if (!session) {
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(
                '❌ Falha de conexão ao canal de voz. Isso pode ser uma instabilidade temporária de rede.\n' +
                'Tente novamente em alguns segundos. Se persistir, verifique se o bot tem permissão **Conectar** e **Falar** no canal.'
              )],
              components: [],
            });
          }

          const ok = await session.start();
          if (!ok) {
            session.stop();
            return interaction.editReply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Não foi possível carregar a playlist. Tente novamente em alguns segundos.')],
              components: [],
            });
          }

          const panel = buildRadioPanel(session);
          const publicMsg = await interaction.channel.send(panel);
          session.controlMessage = { channelId: publicMsg.channelId, messageId: publicMsg.id };

          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Rádio iniciado em **${voiceChannel.name}**! Painel enviado no canal.`)],
            components: [],
          });
        }

        // ── AJUDA: Seleção de categoria ─────────────────────────────────────
        if (interaction.customId === 'ajuda_cat_sel') {
          return handleAjudaCatSel(interaction);
        }

        // ── PERFIL: Menu de personalização ───────────────────────────────────
        if (interaction.customId === 'profile_menu') {
          const selectedId = interaction.values[0];

          if (selectedId === 'profile_conquistas_btn') {
            const { computeEarnedBadgeKeys, BADGE_DEFS } = await import('../utils/profileCard.js');

            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            const [eco, profile, purchases, overrides] = await Promise.all([
              prisma.economy.findUnique({ where: { userId_guildId: { userId, guildId } } }),
              prisma.userProfile.findUnique({ where: { userId } }),
              prisma.userPurchase.count({ where: { userId } }),
              prisma.guildBadgeEmoji.findMany({ where: { guildId } }).catch(() => []),
            ]);

            const overrideMap = {};
            for (const o of overrides) overrideMap[o.badgeKey] = o.emoji;

            const balance = eco?.balance ?? 0;
            const bank = eco?.bank ?? 0;
            const activePet = profile?.activePet ?? null;
            const activeBanner = profile?.activeBanner ?? null;
            const activeRing = profile?.activeRing ?? null;
            const earned = new Set(computeEarnedBadgeKeys({ balance, bank, purchases, activePet, activeBanner, activeRing }));
            const total = balance + bank;

            const progressLines = BADGE_DEFS.map(b => {
              const emoji = overrideMap[b.key] ?? b.defaultEmoji;
              const isEarned = earned.has(b.key);
              let progress = '';
              if (!isEarned) {
                if (b.key === 'vip') progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/50.000`;
                else if (b.key === 'rico') progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/10.000`;
                else if (b.key === 'poupador') progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/5.000`;
                else if (b.key === 'colecionador') progress = ` — Itens: ${purchases}/10`;
                else if (b.key === 'comprador') progress = ` — Itens: ${purchases}/5`;
                else if (b.key === 'mascote') progress = ' — Equipe um pet';
                else if (b.key === 'estiloso') progress = ' — Equipe um banner';
                else if (b.key === 'personalizado') progress = ' — Equipe uma argola';
              }
              return `${isEarned ? '✅' : '🔒'} ${emoji} **${b.name}**${isEarned ? '' : progress}\n> ${b.description}`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
              .setColor(0x9B4FD6)
              .setTitle(`🏅 Conquistas — ${earned.size}/${BADGE_DEFS.length} desbloqueadas`)
              .setDescription(progressLines)
              .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }))
              .setFooter({ text: 'Conquistas desbloqueadas aparecem como emoji no seu perfil' });

            return interaction.reply({ embeds: [embed], ephemeral: true });
          }

          return await handleShopInteraction(interaction, client);
        }

        // ── CARTEIRA: Menu de personalização ─────────────────────────────────
        if (interaction.customId === 'wallet_menu') {
          return await handleShopInteraction(interaction, client);
        }

        // ── PAINEL CENTRAL: Seleção de módulo ───────────────────────────────
        if (interaction.customId === 'painel_modulo_sel') {
          return handlePainelModuloSel(interaction);
        }

        // ── VIP ────────────────────────────────────────────────────────────
        if (interaction.customId.startsWith('vip_')) {
          return handleVipButton(interaction);
        }

        // ── LOJA / PERFIL / ADMIN: Menus da loja e banner ──────────────────
        if (
          interaction.customId.startsWith('shop_') ||
          interaction.customId.startsWith('profile_') ||
          interaction.customId.startsWith('loja_admin_') ||
          interaction.customId.startsWith('banner_admin_') ||
          interaction.customId.startsWith('remover_banner_') ||
          interaction.customId.startsWith('wallet_fundo') ||
          interaction.customId.startsWith('wallet_ring')
        ) {
          return await handleShopInteraction(interaction, client);
        }

        // ── Carregar preset de Ticket ──────────────────────────────────────
        if (interaction.customId === 'strsel_preset_tc') {
          const presetId = interaction.values[0];
          const preset   = await prisma.panelPreset.findUnique({ where: { id: presetId } });
          if (!preset) return interaction.update({ content: '❌ Preset não encontrado.', components: [] });

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: {
              guildId:       interaction.guildId,
              ticketColor:   preset.color,
              ticketBanner:  preset.banner,
              ticketThumb:   preset.thumb,
              ticketFooter:  preset.footer,
              ticketTitle:   preset.title,
              ticketText:    preset.text,
            },
            update: {
              ticketColor:   preset.color,
              ticketBanner:  preset.banner,
              ticketThumb:   preset.thumb,
              ticketFooter:  preset.footer,
              ticketTitle:   preset.title,
              ticketText:    preset.text,
            },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        // ── Carregar preset de Tellonym ────────────────────────────────────
        if (interaction.customId === 'strsel_preset_tn') {
          const presetId = interaction.values[0];
          const preset   = await prisma.panelPreset.findUnique({ where: { id: presetId } });
          if (!preset) return interaction.update({ content: '❌ Preset não encontrado.', components: [] });

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: {
              guildId:        interaction.guildId,
              tellonymColor:  preset.color,
              tellonymBanner: preset.banner,
              tellonymThumb:  preset.thumb,
              tellonymFooter: preset.footer,
              tellonymTitle:  preset.title,
              tellonymText:   preset.text,
            },
            update: {
              tellonymColor:  preset.color,
              tellonymBanner: preset.banner,
              tellonymThumb:  preset.thumb,
              tellonymFooter: preset.footer,
              tellonymTitle:  preset.title,
              tellonymText:   preset.text,
            },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTellonymConfigPayload(cfg);
          return interaction.update({ ...payload, content: null });
        }

        return;
      }

      // ── BUTTONS ────────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId.startsWith('bank_')) {
          return handleBankInteraction(interaction);
        }

        // ── PACK POKÉMON: abertura carta por carta ─────────────────────────
        if (customId.startsWith('pokemon_pack_')) {
          return handleCardPackInteraction(interaction);
        }
        if (customId.startsWith('fut_pack_')) {
          return handleFutPackInteraction(interaction);
        }
        if (customId.startsWith('battle_')) {
          return handleBattleInteraction(interaction);
        }
        if (
          customId.startsWith('pokemon_dex_') ||
          customId.startsWith('pokemon_card_') ||
          customId.startsWith('pokemon_collection_') ||
          customId.startsWith('pokemon_sell_') ||
          customId.startsWith('pokemon_vitrine')
        ) {
          return handleCardCollectionInteraction(interaction);
        }

        // ── MODERAÇÃO: confirmações de ban, kick e mute ────────────────────
        if (customId.startsWith('mod_confirm:') || customId.startsWith('mod_cancel:')) {
          return handleModerationButton(interaction);
        }

        // ── PET: ações rápidas do painel V2 ───────────────────────────────
        if (customId.startsWith('pet_action:')) {
          return handlePetButton(interaction);
        }

        // ── PESCA: loja, venda e inventário ──────────────────────────────
        if (customId.startsWith('fish_')) {
          return handleFishingInteraction(interaction);
        }

        // ── DROP: Resgatar prêmio ────────────────────────────────────────
        if (customId.startsWith('drop_claim_')) {
          return handleDropClaim(interaction);
        }

        // ── JOGOS: Blackjack / Mines ─────────────────────────────────────
        if (customId.startsWith('bj_hit_'))
          return handleBJHit(interaction, customId.replace('bj_hit_', ''));
        if (customId.startsWith('bj_stand_'))
          return handleBJStand(interaction, customId.replace('bj_stand_', ''));
        if (customId.startsWith('mines_cell_')) {
          const parts = customId.split('_');
          return handleMinesCell(interaction, parseInt(parts[2]), parts[3]);
        }
        if (customId.startsWith('mines_cashout_'))
          return handleMinesCashout(interaction, customId.replace('mines_cashout_', ''));

        // ── RÁDIO: Controles do painel (admin only) ─────────────────────
        if (customId === 'radio_toggle' || customId === 'radio_stop') {
          const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
          if (!isAdmin) {
            return interaction.reply({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Apenas administradores podem controlar o rádio.')],
              ephemeral: true,
            });
          }

          const session = radioSessions.get(interaction.guildId);
          if (!session) {
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ O rádio não está mais ativo.')],
              components: [],
            });
          }

          if (customId === 'radio_toggle') {
            if (session.paused) session.resume(); else session.pause();
          } else if (customId === 'radio_stop') {
            session.stop();
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⏹️ Rádio Encerrado').setDescription('O rádio foi parado por um administrador.')],
              components: [],
            });
          }

          return interaction.update(buildRadioPanel(session));
        }

        // ── MÚSICA: Controles do player ──────────────────────────────────
        if (customId === 'music_toggle' || customId === 'music_stop') {
          const session = musicSessions.get(interaction.guildId);
          if (!session) {
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xED4245).setDescription('❌ Não há música tocando no momento.')],
              components: [],
            });
          }

          if (customId === 'music_toggle') {
            if (session.paused) session.resume(); else session.pause();
            return interaction.update(buildMusicPanel(session));
          } else if (customId === 'music_stop') {
            session.stop();
            return interaction.update({
              embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⏹️ Música Encerrada').setDescription('A reprodução foi parada.')],
              components: [],
            });
          }
        }

        // ── PERFIL: Botão de conquistas ──────────────────────────────
        if (customId === 'profile_conquistas_btn') {
          const { computeEarnedBadgeKeys, BADGE_DEFS } = await import('../utils/profileCard.js');

          const userId  = interaction.user.id;
          const guildId = interaction.guildId;

          const [eco, profile, purchases, overrides] = await Promise.all([
            prisma.economy.findUnique({ where: { userId_guildId: { userId, guildId } } }),
            prisma.userProfile.findUnique({ where: { userId } }),
            prisma.userPurchase.count({ where: { userId } }),
            prisma.guildBadgeEmoji.findMany({ where: { guildId } }).catch(() => []),
          ]);

          const overrideMap = {};
          for (const o of overrides) overrideMap[o.badgeKey] = o.emoji;

          const balance    = eco?.balance ?? 0;
          const bank       = eco?.bank ?? 0;
          const activePet  = profile?.activePet ?? null;
          const activeBanner = profile?.activeBanner ?? null;
          const activeRing   = profile?.activeRing ?? null;

          const earned = new Set(computeEarnedBadgeKeys({ balance, bank, purchases, activePet, activeBanner, activeRing }));

          // Build progress info
          const total = balance + bank;

          const progressLines = BADGE_DEFS.map(b => {
            const emoji    = overrideMap[b.key] ?? b.defaultEmoji;
            const isEarned = earned.has(b.key);
            const status   = isEarned ? '✅' : '🔒';

            let progress = '';
            if (!isEarned) {
              if (b.key === 'vip')          progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/50.000`;
              else if (b.key === 'rico')    progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/10.000`;
              else if (b.key === 'poupador')progress = ` — Saldo: ${total.toLocaleString('pt-BR')}/5.000`;
              else if (b.key === 'colecionador') progress = ` — Itens: ${purchases}/10`;
              else if (b.key === 'comprador')    progress = ` — Itens: ${purchases}/5`;
              else if (b.key === 'mascote')   progress = ` — Equipe um pet`;
              else if (b.key === 'estiloso')  progress = ` — Equipe um banner`;
              else if (b.key === 'personalizado') progress = ` — Equipe uma argola`;
            }

            return `${status} ${emoji} **${b.name}**${isEarned ? '' : progress}\n> ${b.description}`;
          }).join('\n\n');

          const earnedCount = earned.size;
          const embed = new EmbedBuilder()
            .setColor(0x9B4FD6)
            .setTitle(`🏅 Conquistas — ${earnedCount}/${BADGE_DEFS.length} desbloqueadas`)
            .setDescription(progressLines)
            .setThumbnail(interaction.user.displayAvatarURL({ extension: 'png', size: 128 }))
            .setFooter({ text: 'Conquistas desbloqueadas aparecem como emoji no seu perfil' });

          return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ── VIP ────────────────────────────────────────────────────────────
        if (customId.startsWith('vip_')) {
          return handleVipButton(interaction);
        }

        // ── LOJA / PERFIL: Botões da loja, config e perfil ──────────────
        if (
          customId.startsWith('shop_') ||
          customId.startsWith('loja_cfg_') ||
          customId.startsWith('loja_admin_') ||
          customId.startsWith('profile_') ||
          customId.startsWith('banner_admin_') ||
          customId.startsWith('remover_banner_') ||
          customId.startsWith('wallet_fundo') ||
          customId.startsWith('wallet_ring')
        ) {
          return await handleShopInteraction(interaction, client);
        }

        // ── PAINEL CENTRAL: Navegação ───────────────────────────────────
        if (customId === 'painel_funcoes' || customId === 'painel_refresh') {
          return handlePainelFuncoes(interaction);
        }
        if (customId === 'painel_voltar') {
          return handlePainelVoltar(interaction);
        }

        // ── PAINEL CENTRAL: Botões "Configurar" de cada módulo ───────────
        if (customId.startsWith('painel_cfg_')) {
          return handlePainelCfgBtn(interaction);
        }

        if (customId === 'bump_toggle' || customId === 'bump_channel_clear') {
          return handleBumpCfgBtn(interaction);
        }

        if (customId.startsWith('antilink_')) {
          return handleAntiLinkCfgBtn(interaction);
        }

        // ── PAINEL CENTRAL: Botões mini-config Instagram ─────────────────
        if (customId.startsWith('insta_cfg_')) {
          return handleInstaCfgBtn(interaction);
        }

        // ── PAINEL CENTRAL: Botões pm_* (planos VIP etc.) ────────────────
        if (customId.startsWith('pm_')) {
          return handlePainelModuleBtn(interaction);
        }

        if (customId.startsWith('boost_roles_')) {
          return handleBoostCfgBtn(interaction);
        }

        // ── INSTAGRAM: Toggle like ───────────────────────────────────────
        if (customId.startsWith('insta_like_')) {
          const postId = customId.slice('insta_like_'.length);
          if (!likesMap.has(postId)) likesMap.set(postId, new Set());
          const likes = likesMap.get(postId);
          if (likes.has(interaction.user.id)) likes.delete(interaction.user.id);
          else likes.add(interaction.user.id);

          const isV2 = interaction.message.flags?.has(MessageFlags.IsComponentsV2);
          if (isV2) {
            // Componentes V2: ActionRow está no topo junto ao Container
            const allComps = interaction.message.components;
            const arIdx    = allComps.findIndex(c => c.type === 1);
            if (arIdx >= 0) {
              const ar = allComps[arIdx];
              const updatedRow = new ActionRowBuilder().addComponents(
                ar.components.map(btn => {
                  const b = ButtonBuilder.from(btn);
                  if (btn.customId?.startsWith('insta_like_')) b.setLabel(String(likes.size));
                  return b;
                })
              );
              const newComps = [...allComps.slice(0, arIdx), updatedRow, ...allComps.slice(arIdx + 1)];
              return interaction.update({ components: newComps, flags: MessageFlags.IsComponentsV2 });
            }
          }

          // Fallback: formato antigo (sem V2)
          const comps   = interaction.message.components[0].components;
          const updated = new ActionRowBuilder().addComponents(
            ButtonBuilder.from(comps[0]).setLabel(String(likes.size)),
            ...comps.slice(1).map(c => ButtonBuilder.from(c)),
          );
          return interaction.update({ components: [updated] });
        }

        // ── INSTAGRAM: Ver quem curtiu ───────────────────────────────────
        if (customId.startsWith('insta_who_')) {
          const postId = customId.slice('insta_who_'.length);
          const likes  = likesMap.get(postId);
          if (!likes || likes.size === 0)
            return interaction.reply({ content: '💔 Nenhuma curtida ainda.', ephemeral: true });
          const list = [...likes].map(id => `<@${id}>`).join('\n');
          return interaction.reply({
            embeds: [new EmbedBuilder().setColor(0x833AB4).setTitle(`💜 Curtidas — ${likes.size}`).setDescription(list)],
            ephemeral: true,
          });
        }

        // ── INSTAGRAM: Comentar ─────────────────────────────────────────
        if (customId.startsWith('insta_comment_')) {
          const threadId = customId.slice('insta_comment_'.length);
          const modal = new ModalBuilder()
            .setCustomId(`insta_cmodal_${threadId}`)
            .setTitle('💬 Enviar Comentário');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('comment')
                .setLabel('Seu comentário')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Escreva seu comentário...')
                .setRequired(true)
                .setMaxLength(500)
            ),
          );
          return interaction.showModal(modal);
        }

        // ── INSTAGRAM: Deletar ───────────────────────────────────────────
        if (customId.startsWith('insta_del_')) {
          const parts    = customId.split('_');
          const authorId = parts[parts.length - 1];
          const isAdmin  = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages);
          if (interaction.user.id !== authorId && !isAdmin)
            return interaction.reply({ embeds: [errorEmbed('Apenas o autor ou um moderador pode deletar.')], ephemeral: true });
          await interaction.message.delete();
          return;
        }

        // ── TICKET: Abrir modal ──────────────────────────────────────────
        if (customId === 'ticket_open') {
          await interaction.deferReply({ ephemeral: true });
          const guild  = interaction.guild;
          const config = await prisma.guildConfig.findUnique({ where: { guildId: guild.id } });

          const existing = await prisma.ticket.findFirst({ where: { userId: interaction.user.id, guildId: guild.id, status: 'open' } });
          if (existing) {
            const existingChannel = guild.channels.cache.get(existing.channelId)
              ?? await guild.channels.fetch(existing.channelId).catch(() => null);
            if (!existingChannel) {
              await prisma.ticket.updateMany({
                where: { userId: interaction.user.id, guildId: guild.id, status: 'open' },
                data:  { status: 'closed' },
              });
            } else {
              return interaction.editReply({ embeds: [errorEmbed(`Você já tem um ticket aberto: <#${existing.channelId}>`)] });
            }
          }

          const ticketCount  = await prisma.ticket.count({ where: { guildId: guild.id } });
          const ticketNumber = ticketCount + 1;

          const permissionOverwrites = [
            { id: guild.roles.everyone, deny:  [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id,       allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.AttachFiles] },
          ];

          if (config?.ticketPingRole) {
            const pingRoleIds = config.ticketPingRole.split(',').map(s => s.trim()).filter(Boolean);
            for (const rId of pingRoleIds) {
              permissionOverwrites.push({
                id: rId,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
              });
            }
          }

          let category = null;
          if (config?.ticketCategory) {
            const cat = guild.channels.cache.get(config.ticketCategory);
            if (cat && cat.type === ChannelType.GuildCategory) category = config.ticketCategory;
          }

          const channel = await guild.channels.create({
            name: `📌・${interaction.user.username}・N°${ticketNumber}`,
            type: ChannelType.GuildText,
            topic: `Iniciada por ${interaction.user.displayName ?? interaction.user.username}`,
            parent: category,
            permissionOverwrites,
          });

          await prisma.ticket.create({
            data: { channelId: channel.id, userId: interaction.user.id, guildId: guild.id },
          });

          const memberAvatar = interaction.member?.displayAvatarURL({ size: 128, extension: 'png' }) ?? interaction.user.displayAvatarURL({ size: 128, extension: 'png' });
          const memberName   = interaction.member?.displayName ?? interaction.user.username;

          const pingRoleMentions = config?.ticketPingRole
            ? config.ticketPingRole.split(',').map(s => `<@&${s.trim()}>`).filter(Boolean).join(' ')
            : '';
          const pingUserMentions = config?.ticketPingUser
            ? config.ticketPingUser.split(',').map(s => `<@${s.trim()}>`).filter(Boolean).join(' ')
            : '';
          const extraPings = [pingRoleMentions, pingUserMentions].filter(Boolean).join(' ');
          const pingLine = extraPings
            ? `<@${interaction.user.id}> ${extraPings}`
            : `<@${interaction.user.id}>`;

          const pingDisplay = new TextDisplayBuilder().setContent(pingLine);

          const ticketContainer = ticketActionContainer({
            channelId: channel.id,
            title: `# Ticket - ${memberName}`,
            avatar: memberAvatar,
            claimedBy: null,
            text: 'Aguarde um instante, em breve um promotor irá lhe atender.',
          });

          try {
            await channel.send({ components: [pingDisplay, ticketContainer], flags: MessageFlags.IsComponentsV2 });
          } catch (err) {
            console.error('[TICKET SEND ERROR]', err?.message ?? err);
            await channel.delete().catch(() => {});
            await prisma.ticket.deleteMany({ where: { channelId: channel.id } }).catch(() => {});
            return interaction.editReply({ embeds: [errorEmbed('Não foi possível criar o ticket. Tente novamente.')] });
          }
          return interaction.editReply({ embeds: [successEmbed('Ticket Criado', `Seu ticket foi aberto em ${channel}.`)] });
        }

        // ── TICKET: Fechar ───────────────────────────────────────────────
        if (customId.startsWith('ticket_close_')) {
          const channelId = customId.replace('ticket_close_', '');
          await interaction.deferReply({ ephemeral: true });
          const ticket = await prisma.ticket.findUnique({ where: { channelId } });
          if (!ticket) return interaction.editReply({ content: '❌ Ticket não encontrado.' });
          await prisma.ticket.update({ where: { channelId }, data: { status: 'closed' } });
          await interaction.editReply({ content: '🔒 Fechando o ticket em 5 segundos...' });
          setTimeout(() => interaction.channel?.delete().catch(() => {}), 5000);
          return;
        }

        // ── TICKET: Assumir ──────────────────────────────────────────────
        if (customId.startsWith('ticket_assume_')) {
          const channelId = customId.replace('ticket_assume_', '');
          await interaction.deferReply({ ephemeral: true });
          const ticket    = await prisma.ticket.findUnique({ where: { channelId } });
          if (!ticket || ticket.status !== 'open')
            return interaction.editReply({ content: '❌ Este ticket já foi fechado ou não foi encontrado.' });
          if (ticket?.claimedBy)
            return interaction.editReply({ content: `❌ Ticket já assumido por <@${ticket.claimedBy}>.` });

          const claimed = await prisma.ticket.updateMany({
            where: { channelId, status: 'open', claimedBy: null },
            data: { claimedBy: interaction.user.id },
          });
          if (claimed.count === 0)
            return interaction.editReply({ content: '❌ Não foi possível assumir este ticket. Tente novamente.' });

          const updatedTicket = { ...ticket, claimedBy: interaction.user.id };
          await refreshTicketActionMessage(
            interaction,
            updatedTicket,
            client,
            `✅ Atendimento assumido por <@${interaction.user.id}>. Em breve a equipe continuará o suporte.`,
          );
          return interaction.editReply({ content: `✅ <@${interaction.user.id}> assumiu este ticket!` });
        }

        // ── CASAR: Atualizar / Gerenciar ──────────────────────────────────
        if (customId.startsWith('casar_refresh_') || customId.startsWith('casar_manage_')) {
          const [, action, leftId, rightId] = customId.split('_');
          return handleWeddingCardAction(interaction, action, leftId, rightId);
        }

        // ── DIVORCIAR: confirmar / cancelar ────────────────────────────────
        if (customId.startsWith('divorciar_confirm_') || customId.startsWith('divorciar_cancel_')) {
          const parts = customId.split('_');
          const action = parts[1];
          const userId = parts[2];
          const partnerId = parts[3];

          if (interaction.user.id !== userId) {
            return interaction.reply({
              content: '❌ Apenas a pessoa que iniciou esta confirmação pode usá-la.',
              ephemeral: true,
            });
          }

          if (action === 'cancel') {
            return interaction.update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x5865F2)
                  .setTitle('💍 Divórcio cancelado')
                  .setDescription('O casamento continua ativo.'),
              ],
              components: [],
            });
          }

          const profile = await prisma.userProfile.findUnique({ where: { userId } });
          if (!profile?.marriedTo || profile.marriedTo !== partnerId) {
            return interaction.update({
              embeds: [
                new EmbedBuilder()
                  .setColor(0xED4245)
                  .setTitle('💔 Casamento não encontrado')
                  .setDescription('Esse vínculo já foi removido ou alterado.'),
              ],
              components: [],
            });
          }

          await Promise.all([
            prisma.userProfile.update({
              where: { userId },
              data: { marriedTo: null, marriedToName: null, marriedAt: null },
            }),
            prisma.userProfile.updateMany({
              where: { userId: partnerId, marriedTo: userId },
              data: { marriedTo: null, marriedToName: null, marriedAt: null },
            }),
          ]);

          return interaction.update({
            embeds: [
              new EmbedBuilder()
                .setColor(0xED4245)
                .setTitle('💔 Divórcio concluído')
                .setDescription('O vínculo foi removido dos dois perfis.'),
            ],
            components: [],
          });
        }

        // ── CASAR: Aceitar / Recusar ─────────────────────────────────────
        if (customId.startsWith('casar_accept_') || customId.startsWith('casar_reject_')) {
          const parts      = customId.split('_');
          const action     = parts[1];
          const proposerId = parts[2];
          const targetId   = parts[3];

          if (interaction.user.id !== targetId)
            return interaction.reply({ content: '❌ Apenas a pessoa marcada pode responder a este pedido.', ephemeral: true });

          // Reconhece o botão antes de consultar o banco, buscar usuários ou
          // gerar a imagem. A confirmação termina em um card V2 novo; a flag
          // V2 é aplicada no editReply, não no deferReply.
          if (action === 'reject') {
            await interaction.deferUpdate();
          } else {
            await interaction.deferReply();
          }

          const proposerName = (await interaction.guild.members.fetch(proposerId).catch(() => null))?.displayName
            ?? (await interaction.client.users.fetch(proposerId).catch(() => null))?.username
            ?? 'Desconhecido';
          const targetName = interaction.member?.displayName ?? interaction.user.username;

          if (action === 'reject') {
            const rejectEmbed = new EmbedBuilder()
              .setColor(0xFF4444)
              .setTitle('💔 Pedido Recusado')
              .setDescription(`**${targetName}** recusou o pedido de **${proposerName}**. 😢`);
            return interaction.editReply({ embeds: [rejectEmbed], components: [] });
          }

          const [proposerProfile, targetProfile] = await Promise.all([
            prisma.userProfile.findUnique({ where: { userId: proposerId } }),
            prisma.userProfile.findUnique({ where: { userId: targetId } }),
          ]);

          const proposerHasOtherPartner = proposerProfile?.marriedTo
            && proposerProfile.marriedTo !== targetId;
          const targetHasOtherPartner = targetProfile?.marriedTo
            && targetProfile.marriedTo !== proposerId;

          if (proposerHasOtherPartner || targetHasOtherPartner) {
            return interaction.editReply({
              embeds: [errorEmbed('Um dos usuários já está casado com outra pessoa!')],
              components: [],
            });
          }

          // Pedidos antigos podem ser aceitos depois de o vínculo já ter sido
          // criado ou parcialmente salvo. Reaproveita o casal e repara o outro
          // perfil em vez de acusar um casamento inválido.
          const marriedAt = proposerProfile?.marriedAt
            ?? targetProfile?.marriedAt
            ?? new Date();
          await prisma.$transaction([
            prisma.userProfile.upsert({
              where: { userId: proposerId },
              update: { marriedTo: targetId, marriedToName: targetName, marriedAt },
              create: { userId: proposerId, marriedTo: targetId, marriedToName: targetName, marriedAt },
            }),
            prisma.userProfile.upsert({
              where:  { userId: targetId },
              update: { marriedTo: proposerId, marriedToName: proposerName, marriedAt },
              create: { userId: targetId, marriedTo: proposerId, marriedToName: proposerName, marriedAt },
            }),
          ]);

          const [proposerUser, targetUser, proposerMember, targetMember] = await Promise.all([
            interaction.client.users.fetch(proposerId),
            interaction.client.users.fetch(targetId),
            interaction.guild.members.fetch(proposerId).catch(() => null),
            interaction.guild.members.fetch(targetId).catch(() => null),
          ]);
          const stats = await getMarriageStats(proposerId, targetId, marriedAt);
          await interaction.message.edit({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('💍 Casamento confirmado')
                .setDescription(`**${proposerName}** e **${targetName}** agora estão casados!`),
            ],
            components: [],
          }).catch(() => {});
          return interaction.editReply(await buildWeddingCardPayload({
            left: {
              id: proposerId,
              displayName: proposerMember?.displayName ?? proposerUser.globalName ?? proposerUser.username,
              username: proposerUser.username,
              avatarUrl: proposerUser.displayAvatarURL({
                extension: 'png',
                forceStatic: true,
                size: 256,
              }),
            },
            right: {
              id: targetId,
              displayName: targetMember?.displayName ?? targetUser.globalName ?? targetUser.username,
              username: targetUser.username,
              avatarUrl: targetUser.displayAvatarURL({
                extension: 'png',
                forceStatic: true,
                size: 256,
              }),
            },
            stats,
          }));
        }

        // ── AMIGO: Aceitar / Recusar ─────────────────────────────────────
        if (customId.startsWith('amigo_accept_') || customId.startsWith('amigo_reject_')) {
          const parts      = customId.split('_');
          const action     = parts[1];
          const requesterId = parts[2];
          const targetId   = parts[3];

          if (interaction.user.id !== targetId)
            return interaction.reply({ content: '❌ Apenas a pessoa marcada pode responder a este pedido.', ephemeral: true });

          const requesterName = (await interaction.guild.members.fetch(requesterId).catch(() => null))?.displayName
            ?? (await interaction.client.users.fetch(requesterId).catch(() => null))?.username
            ?? 'Desconhecido';
          const targetName = interaction.member?.displayName ?? interaction.user.username;

          if (action === 'reject') {
            const rejectEmbed = new EmbedBuilder()
              .setColor(0xFF6B6B)
              .setTitle('💔 Pedido Recusado')
              .setDescription(`**${targetName}** recusou o pedido de amizade de **${requesterName}**. 😢`);
            await interaction.message.edit({ embeds: [rejectEmbed], components: [] }).catch(() => {});
            return interaction.reply({ content: `💔 Que pena, **${requesterName}**...` });
          }

          const [rp, tp] = await Promise.all([
            prisma.userProfile.findUnique({ where: { userId: requesterId } }),
            prisma.userProfile.findUnique({ where: { userId: targetId } }),
          ]);

          if (rp?.bestFriendId || tp?.bestFriendId) {
            await interaction.message.edit({ components: [] }).catch(() => {});
            return interaction.reply({ embeds: [errorEmbed('Um dos usuários já tem um melhor amigo(a)!')], ephemeral: true });
          }

          await Promise.all([
            prisma.userProfile.upsert({
              where:  { userId: requesterId },
              update: { bestFriendId: targetId, bestFriendName: targetName },
              create: { userId: requesterId, bestFriendId: targetId, bestFriendName: targetName },
            }),
            prisma.userProfile.upsert({
              where:  { userId: targetId },
              update: { bestFriendId: requesterId, bestFriendName: requesterName },
              create: { userId: targetId, bestFriendId: requesterId, bestFriendName: requesterName },
            }),
          ]);

          const acceptEmbed = new EmbedBuilder()
            .setColor(0xCE93D8)
            .setTitle('💝 Amizade Confirmada!')
            .setDescription(`**${requesterName}** e **${targetName}** agora são melhores amigos! 🎉\n\nVeja no perfil com \`/perfil\`.`);

          await interaction.message.edit({ embeds: [acceptEmbed], components: [] }).catch(() => {});
          return interaction.reply({ content: `🎉 Parabéns, <@${requesterId}> e <@${targetId}>!` });
        }

        // ── TICKET: Transcript ───────────────────────────────────────────
        if (customId.startsWith('ticket_transcript_')) {
          await interaction.deferReply({ ephemeral: true });
          try {
            const filepath   = await generateTranscript(interaction.channel);
            const attachment = new AttachmentBuilder(filepath, { name: `transcript-${interaction.channel.id}.html` });
            return interaction.editReply({ embeds: [successEmbed('Transcript Gerado', 'Histórico em HTML gerado com sucesso.')], files: [attachment] });
          } catch {
            return interaction.editReply({ embeds: [errorEmbed('Erro ao gerar transcript.')] });
          }
        }

        // ── CONFIG: Ticket — botões de campo ────────────────────────────
        if (customId.startsWith('tcfg_')) {
          const field = customId.replace('tcfg_', '');

          if (field === 'enviar') {
            await interaction.deferReply({ flags: 64 });
            const cfg = await getCfg(interaction.guildId);
            const menuOptions = cfg.ticketUseMenu
              ? await prisma.ticketOption.findMany({ where: { guildId: interaction.guildId }, orderBy: { order: 'asc' } })
              : [];
            try {
              await interaction.channel.send(buildTicketPanelV2(cfg, menuOptions, client));
              return interaction.editReply({ embeds: [successEmbed('Painel Enviado', `O painel de tickets foi enviado em ${interaction.channel}.`)] });
            } catch (err) {
              console.error('[TICKET PANEL SEND ERROR]', err?.message ?? err);
              const msg = err?.message ?? 'Erro desconhecido';
              // Detecta qual opção do menu tem emoji inválido e nomeia para facilitar a correção
              const idxMatch = msg.match(/options\[(\d+)\]/);
              const badIdx   = idxMatch ? parseInt(idxMatch[1]) : null;
              const badOpt   = badIdx !== null ? menuOptions[badIdx] : null;
              const hint = badOpt
                ? `\n⚠️ O emoji **${badOpt.emoji}** da opção **"${badOpt.label}"** é inválido (emoji deletado ou de outro servidor). Use **Opções do Menu** para corrigir.`
                : '\nVerifique se o emoji do botão é válido ou se o bot tem permissão no canal.';
              return interaction.editReply({ content: `❌ Não foi possível enviar o painel: \`${msg}\`${hint}` });
            }
          }

          // ── Toggle modo menu (select menu em vez de botão) ────────────────
          if (field === 'use_menu') {
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.ticketUseMenu ?? false);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketUseMenu: newVal },
              update: { ticketUseMenu: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildTicketConfigPayload(updated), content: null });
          }

          // ── Toggle atendimento automático por IA ──────────────────────────
          if (field === 'ai') {
            const cfg = await getCfg(interaction.guildId);
            const newVal = !(cfg.ticketAiEnabled ?? false);
            await prisma.guildConfig.upsert({
              where: { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketAiEnabled: newVal },
              update: { ticketAiEnabled: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildTicketConfigPayload(updated), content: null });
          }

          // ── Gestão de opções do menu de ticket ────────────────────────────
          if (field === 'menu_opts') {
            await interaction.deferUpdate();
            return interaction.editReply(await buildMenuOptsPanel(interaction.guildId, client));
          }

          // ── Voltar ao painel de config do ticket ──────────────────────────
          if (field === 'menu_back') {
            const cfg = await getCfg(interaction.guildId);
            return interaction.update({ ...buildTicketConfigPayload(cfg), content: null });
          }

          if (field === 'menu_opt_add') {
            return interaction.showModal(buildAddOptionModal());
          }

          if (field.startsWith('menu_opt_edit:')) {
            const optId  = field.split(':')[1];
            const option = await prisma.ticketOption.findUnique({ where: { id: optId } });
            if (!option) return interaction.reply({ content: '❌ Opção não encontrada.', ephemeral: true });
            return interaction.showModal(buildEditOptionModal(option));
          }

          if (field.startsWith('menu_opt_del:')) {
            const optId = field.split(':')[1];
            await prisma.ticketOption.delete({ where: { id: optId } }).catch(() => {});
            await interaction.deferUpdate();
            return interaction.editReply(await buildMenuOptsPanel(interaction.guildId, client));
          }

          if (field === 'salvar') {
            const modal = new ModalBuilder()
              .setCustomId('preset_modal_tc')
              .setTitle('💾 Salvar Preset — Ticket');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('preset_name')
                  .setLabel('Nome do preset')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex: Suporte Geral, Vendas...')
                  .setRequired(true)
                  .setMaxLength(50)
              ),
            );
            return interaction.showModal(modal);
          }

          if (field === 'carregar') {
            const presets = await prisma.panelPreset.findMany({ where: { guildId: interaction.guildId, type: 'ticket' } });
            if (!presets.length) {
              return interaction.reply({ content: '📭 Você ainda não tem presets salvos para Ticket.\nUse **Salvar Preset** para guardar a configuração atual.', ephemeral: true });
            }
            const select = new StringSelectMenuBuilder()
              .setCustomId('strsel_preset_tc')
              .setPlaceholder('Selecione um preset para carregar')
              .addOptions(presets.map(p =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(p.name)
                  .setValue(p.id)
                  .setDescription(`Salvo em ${p.createdAt.toLocaleDateString('pt-BR')}`)
              ));
            const cancelBtn = new ButtonBuilder().setCustomId('tcfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '📂 Selecione o preset que deseja carregar:',
              select,
              cancelBtn,
            ));
          }

          if (field === 'cancelar') {
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          if (field === 'categoria') {
            const select = new ChannelSelectMenuBuilder()
              .setCustomId('chansel_tc')
              .setPlaceholder('Selecione a categoria dos tickets')
              .setChannelTypes([ChannelType.GuildCategory]);
            const cancelBtn = new ButtonBuilder().setCustomId('tcfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '📂 Selecione a categoria onde os tickets serão criados:',
              select,
              cancelBtn,
            ));
          }

          // ── Ping de cargo ────────────────────────────────────────────
          if (field === 'ping') {
            const modal = new ModalBuilder()
              .setCustomId('tcfg_modal_ping')
              .setTitle('🔔 Ping da Equipe — Cargos');
            const cfg = await getCfg(interaction.guildId);
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('role_id')
                  .setLabel('IDs dos cargos (separados por vírgula)')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('123456789012345678\n987654321098765432\n(deixe vazio para desativar)')
                  .setValue(cfg.ticketPingRole ? cfg.ticketPingRole.split(',').join('\n') : '')
                  .setRequired(false)
                  .setMaxLength(400)
              ),
            );
            return interaction.showModal(modal);
          }

          // ── Ping de usuário ──────────────────────────────────────────
          if (field === 'ping_user') {
            const modal = new ModalBuilder()
              .setCustomId('tcfg_modal_ping_user')
              .setTitle('👤 Ping da Equipe — Usuários');
            const cfg = await getCfg(interaction.guildId);
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('user_id')
                  .setLabel('IDs dos usuários (separados por vírgula)')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('123456789012345678\n987654321098765432\n(deixe vazio para desativar)')
                  .setValue(cfg.ticketPingUser ? cfg.ticketPingUser.split(',').join('\n') : '')
                  .setRequired(false)
                  .setMaxLength(400)
              ),
            );
            return interaction.showModal(modal);
          }

          // ── Botão do ticket ──────────────────────────────────────────
          if (field === 'botao') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder()
              .setCustomId('tcfg_modal_botao')
              .setTitle('🔘 Botão — Abrir Ticket');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('btn_label').setLabel('Texto do botão')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Abrir Ticket')
                  .setValue(cfg.ticketBtnLabel ?? '').setRequired(false).setMaxLength(80)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('btn_emoji').setLabel('Emoji do botão (unicode ou <:nome:id>)')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('🎫 ou <:emoji:123456789> ou <a:emoji:123456789>')
                  .setValue(cfg.ticketBtnEmoji ?? '').setRequired(false).setMaxLength(100)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('btn_style').setLabel('Cor: primary | secondary | success | danger')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('primary=azul | success=verde | danger=vermelho')
                  .setValue(cfg.ticketBtnStyle ? cfg.ticketBtnStyle.toLowerCase() : 'primary').setRequired(false).setMaxLength(20)
              ),
            );
            return interaction.showModal(modal);
          }

          // ── Texto de abertura do ticket ───────────────────────────────
          if (field === 'abertura') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder()
              .setCustomId('tcfg_modal_abertura')
              .setTitle('💬 Texto de Abertura do Ticket');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('value')
                  .setLabel('Texto exibido no canal quando o ticket abre')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('Aguarde um instante, em breve um membro da equipe irá lhe atender.')
                  .setValue(cfg.ticketOpenText ?? '').setRequired(false).setMaxLength(500)
              ),
            );
            return interaction.showModal(modal);
          }

          // ── Sem lateral (limpa cor) ────────────────────────────────────
          if (field === 'sem_cor') {
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketColor: null },
              update: { ticketColor: null },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          // ── Toggle separador ──────────────────────────────────────────
          if (field === 'separador') {
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.ticketUseSeparator ?? false);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketUseSeparator: newVal },
              update: { ticketUseSeparator: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(updated);
            return interaction.update({ ...payload, content: null });
          }

          // ── Toggle posição do banner (cima/baixo) ─────────────────────
          if (field === 'banner_pos') {
            const cfg    = await getCfg(interaction.guildId);
            const newPos = (cfg.ticketBannerPosition ?? 'top') === 'top' ? 'bottom' : 'top';
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketBannerPosition: newPos },
              update: { ticketBannerPosition: newPos },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildTicketConfigPayload(updated), content: null });
          }

          // ── Toggle modo só banner (sem texto) ─────────────────────────
          if (field === 'only_banner') {
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.ticketOnlyBanner ?? false);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketOnlyBanner: newVal },
              update: { ticketOnlyBanner: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildTicketConfigPayload(updated), content: null });
          }

          const def = TICKET_MODAL_FIELDS[field];
          if (!def) return;

          const modal = new ModalBuilder()
            .setCustomId(`tcfg_modal_${field}`)
            .setTitle(`🎫 Ticket — ${def.label}`);
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('value')
                .setLabel(def.label)
                .setStyle(def.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setPlaceholder(def.placeholder)
                .setRequired(false)
                .setMaxLength(def.isLong ? 1000 : 500)
            ),
          );
          return interaction.showModal(modal);
        }

        // ── CONFIG: Tellonym — botões de campo ───────────────────────────
        if (customId.startsWith('tncfg_')) {
          const field = customId.replace('tncfg_', '');

          if (field === 'enviar') {
            await interaction.deferReply({ flags: 64 });
            const cfg = await getCfg(interaction.guildId);
            await interaction.channel.send(buildTellonymPanelV2(cfg));
            return interaction.editReply({ embeds: [successEmbed('Painel Enviado', `O painel Tellonym foi enviado em ${interaction.channel}.`)] });
          }

          if (field === 'salvar') {
            const modal = new ModalBuilder()
              .setCustomId('preset_modal_tn')
              .setTitle('💾 Salvar Preset — Tellonym');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('preset_name')
                  .setLabel('Nome do preset')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex: Servidor Principal, Eventos...')
                  .setRequired(true)
                  .setMaxLength(50)
              ),
            );
            return interaction.showModal(modal);
          }

          if (field === 'carregar') {
            const presets = await prisma.panelPreset.findMany({ where: { guildId: interaction.guildId, type: 'tellonym' } });
            if (!presets.length) {
              return interaction.reply({ content: '📭 Você ainda não tem presets salvos para Tellonym.\nUse **Salvar Preset** para guardar a configuração atual.', ephemeral: true });
            }
            const select = new StringSelectMenuBuilder()
              .setCustomId('strsel_preset_tn')
              .setPlaceholder('Selecione um preset para carregar')
              .addOptions(presets.map(p =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(p.name)
                  .setValue(p.id)
                  .setDescription(`Salvo em ${p.createdAt.toLocaleDateString('pt-BR')}`)
              ));
            const cancelBtn = new ButtonBuilder().setCustomId('tncfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '📂 Selecione o preset que deseja carregar:',
              select,
              cancelBtn,
            ));
          }

          if (field === 'cancelar') {
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTellonymConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          // ── Sem lateral (limpa cor) ────────────────────────────────────
          if (field === 'sem_cor') {
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, tellonymColor: null },
              update: { tellonymColor: null },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTellonymConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          if (field === 'canal') {
            const select = new ChannelSelectMenuBuilder()
              .setCustomId('chansel_tn')
              .setPlaceholder('Selecione o canal de destino')
              .setChannelTypes([ChannelType.GuildText]);
            const cancelBtn = new ButtonBuilder().setCustomId('tncfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '📣 Selecione o canal onde as mensagens do Tellonym serão enviadas:',
              select,
              cancelBtn,
            ));
          }

          if (field === 'botao') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder()
              .setCustomId('tncfg_modal_botao')
              .setTitle('🔘 Tellonym — Botão do Painel');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('btn_label')
                  .setLabel('Texto do botão')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex: Enviar Mensagem')
                  .setValue(cfg.tellonymBtnLabel ?? '')
                  .setRequired(false)
                  .setMaxLength(80)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('btn_emoji')
                  .setLabel('Emoji do botão')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Ex: 💌 ou <:nome:123456789>')
                  .setValue(cfg.tellonymBtnEmoji ?? '')
                  .setRequired(false)
                  .setMaxLength(100)
              ),
            );
            return interaction.showModal(modal);
          }

          const def = TELLONYM_MODAL_FIELDS[field];
          if (!def) return;

          const modal = new ModalBuilder()
            .setCustomId(`tncfg_modal_${field}`)
            .setTitle(`💌 Tellonym — ${def.label}`);
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('value')
                .setLabel(def.label)
                .setStyle(def.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
                .setPlaceholder(def.placeholder)
                .setRequired(false)
                .setMaxLength(def.isLong ? 1000 : 500)
            ),
          );
          return interaction.showModal(modal);
        }

        // ── CONFIG: Boas-Vindas — botões de campo ───────────────────────
        if (customId.startsWith('wcfg_')) {
          const field = customId.replace('wcfg_', '');

          if (field === 'test') {
            await interaction.deferReply({ ephemeral: true });
            const cfg = await getCfg(interaction.guildId);
            if (!cfg.welcomeChannel) {
              return interaction.editReply({ embeds: [errorEmbed('Configure primeiro o **Canal** de boas-vindas.')] });
            }
            const channel = interaction.guild.channels.cache.get(cfg.welcomeChannel)
              ?? await interaction.guild.channels.fetch(cfg.welcomeChannel).catch(() => null);
            if (!channel) {
              return interaction.editReply({ embeds: [errorEmbed('Canal de boas-vindas não encontrado.')] });
            }
            const member = interaction.member;
            const vars   = {
              user:      `<@${member.id}>`,
              username:  member.user.username,
              server:    interaction.guild.name,
              count:     interaction.guild.memberCount.toLocaleString('pt-BR'),
              avatarUrl: member.user.displayAvatarURL({ size: 256 }),
            };
            const parts = [`<@${member.id}>`];
            if (cfg.welcomeRoles)    cfg.welcomeRoles.split(',').map(s => s.trim()).filter(Boolean).forEach(id => parts.push(`<@&${id}>`));
            if (cfg.welcomeChannels) cfg.welcomeChannels.split(',').map(s => s.trim()).filter(Boolean).forEach(id => parts.push(`<#${id}>`));
            const payload = buildWelcomeV2(cfg, vars);
            try {
              // Discord não aceita content + IS_COMPONENTS_V2 juntos.
              // Enviamos dois mensagens e deletamos as duas ao mesmo tempo.
              const pingMsg  = await channel.send({ content: parts.join(' ') + ' *(teste)*' });
              const embedMsg = await channel.send(payload);
              if (cfg.welcomeDeleteAfter) {
                setTimeout(() => {
                  pingMsg.delete().catch(() => {});
                  embedMsg.delete().catch(() => {});
                }, cfg.welcomeDeleteAfter * 1000);
              }
              const deleteInfo = cfg.welcomeDeleteAfter ? ` (some em ${formatDeleteTime(cfg.welcomeDeleteAfter)})` : '';
              return interaction.editReply({ embeds: [successEmbed('Teste Enviado', `Mensagem de teste enviada em ${channel}${deleteInfo}.`)] });
            } catch (sendErr) {
              const errMsg = `Erro ao enviar no canal ${channel}: \`${sendErr?.message ?? sendErr}\``;
              return interaction.editReply({ embeds: [errorEmbed(errMsg)] });
            }
          }

          if (field === 'cancelar') {
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildWelcomeConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          // ── Sumir automaticamente ─────────────────────────────────────
          if (field === 'sumir') {
            const cfg   = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('wcfg_modal_sumir').setTitle('⏱️ Sumir — Tempo');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('value')
                .setLabel('Tempo em segundos (vazio = desativar)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 30 (30s)  |  120 (2min)  |  vazio = desativar')
                .setValue(cfg.welcomeDeleteAfter ? String(cfg.welcomeDeleteAfter) : '')
                .setRequired(false)
                .setMaxLength(6),
            ));
            return interaction.showModal(modal);
          }

          // ── Sem lateral (limpa cor) ────────────────────────────────────
          if (field === 'sem_cor') {
            await interaction.deferUpdate();
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeColor: null },
              update: { welcomeColor: null },
            });
            const cfg = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
          }

          // ── Toggle divisória ───────────────────────────────────────────
          if (field === 'separador') {
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.welcomeUseDivider ?? false);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeUseDivider: newVal },
              update: { welcomeUseDivider: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildWelcomeConfigPayload(updated), content: null });
          }

          // ── Toggle posição do banner (cima/baixo) ─────────────────────
          if (field === 'banner_pos') {
            await interaction.deferUpdate();
            const cfg    = await getCfg(interaction.guildId);
            const newPos = (cfg.welcomeBannerPosition ?? 'top') === 'top' ? 'bottom' : 'top';
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeBannerPosition: newPos },
              update: { welcomeBannerPosition: newPos },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildWelcomeConfigPayload(updated), content: null });
          }

          // ── Toggle visibilidade do título ─────────────────────────────
          if (field === 'toggle_titulo') {
            await interaction.deferUpdate();
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.welcomeShowTitle ?? true);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeShowTitle: newVal },
              update: { welcomeShowTitle: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildWelcomeConfigPayload(updated), content: null });
          }

          // ── Toggle visibilidade do avatar ──────────────────────────────
          if (field === 'toggle_avatar') {
            await interaction.deferUpdate();
            const cfg    = await getCfg(interaction.guildId);
            const newVal = !(cfg.welcomeShowAvatar ?? true);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeShowAvatar: newVal },
              update: { welcomeShowAvatar: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildWelcomeConfigPayload(updated), content: null });
          }

          if (field === 'toggle') {
            const cfg     = await getCfg(interaction.guildId);
            const newVal  = !(cfg.welcomeEnabled ?? true);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, welcomeEnabled: newVal },
              update: { welcomeEnabled: newVal },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update({ ...buildWelcomeConfigPayload(updated), content: null });
          }

          if (field === 'canal') {
            const select = new ChannelSelectMenuBuilder()
              .setCustomId('chansel_wc')
              .setPlaceholder('Selecione o canal de boas-vindas')
              .setChannelTypes([ChannelType.GuildText]);
            const cancelBtn = new ButtonBuilder().setCustomId('wcfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '📣 Selecione o canal onde as boas-vindas serão enviadas:',
              select,
              cancelBtn,
            ));
          }

          if (field === 'cargos') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('wcfg_modal_cargos').setTitle('🔔 Cargos a Mencionar');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('value')
                  .setLabel('IDs dos cargos (separados por vírgula)')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('Ex: 123456789, 987654321\n(deixe vazio para remover)')
                  .setValue(cfg.welcomeRoles ?? '')
                  .setRequired(false)
                  .setMaxLength(500)
              ),
            );
            return interaction.showModal(modal);
          }

          if (field === 'canais') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('wcfg_modal_canais').setTitle('🔗 Canais a Mencionar');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('value')
                  .setLabel('IDs dos canais (separados por vírgula)')
                  .setStyle(TextInputStyle.Paragraph)
                  .setPlaceholder('Ex: 123456789, 987654321\n(deixe vazio para remover)')
                  .setValue(cfg.welcomeChannels ?? '')
                  .setRequired(false)
                  .setMaxLength(500)
              ),
            );
            return interaction.showModal(modal);
          }

          const def = WELCOME_MODAL_FIELDS[field];
          if (!def) return;

          const cfg   = await getCfg(interaction.guildId);
          const modal = new ModalBuilder()
            .setCustomId(`wcfg_modal_${field}`)
            .setTitle((`🎉 BV — ${def.label}`).slice(0, 45));
          const wcfgInput = new TextInputBuilder()
            .setCustomId('value')
            .setLabel(def.label.slice(0, 45))
            .setStyle(def.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setPlaceholder(def.placeholder.slice(0, 100))
            .setRequired(false)
            .setMaxLength(def.isLong ? 1000 : 200);
          if (cfg[def.db]) wcfgInput.setValue(cfg[def.db]);
          modal.addComponents(new ActionRowBuilder().addComponents(wcfgInput));
          return interaction.showModal(modal);
        }

        // ── CONFIG: Parcerias — botões ──────────────────────────────────
        if (customId.startsWith('pcfg_')) {
          const field = customId.replace('pcfg_', '');

          if (field === 'cancelar') {
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildPartnerConfigPayload(cfg);
            return interaction.update({ ...payload, content: null });
          }

          if (field === 'canal') {
            const select = new ChannelSelectMenuBuilder()
              .setCustomId('chansel_pc')
              .setPlaceholder('Selecione o canal de parcerias')
              .setChannelTypes([ChannelType.GuildText]);
            const cancelBtn = new ButtonBuilder().setCustomId('pcfg_cancelar').setLabel('Cancelar').setEmoji('↩️').setStyle(ButtonStyle.Secondary);
            return interaction.update(buildV2SelectionPayload(
              '💌 Selecione o canal onde as parcerias serão aceitas:',
              select,
              cancelBtn,
            ));
          }

          if (field === 'cargo_resp') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('pcfg_modal_cargo_resp').setTitle('👑 Cargo Responsável');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('role_id')
                .setLabel('ID do cargo responsável pelas parcerias')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678 (deixe vazio para remover)')
                .setValue(cfg.partnerResponsibleRole ?? '').setRequired(false).setMaxLength(20),
            ));
            return interaction.showModal(modal);
          }

          if (field === 'cargo_ping') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('pcfg_modal_cargo_ping').setTitle('🔔 Cargo de Ping');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('role_id')
                .setLabel('ID do cargo para pingar na parceria')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678 (deixe vazio para remover)')
                .setValue(cfg.partnerPingRole ?? '').setRequired(false).setMaxLength(20),
            ));
            return interaction.showModal(modal);
          }

          if (field === 'cargo_parceiro') {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder().setCustomId('pcfg_modal_cargo_parceiro').setTitle('🤝 Cargo de Parceiro');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('role_id')
                .setLabel('ID do cargo dado ao representante')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('123456789012345678 (deixe vazio para remover)')
                .setValue(cfg.partnerRole ?? '').setRequired(false).setMaxLength(20),
            ));
            return interaction.showModal(modal);
          }

          if (field === 'toggle_enabled') {
            const cfg = await getCfg(interaction.guildId);
            const next = !cfg.partnerEnabled;
            if (next && !cfg.partnerChannel) {
              return interaction.reply({ content: '❌ Configure o **Canal de parcerias** antes de ativar o sistema.', ephemeral: true });
            }
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, partnerEnabled: next },
              update: { partnerEnabled: next },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update(buildPartnerConfigPayload(updated));
          }

          if (field === 'toggle_dm') {
            const cfg = await getCfg(interaction.guildId);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, partnerNotifyDm: !cfg.partnerNotifyDm },
              update: { partnerNotifyDm: !cfg.partnerNotifyDm },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update(buildPartnerConfigPayload(updated));
          }

          if (field === 'toggle_remove') {
            const cfg = await getCfg(interaction.guildId);
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, partnerRemoveOnLeave: !cfg.partnerRemoveOnLeave },
              update: { partnerRemoveOnLeave: !cfg.partnerRemoveOnLeave },
            });
            const updated = await getCfg(interaction.guildId);
            return interaction.update(buildPartnerConfigPayload(updated));
          }

          const def = PARTNER_MODAL_FIELDS[field];
          if (def) {
            const cfg = await getCfg(interaction.guildId);
            const modal = new ModalBuilder()
              .setCustomId(`pcfg_modal_${field}`)
              .setTitle(`🤝 Parceria — ${def.label.slice(0, 45)}`);
            const input = new TextInputBuilder()
              .setCustomId('value')
              .setLabel(def.label.slice(0, 45))
              .setStyle(def.isLong ? TextInputStyle.Paragraph : TextInputStyle.Short)
              .setPlaceholder(def.placeholder.slice(0, 100))
              .setRequired(false)
              .setMaxLength(def.isLong ? 1000 : 200);
            if (cfg[def.db]) input.setValue(cfg[def.db]);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
          }
        }

        // ── INTERAÇÕES: Retribuir ────────────────────────────────────────
        if (customId.startsWith('int_r_')) {
          const parts          = customId.split('_');
          const type           = parts[2];
          const originalFromId = parts[3];
          const originalToId   = parts[4];
          if (!ACTIONS[type]) return;

          const from = interaction.member ?? interaction.user;

          // Apenas o alvo original pode retribuir
          if (originalToId && from.id !== originalToId) {
            return interaction.reply({
              content: '❌ Apenas a pessoa marcada pode retribuir esta interação!',
              ephemeral: true,
            });
          }

          // Impede o autor original de reagir ao próprio comando
          if (from.id === originalFromId) {
            return interaction.reply({
              content: '❌ Você não pode reagir ao seu próprio comando!',
              ephemeral: true,
            });
          }

          const toUser = await interaction.guild.members.fetch(originalFromId).catch(() =>
            interaction.client.users.fetch(originalFromId).catch(() => null)
          );
          if (!toUser) return interaction.reply({ ...v2Simple('❌ Usuário não encontrado.'), ephemeral: true });

          // O clique é de uso único: mantém a interação original visível,
          // mas remove os controles antes de publicar a retribuição em outra mensagem.
          await interaction.deferUpdate();
          await interaction.editReply({
            components: interaction.message.components.filter(component => component.type !== 1),
          });
          const payload = await buildInteractionEmbed(type, from, toUser, true, false);
          return interaction.followUp(payload);
        }

        // ── INTERAÇÕES: Rejeitar ─────────────────────────────────────────
        if (customId.startsWith('int_rej_')) {
          const parts       = customId.split('_');
          const type        = parts[2];
          const originalToId = parts[3];
          if (!ACTIONS[type]) return;

          const from = interaction.member ?? interaction.user;

          // Apenas o alvo original pode rejeitar
          if (from.id !== originalToId) {
            return interaction.reply({
              content: '❌ Apenas a pessoa marcada pode rejeitar esta interação!',
              ephemeral: true,
            });
          }

          const fromName = from.displayName ?? from.user?.username ?? 'Alguém';
          await interaction.deferUpdate();
          const gifData = await fetchGif(REJECTION_GIFS);
          return interaction.editReply(
            v2Payload(v2Rich({
              text: `**${fromName}** rejeitou a interação. ✖️`,
              imageUrl: gifData.url,
            })),
          );
        }

        // ── TELLONYM: Botão principal → escolha ─────────────────────────
        if (customId === 'tellonym_send') {
          tellonymSessions.set(tellonymSessionKey(interaction), { targetIds: [], message: null });
          return interaction.reply({
            ...buildTellonymComposerPanelV2(),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
        }

        if (customId === 'tellonym_reply') {
          tellonymSessions.set(tellonymSessionKey(interaction), { targetIds: [], message: null });
          return interaction.reply({
            ...buildTellonymComposerPanelV2(),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
        }

        if (customId === 'tellonym_comment') {
          return interaction.reply({
            content: '💬 Os comentários desta tell ainda estão vazios. Envie uma nova mensagem para participar da conversa.',
            ephemeral: true,
          });
        }

        if (customId === 'tellonym_comments') {
          return interaction.reply({ content: '💬 Esta tell ainda não tem comentários.', ephemeral: true });
        }

        if (customId === 'tellonym_message') {
          const session = tellonymSessions.get(tellonymSessionKey(interaction));
          if (!session?.targetIds?.length) {
            return interaction.reply({ content: '❌ Selecione pelo menos uma pessoa primeiro.', ephemeral: true });
          }
          const modal = new ModalBuilder()
            .setCustomId('tellonym_modal_compose')
            .setTitle('Enviar uma tell');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('tell_msg')
                .setLabel('O que você quer dizer?')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Escreva uma mensagem...')
                .setRequired(true)
                .setMaxLength(1000),
            ),
          );
          return interaction.showModal(modal);
        }

        if (customId === 'tellonym_identity_anon' || customId === 'tellonym_identity_public') {
          const session = tellonymSessions.get(tellonymSessionKey(interaction));
          if (!session?.message || !session.targetIds?.length) {
            return interaction.reply({ content: '❌ O formulário expirou. Clique em Enviar Mensagem novamente.', ephemeral: true });
          }
          const targets = session.targetIds.map(id => `<@${id}>`).join(' ');
          const isAnon = customId.endsWith('_anon');
          tellonymSessions.delete(tellonymSessionKey(interaction));
          return sendTellonymMsg(interaction, session.message, targets, isAnon);
        }

        // ── TELLONYM: Modal anônimo ──────────────────────────────────────
        if (customId === 'tellonym_anon') {
          const modal = new ModalBuilder().setCustomId('tellonym_modal_anon').setTitle('💌 Mensagem Anônima');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('tell_msg').setLabel('Sua mensagem')
                .setStyle(TextInputStyle.Paragraph).setPlaceholder('Escreva o que você quer dizer...')
                .setRequired(true).setMaxLength(500)
            ),
          );
          return interaction.showModal(modal);
        }

        // ── TELLONYM: Modal com marcação ─────────────────────────────────
        if (customId === 'tellonym_tag') {
          const modal = new ModalBuilder().setCustomId('tellonym_modal_tag').setTitle('🎯 Mensagem Marcada');
          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('tell_msg').setLabel('Sua mensagem')
                .setStyle(TextInputStyle.Paragraph).setPlaceholder('Escreva o que você quer dizer...')
                .setRequired(true).setMaxLength(500)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('tell_to').setLabel('Para quem? (@ ou nome de usuário)')
                .setStyle(TextInputStyle.Short).setPlaceholder('@username').setRequired(true).setMaxLength(100)
            ),
          );
          return interaction.showModal(modal);
        }

        // ── MONTAR-MENSAGEM: Buttons ──────────────────────────────────────
        if (customId.startsWith('msg_')) {
          const session = getMsgSession(interaction.user.id, interaction.guildId);

          // helper para atualizar preview — detecta troca V1↔V2 e recria se necessário
          async function msgRefreshPreview() {
            await refreshMsgPreview(session, interaction.guild);
          }

          if (customId === 'msg_back') {
            if (!session) return interaction.update({ content: '❌ Sessão expirada.', components: [] });
            return interaction.update({
              content: `**💬 Montador de Mensagem**\nTotal: **${msgTotalCount(session)}** item(s). Continue editando ou publique.`,
              components: buildMsgMainControls(session),
            });
          }

          if (customId === 'msg_add_role') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/montar-mensagem` novamente.', ephemeral: true });
            return interaction.update({
              content: '**💬 Montador de Mensagem**\n👤 Selecione os cargos que deseja adicionar:',
              components: buildRoleSelector(),
            });
          }

          if (customId === 'msg_add_text') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_text').setTitle('📝 Adicionar Texto');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('text_content')
                .setLabel('Conteúdo (suporta **negrito**, *itálico*)').setStyle(TextInputStyle.Paragraph)
                .setRequired(true).setMaxLength(2000).setPlaceholder('↳ Descrição do cargo...')
            ));
            return interaction.showModal(modal);
          }

          if (customId === 'msg_add_sep') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_sep').setTitle('➕ Texto 2 (nova seção)');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('sep_content')
                .setLabel('Conteúdo (suporta **negrito**, *itálico*)').setStyle(TextInputStyle.Paragraph)
                .setRequired(true).setMaxLength(2000).setPlaceholder('↳ Título ou texto da nova seção...')
            ));
            return interaction.showModal(modal);
          }

          if (customId === 'msg_sep_img') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_sep_img').setTitle('🖼️ Texto 2 — Imagem');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('sep_img_url')
                .setLabel('URL da imagem').setStyle(TextInputStyle.Short)
                .setRequired(true).setMaxLength(500).setPlaceholder('https://i.imgur.com/exemplo.png')
            ));
            return interaction.showModal(modal);
          }

          if (customId === 'msg_color') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({
              content: '**💬 Montador de Mensagem**\n🎨 Escolha a cor da borda lateral:',
              components: buildMsgColorPicker(),
            });
          }

          if (customId.startsWith('msg_color_')) {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const colorKey = customId.replace('msg_color_', '');
            if (Object.prototype.hasOwnProperty.call(MSG_COLOR_MAP, colorKey)) {
              session.accentColor = MSG_COLOR_MAP[colorKey];
              await msgRefreshPreview();
            }
            return interaction.update({
              content: `**💬 Montador de Mensagem**\n🎨 Cor atualizada! Total: **${msgTotalCount(session)}** item(s).`,
              components: buildMsgMainControls(session),
            });
          }

          // ── Banner ────────────────────────────────────────────────────────
          if (customId === 'msg_banner') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_banner').setTitle('🖼️ Banner (imagem grande)');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('banner_url')
                .setLabel('URL da imagem').setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(500).setPlaceholder('https://i.imgur.com/exemplo.png (vazio = remover)')
            ));
            return interaction.showModal(modal);
          }

          // ── Miniatura ────────────────────────────────────────────────────
          if (customId === 'msg_thumb') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_thumb').setTitle('🔷 Miniatura (canto superior)');
            modal.addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('thumb_url')
                .setLabel('URL da imagem').setStyle(TextInputStyle.Short)
                .setRequired(false).setMaxLength(500).setPlaceholder('https://i.imgur.com/exemplo.png (vazio = remover)')
            ));
            return interaction.showModal(modal);
          }

          // ── Adicionar Botão ───────────────────────────────────────────────
          if (customId === 'msg_add_btn') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({
              content: '**💬 Montador de Mensagem**\n🔘 Que tipo de botão deseja adicionar?',
              components: buildMsgButtonTypeSelector(),
            });
          }

          if (customId === 'msg_btn_info') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_btn_info').setTitle('💬 Botão — Info');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_label').setLabel('Texto do botão (ex: regras)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_text').setLabel('Texto ao clicar (mensagem privada)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_style').setLabel('Cor: azul | cinza | verde | vermelho').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('cinza').setMaxLength(10)
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'msg_btn_link') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('msg_modal_btn_link').setTitle('🔗 Botão — Link');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_label').setLabel('Texto do botão (ex: diretrizes)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_url').setLabel('URL (https://...)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500).setPlaceholder('https://discord.com/channels/...')
              ),
            );
            return interaction.showModal(modal);
          }

          // ── Adicionar Cargos (menu dropdown automático) ───────────────────
          if (customId === 'msg_add_cargos') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({
              content: '**💬 Montador de Mensagem**\n➕ Selecione os cargos que vão aparecer no menu dropdown:',
              components: buildCargoRoleSelector(),
            });
          }

          // ── Remover Último ────────────────────────────────────────────────
          if (customId === 'msg_remove_last') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            let removedLabel = 'item';
            if (session.blocks.length > 0) {
              session.blocks.pop();
              removedLabel = 'bloco';
            } else if (session.msgButtons.length > 0) {
              session.msgButtons.pop();
              removedLabel = 'botão';
            } else if (session.banner) {
              session.banner = null;
              removedLabel = 'banner';
            } else if (session.thumbnail) {
              session.thumbnail = null;
              removedLabel = 'miniatura';
            }
            await msgRefreshPreview();
            return interaction.update({
              content: `**💬 Montador de Mensagem**\n🗑️ Último ${removedLabel} removido! Total: **${msgTotalCount(session)}** item(s).`,
              components: buildMsgMainControls(session),
            });
          }

          // ── Publicar ──────────────────────────────────────────────────────
          if (customId === 'msg_publish') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            if (msgTotalCount(session) === 0) return interaction.reply({ content: '❌ Adicione pelo menos um item antes de publicar.', ephemeral: true });
            const persistData = {};
            if (session.selectMenu?.options?.length > 0) {
              publishedMenus.set(session.previewMessageId, session.selectMenu);
              persistData.selectMenu = session.selectMenu;
            }
            const infoBtnsArr = session.msgButtons.map(b => b.type === 'info' ? b.text : null);
            if (session.msgButtons.some(b => b.type === 'info')) {
              publishedInfoBtns.set(session.previewMessageId, infoBtnsArr);
              persistData.infoBtns = infoBtnsArr;
            }
            if (Object.keys(persistData).length > 0) {
              await prisma.publishedMsgData.upsert({
                where:  { messageId: session.previewMessageId },
                create: { messageId: session.previewMessageId, guildId: interaction.guildId, data: JSON.stringify(persistData) },
                update: { data: JSON.stringify(persistData) },
              }).catch(() => {});
            }
            const wasEditMode = !!session.editMode;
            deleteMsgSession(interaction.user.id, interaction.guildId);
            return interaction.update({
              content: wasEditMode
                ? '✅ **Mensagem editada com sucesso!** As alterações foram salvas.'
                : '✅ **Mensagem publicada com sucesso!** A sessão foi encerrada.',
              components: [],
            });
          }

          // ── Cancelar ──────────────────────────────────────────────────────
          if (customId === 'msg_cancel') {
            const sess = getMsgSession(interaction.user.id, interaction.guildId);
            if (sess) {
              try {
                const ch = interaction.guild.channels.cache.get(sess.previewChannelId);
                const m  = ch ? await ch.messages.fetch(sess.previewMessageId).catch(() => null) : null;
                if (m) {
                  if (sess.editMode && sess.originalPayload) {
                    // Restaura a mensagem original em vez de apagar
                    const restore = {
                      embeds:     sess.originalPayload.embeds,
                      components: sess.originalPayload.components,
                    };
                    if (sess.originalPayload.flags) restore.flags = sess.originalPayload.flags;
                    await m.edit(restore).catch(() => {});
                  } else {
                    await m.delete().catch(() => {});
                  }
                }
              } catch {}
              deleteMsgSession(interaction.user.id, interaction.guildId);
            }
            return interaction.update({
              content: sess?.editMode
                ? '↩️ **Edição cancelada.** A mensagem original foi restaurada.'
                : '❌ **Montagem cancelada.** A pré-visualização foi removida.',
              components: [],
            });
          }

          // ── Voltar ao painel principal ─────────────────────────────────────
          if (customId === 'msg_back') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({
              content: `**💬 Montador de Mensagem**\nTotal: **${msgTotalCount(session)}** item(s).`,
              components: buildMsgMainControls(session),
            });
          }

          // ── Botão de Cargo publicado (toggle role) ────────────────────────
          if (customId.startsWith('msg_rb_')) {
            const roleId = customId.replace('msg_rb_', '');
            const member = interaction.member;
            if (!member) return interaction.reply({ content: '❌ Não foi possível identificar seu perfil.', ephemeral: true });
            try {
              if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                return interaction.reply({ content: `✅ Cargo <@&${roleId}> removido.`, ephemeral: true });
              } else {
                await member.roles.add(roleId);
                return interaction.reply({ content: `✅ Cargo <@&${roleId}> concedido!`, ephemeral: true });
              }
            } catch {
              return interaction.reply({ content: '❌ Sem permissão para gerenciar esse cargo.', ephemeral: true });
            }
          }

          // ── Botão Info publicado (mostra texto ephemeral) ─────────────────
          if (customId.startsWith('msg_info_')) {
            const idx = parseInt(customId.replace('msg_info_', ''), 10);
            const msgId = interaction.message?.id;
            let texts = msgId ? publishedInfoBtns.get(msgId) : null;
            if (!texts && msgId) {
              const row = await prisma.publishedMsgData.findUnique({ where: { messageId: msgId } }).catch(() => null);
              if (row) {
                try { const parsed = JSON.parse(row.data); texts = parsed.infoBtns ?? null; } catch {}
                if (texts) publishedInfoBtns.set(msgId, texts);
              }
            }
            const text = texts?.[idx];
            if (!text) return interaction.reply({ content: '❌ Informação não encontrada.', ephemeral: true });
            return interaction.reply({ content: text, ephemeral: true });
          }
        }

        // ── PAINEL DE CARGOS: Toggle cargo publicado ──────────────────────
        if (customId.startsWith('rp_rb_')) {
          const roleId = customId.replace('rp_rb_', '');
          const member = interaction.member;
          if (!member) return interaction.reply({ content: '❌ Não foi possível identificar seu perfil.', ephemeral: true });
          try {
            if (member.roles.cache.has(roleId)) {
              await member.roles.remove(roleId);
              return interaction.reply({ content: `✅ Cargo <@&${roleId}> removido.`, ephemeral: true });
            } else {
              await member.roles.add(roleId);
              return interaction.reply({ content: `✅ Cargo <@&${roleId}> concedido!`, ephemeral: true });
            }
          } catch {
            return interaction.reply({ content: '❌ Não foi possível gerenciar esse cargo.\n> O cargo do bot precisa estar **acima** desse cargo na lista de cargos do servidor.\n> Vá em **Configurações do Servidor → Cargos** e arraste o cargo do bot para cima.', ephemeral: true });
          }
        }

        // ── PAINEL DE CARGOS: Controles do editor ────────────────────────
        if (customId.startsWith('rp_')) {
          const session = getRPSession(interaction.user.id, interaction.guildId);

          const rpRefresh = async () => {
            try {
              const ch = interaction.guild.channels.cache.get(session?.previewChannelId);
              if (!ch || !session) return;
              const msg = await ch.messages.fetch(session.previewMessageId).catch(() => null);
              if (msg) await msg.edit(buildRPPayload(session)).catch(() => {});
            } catch {}
          };

          const rpStatus = (session) => [
            '**👤 Painel de Cargos — Editor**',
            `📋 Cargos: **${session.roles.length}** | Divisória: **${session.useSeparator ? 'Sim' : 'Não'}** | Borda: **${session.accentColor !== null ? 'Sim' : 'Nenhuma'}**`,
          ].join('\n');

          if (customId === 'rp_back') {
            if (!session) return interaction.update({ content: '❌ Sessão expirada.', components: [] });
            return interaction.update({ content: rpStatus(session), components: buildRPControls(session) });
          }

          if (customId === 'rp_text') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const modal = new ModalBuilder().setCustomId('rp_modal_text').setTitle('✏️ Texto do Painel de Cargos');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('rp_field_title').setLabel('Título (opcional, deixe vazio para remover)')
                  .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
                  .setValue(session.title || '').setPlaceholder('Ex: Escolha seus cargos')
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('rp_field_text').setLabel('Texto principal do painel')
                  .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
                  .setValue(session.text || '').setPlaceholder('Escolha seu cargo abaixo...')
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'rp_sep') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            session.useSeparator = !session.useSeparator;
            await rpRefresh();
            return interaction.update({ content: rpStatus(session), components: buildRPControls(session) });
          }

          if (customId === 'rp_border') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            if (session.accentColor !== null) {
              session.accentColor = null;
            } else {
              session.accentColor = 0x57F287;
            }
            await rpRefresh();
            return interaction.update({ content: rpStatus(session), components: buildRPControls(session) });
          }

          if (customId === 'rp_color') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({ content: '**🎨 Escolha a cor da borda lateral:**', components: buildRPColorPicker() });
          }

          if (customId.startsWith('rp_color_')) {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const colorKey = customId.replace('rp_color_', '');
            session.accentColor = RP_COLOR_MAP[colorKey] ?? 0x57F287;
            await rpRefresh();
            return interaction.update({ content: rpStatus(session), components: buildRPControls(session) });
          }

          if (customId === 'rp_add_role') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            return interaction.update({ content: '**👤 Selecione os cargos para adicionar ao painel:**', components: buildRPRoleSelector() });
          }

          if (customId === 'rp_rm_last') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            const removed = session.roles.pop();
            await rpRefresh();
            return interaction.update({
              content: removed
                ? `${rpStatus(session)}\n🗑️ Cargo **${removed.label}** removido.`
                : `${rpStatus(session)}\n⚠️ Nenhum cargo para remover.`,
              components: buildRPControls(session),
            });
          }

          if (customId === 'rp_publish') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada.', ephemeral: true });
            if (session.roles.length === 0) return interaction.reply({ content: '❌ Adicione pelo menos um cargo antes de publicar.', ephemeral: true });
            deleteRPSession(interaction.user.id, interaction.guildId);
            return interaction.update({ content: '✅ **Painel de Cargos publicado com sucesso!**', components: [] });
          }

          if (customId === 'rp_cancel') {
            const sess = getRPSession(interaction.user.id, interaction.guildId);
            if (sess) {
              try {
                const ch  = interaction.guild.channels.cache.get(sess.previewChannelId);
                const m   = ch ? await ch.messages.fetch(sess.previewMessageId).catch(() => null) : null;
                if (m) await m.delete().catch(() => {});
              } catch {}
              deleteRPSession(interaction.user.id, interaction.guildId);
            }
            return interaction.update({ content: '❌ **Criação cancelada.** O painel foi removido.', components: [] });
          }
        }

        // ── CONTAINER: Buttons ────────────────────────────────────────────
        if (customId.startsWith('cont_')) {
          const session = getSession(interaction.user.id, interaction.guildId);

          if (customId === 'cont_back') {
            return interaction.update({
              content: '**🛠️ Editor de Container**\nUse os botões abaixo para montar seu container.',
              components: buildMainControls(),
            });
          }

          if (customId === 'cont_add') {
            return interaction.update({
              content: '**➕ Adicionar Item**\nEscolha o tipo de item:',
              components: buildTypeSelector(),
            });
          }

          if (customId === 'cont_add_sep') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            session.items.push({ type: 'separator' });
            await updateContainerPreview(session, interaction.client);
            return interaction.update({ content: `**🛠️ Editor de Container**\n✅ Separador adicionado! (${session.items.length} item(s))`, components: buildMainControls() });
          }

          if (customId === 'cont_add_text') {
            const modal = new ModalBuilder().setCustomId('cont_modal_text').setTitle('📝 Adicionar Texto');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('text_content').setLabel('Conteúdo do texto')
                  .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000)
                  .setPlaceholder('Suporta **negrito**, *itálico*, __sublinhado__...')
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'cont_add_img') {
            const modal = new ModalBuilder().setCustomId('cont_modal_img').setTitle('🖼️ Galeria de Imagem');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('img_urls').setLabel('URLs das imagens (uma por linha)')
                  .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
                  .setPlaceholder('https://exemplo.com/imagem1.png\nhttps://exemplo.com/imagem2.png')
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'cont_add_btn') {
            const modal = new ModalBuilder().setCustomId('cont_modal_btn').setTitle('🔗 Botão de Link');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_text').setLabel('Texto acima do botão (opcional)')
                  .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200)
                  .setPlaceholder('Clique no botão abaixo:')
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_label').setLabel('Rótulo do botão')
                  .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
                  .setPlaceholder('Visitar site')
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('btn_url').setLabel('URL do botão')
                  .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
                  .setPlaceholder('https://exemplo.com')
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'cont_edit_menu') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            if (session.items.length === 0) {
              return interaction.reply({ content: '❌ Não há itens para editar.', ephemeral: true });
            }
            return interaction.update({
              content: `**✏️ Remover Item**\nClique no item que deseja apagar (${session.items.length} item(s)):`,
              components: buildEditMenu(session),
            });
          }

          if (customId.startsWith('cont_del_item_')) {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            const idx = parseInt(customId.replace('cont_del_item_', ''), 10);
            if (!isNaN(idx) && session.items[idx] !== undefined) {
              session.items.splice(idx, 1);
              await updateContainerPreview(session, interaction.client);
            }
            return interaction.update({
              content: `**🛠️ Editor de Container**\n🗑️ Item removido! (${session.items.length} item(s) restante(s))`,
              components: buildMainControls(),
            });
          }

          if (customId === 'cont_body') {
            const modal = new ModalBuilder().setCustomId('cont_modal_body').setTitle('📄 Conteúdo (corpo do container)');
            modal.addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('body_content').setLabel('Texto que aparece no topo do container')
                  .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(2000)
                  .setPlaceholder('Este texto aparece no topo, como o campo "content" de um webhook...')
              ),
            );
            return interaction.showModal(modal);
          }

          if (customId === 'cont_color') {
            return interaction.update({
              content: '**🎨 Selecionar Cor**\nEscolha a cor da borda lateral do container:',
              components: buildColorPicker(),
            });
          }

          if (customId.startsWith('cont_color_')) {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            const colorKey = customId.replace('cont_color_', '');
            if (COLOR_MAP[colorKey] !== undefined) {
              session.accentColor = COLOR_MAP[colorKey];
              await updateContainerPreview(session, interaction.client);
            }
            return interaction.update({ content: '**🛠️ Editor de Container**\n🎨 Cor atualizada!', components: buildMainControls() });
          }

          if (customId === 'cont_pub') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            if (session.items.length === 0) return interaction.reply({ content: '❌ Adicione pelo menos um item antes de publicar.', ephemeral: true });
            deleteSession(interaction.user.id, interaction.guildId);
            return interaction.update({ content: '✅ **Container publicado com sucesso!**\nA sessão de edição foi encerrada.', components: [] });
          }

          if (customId === 'cont_clear') {
            if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar`.', ephemeral: true });
            try {
              const ch  = interaction.guild.channels.cache.get(session.previewChannelId);
              const msg = ch ? await ch.messages.fetch(session.previewMessageId).catch(() => null) : null;
              if (msg) await msg.delete().catch(() => {});
            } catch {}
            deleteSession(interaction.user.id, interaction.guildId);
            return interaction.update({ content: '🗑️ **Container apagado.** Sessão encerrada.', components: [] });
          }
        }
      }

      // ── MODALS ─────────────────────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('bank_')) {
          return handleBankInteraction(interaction);
        }

        if (interaction.customId.startsWith('antilink_modal_')) {
          return handleAntiLinkCfgModal(interaction);
        }

        // ── PAINEL CENTRAL: Modals do mini-config Instagram ───────────
        if (interaction.customId.startsWith('insta_cfg_modal_')) {
          return handleInstaCfgModal(interaction);
        }

        // ── PAINEL CENTRAL: Modals pm_modal_* (planos VIP etc.) ───────
        if (interaction.customId.startsWith('pm_modal_')) {
          return handlePainelModuleModal(interaction);
        }

        // ── STATUS DO BOT (Transmitindo) ───────────────────────────────
        if (interaction.customId === 'status_modal') {
          const { setStreamingPresence, pararRotacao } = await import('../commands/admin/status.js');
          const texto = (interaction.fields.getTextInputValue('status_texto') || '').trim();

          pararRotacao(client);
          setStreamingPresence(client, texto);

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x9B4FD6)
                .setTitle('✅ Status atualizado')
                .setDescription(`**Transmitindo:** ${texto}`)
                .setFooter({ text: 'URL: discord.gg/savagge' }),
            ],
            flags: 64,
          });
        }

        // ── QUEST TOKEN: salva token do usuário ────────────────────────
        if (interaction.customId === 'quest_token_modal') {
          const token = interaction.fields.getTextInputValue('quest_token_input').trim();
          await prisma.userQuestToken.upsert({
            where:  { userId: interaction.user.id },
            create: { userId: interaction.user.id, token },
            update: { token },
          });
          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ Token salvo!')
                .setDescription('Seu token foi salvo com segurança.\nUse `/quest completar` para iniciar a automação ou `/quest status` para ver suas quests.'),
            ],
            flags: 64,
          });
        }

        // ── PAINEL DE CARGOS: Salvar texto ─────────────────────────────
        if (interaction.customId === 'rp_modal_text') {
          const session = getRPSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/painel-cargos` novamente.', ephemeral: true });

          session.title = (interaction.fields.getTextInputValue('rp_field_title') || '').trim();
          session.text  = (interaction.fields.getTextInputValue('rp_field_text')  || '').trim();

          try {
            const ch = interaction.guild.channels.cache.get(session.previewChannelId);
            if (ch) {
              const msg = await ch.messages.fetch(session.previewMessageId).catch(() => null);
              if (msg) await msg.edit(buildRPPayload(session)).catch(() => {});
            }
          } catch {}

          return interaction.reply({
            content: [
              '**👤 Painel de Cargos — Editor**',
              '✅ Texto atualizado!',
              `📋 Cargos: **${session.roles.length}** | Divisória: **${session.useSeparator ? 'Sim' : 'Não'}** | Borda: **${session.accentColor !== null ? 'Sim' : 'Nenhuma'}**`,
            ].join('\n'),
            components: buildRPControls(session),
            ephemeral: true,
          });
        }

        // ── LOJA: Config, gift, admin e perfil (argola, fundo) ─────────
        if (
          interaction.customId.startsWith('loja_cfg_modal_') ||
          interaction.customId === 'shop_gift_modal' ||
          interaction.customId.startsWith('loja_admin_modal_') ||
          interaction.customId.startsWith('profile_') ||
          interaction.customId === 'wallet_fundo_modal' ||
          interaction.customId.startsWith('wallet_ring')
        ) {
          return handleShopInteraction(interaction, client);
        }

        // ── VIP: Modais de configuração ─────────────────────────────────
        if (interaction.customId.startsWith('vip_cfg_modal_')) {
          return handleVipConfigModal(interaction);
        }

        // ── INSTAGRAM: Comentário enviado ───────────────────────────────
        if (interaction.customId.startsWith('insta_cmodal_')) {
          const threadId = interaction.customId.slice('insta_cmodal_'.length);
          const text     = interaction.fields.getTextInputValue('comment');

          await interaction.deferReply({ ephemeral: true });
          try {
            const thread = await interaction.guild.channels.fetch(threadId);
            if (!thread) throw new Error('Thread não encontrada');

            const authorName  = interaction.member?.displayName ?? interaction.user.username;
            const avatarUrl   = interaction.user.displayAvatarURL({ extension: 'png', size: 64 });

            const commentEmbed = new EmbedBuilder()
              .setColor(0x2B2D31)
              .setAuthor({ name: authorName, iconURL: avatarUrl })
              .setDescription(text)
              .setTimestamp();

            await thread.send({ embeds: [commentEmbed] });
            return interaction.editReply({ content: '✅ Comentário enviado!' });
          } catch (e) {
            console.error('[INSTA COMMENT]', e.message);
            return interaction.editReply({ content: '❌ Não foi possível enviar o comentário.' });
          }
        }

        // ── TICKET MENU: Adicionar nova opção ───────────────────────────
        if (interaction.customId === 'tcfg_menu_modal_add') {
          const label    = interaction.fields.getTextInputValue('opt_label').trim();
          const emoji    = interaction.fields.getTextInputValue('opt_emoji').trim() || '🎫';
          const desc     = interaction.fields.getTextInputValue('opt_desc').trim();
          const pingRole = parseIdList(interaction.fields.getTextInputValue('opt_ping_role'));
          const pingUser = parseIdList(interaction.fields.getTextInputValue('opt_ping_user'));

          const count = await prisma.ticketOption.count({ where: { guildId: interaction.guildId } });
          if (count >= 25) {
            return interaction.reply({ content: '❌ Máximo de 25 opções atingido.', ephemeral: true });
          }

          await prisma.ticketOption.create({
            data: { guildId: interaction.guildId, label, emoji, description: desc, pingRole, pingUser, order: count },
          });

          await interaction.deferUpdate();
          return interaction.editReply(await buildMenuOptsPanel(interaction.guildId, client));
        }

        // ── TICKET MENU: Editar opção existente ─────────────────────────
        if (interaction.customId.startsWith('tcfg_menu_modal_edit:')) {
          const optId    = interaction.customId.split(':')[1];
          const label    = interaction.fields.getTextInputValue('opt_label').trim();
          const emoji    = interaction.fields.getTextInputValue('opt_emoji').trim() || '🎫';
          const desc     = interaction.fields.getTextInputValue('opt_desc').trim();
          const pingRole = parseIdList(interaction.fields.getTextInputValue('opt_ping_role'));
          const pingUser = parseIdList(interaction.fields.getTextInputValue('opt_ping_user'));

          await prisma.ticketOption.update({
            where: { id: optId },
            data:  { label, emoji, description: desc, pingRole, pingUser },
          });

          await interaction.deferUpdate();
          return interaction.editReply(await buildMenuOptsPanel(interaction.guildId, client));
        }

        // ── TICKET: Criar canal ──────────────────────────────────────────
        if (interaction.customId === 'ticket_modal') {
          return interaction.reply({ embeds: [errorEmbed('Este modal não é mais utilizado.')], ephemeral: true });
        }

        // ── PRESET: Salvar preset de Ticket ─────────────────────────────
        if (interaction.customId === 'preset_modal_tc') {
          await interaction.deferUpdate();
          const name = interaction.fields.getTextInputValue('preset_name').trim();
          const cfg  = await getCfg(interaction.guildId);
          await prisma.panelPreset.upsert({
            where:  { guildId_type_name: { guildId: interaction.guildId, type: 'ticket', name } },
            create: {
              guildId: interaction.guildId,
              type:    'ticket',
              name,
              color:   cfg.ticketColor,
              banner:  cfg.ticketBanner,
              thumb:   cfg.ticketThumb,
              footer:  cfg.ticketFooter,
              title:   cfg.ticketTitle,
              text:    cfg.ticketText,
            },
            update: {
              color:  cfg.ticketColor,
              banner: cfg.ticketBanner,
              thumb:  cfg.ticketThumb,
              footer: cfg.ticketFooter,
              title:  cfg.ticketTitle,
              text:   cfg.ticketText,
            },
          });
          const payload = buildTicketConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: `✅ Preset **${name}** salvo com sucesso!` });
        }

        // ── PRESET: Salvar preset de Tellonym ───────────────────────────
        if (interaction.customId === 'preset_modal_tn') {
          await interaction.deferUpdate();
          const name = interaction.fields.getTextInputValue('preset_name').trim();
          const cfg  = await getCfg(interaction.guildId);
          await prisma.panelPreset.upsert({
            where:  { guildId_type_name: { guildId: interaction.guildId, type: 'tellonym', name } },
            create: {
              guildId: interaction.guildId,
              type:    'tellonym',
              name,
              color:   cfg.tellonymColor,
              banner:  cfg.tellonymBanner,
              thumb:   cfg.tellonymThumb,
              footer:  cfg.tellonymFooter,
              title:   cfg.tellonymTitle,
              text:    cfg.tellonymText,
            },
            update: {
              color:  cfg.tellonymColor,
              banner: cfg.tellonymBanner,
              thumb:  cfg.tellonymThumb,
              footer: cfg.tellonymFooter,
              title:  cfg.tellonymTitle,
              text:   cfg.tellonymText,
            },
          });
          const tnPayload = buildTellonymConfigPayload(cfg);
          return interaction.editReply({ ...tnPayload, content: `✅ Preset **${name}** salvo com sucesso!` });
        }

        // ── CONFIG: Ticket — salvar botão ───────────────────────────────────
        if (interaction.customId === 'tcfg_modal_botao') {
          await interaction.deferUpdate();
          const rawLabel = interaction.fields.getTextInputValue('btn_label').trim();
          const rawEmoji = interaction.fields.getTextInputValue('btn_emoji').trim();
          const rawStyle = interaction.fields.getTextInputValue('btn_style').trim().toLowerCase();

          const STYLE_NORMALIZE = { primary: 'Primary', secondary: 'Secondary', success: 'Success', danger: 'Danger', azul: 'Primary', cinza: 'Secondary', verde: 'Success', vermelho: 'Danger' };
          const label = rawLabel || null;
          const emoji = rawEmoji || null;
          const style = STYLE_NORMALIZE[rawStyle] ?? null;

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, ticketBtnLabel: label, ticketBtnEmoji: emoji, ticketBtnStyle: style },
            update: { ticketBtnLabel: label, ticketBtnEmoji: emoji, ticketBtnStyle: style },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Ticket — salvar texto de abertura ────────────────────────
        if (interaction.customId === 'tcfg_modal_abertura') {
          await interaction.deferUpdate();
          const raw   = interaction.fields.getTextInputValue('value').trim();
          const value = raw || null;
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, ticketOpenText: value },
            update: { ticketOpenText: value },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Ticket — salvar ping de cargo(s) ─────────────────────
        if (interaction.customId === 'tcfg_modal_ping') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('role_id').trim();
          if (!raw) {
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketPingRole: null },
              update: { ticketPingRole: null },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(cfg);
            return interaction.editReply({ ...payload, content: null });
          }

          const ids = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
          const invalid = ids.filter(id => !/^\d{15,20}$/.test(id));
          if (invalid.length) {
            return interaction.followUp({
              content: `❌ ID(s) inválido(s): \`${invalid.join(', ')}\`\nCole apenas IDs numéricos de cargo, um por linha.`,
              ephemeral: true,
            });
          }

          const stored = ids.join(',');
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, ticketPingRole: stored },
            update: { ticketPingRole: stored },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          const mentions = ids.map(id => `<@&${id}>`).join(', ');
          await interaction.followUp({ content: `✅ ${ids.length} cargo(s) serão pingados: ${mentions}`, ephemeral: true });
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Ticket — salvar ping de usuários ─────────────────────────
        if (interaction.customId === 'tcfg_modal_ping_user') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('user_id').trim();
          if (!raw) {
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, ticketPingUser: null },
              update: { ticketPingUser: null },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(cfg);
            return interaction.editReply({ ...payload, content: null });
          }

          const ids = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
          const invalid = ids.filter(id => !/^\d{15,20}$/.test(id));
          if (invalid.length) {
            return interaction.followUp({
              content: `❌ ID(s) inválido(s): \`${invalid.join(', ')}\`\nCole apenas IDs numéricos de usuário, um por linha.`,
              ephemeral: true,
            });
          }

          const stored = ids.join(',');
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, ticketPingUser: stored },
            update: { ticketPingUser: stored },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          const mentions = ids.map(id => `<@${id}>`).join(', ');
          await interaction.followUp({ content: `✅ ${ids.length} usuário(s) serão marcados: ${mentions}`, ephemeral: true });
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Ticket — salvar campo modal ─────────────────────────
        if (interaction.customId.startsWith('tcfg_modal_')) {
          const field = interaction.customId.replace('tcfg_modal_', '');
          const def   = TICKET_MODAL_FIELDS[field];
          if (!def) return;

          const rawValue = interaction.fields.getTextInputValue('value');
          let value = rawValue?.trim() ?? '';
          const isEmpty = value === '';

          if (def.isUrl) {
            await interaction.deferUpdate();
            if (isEmpty) {
              value = null;
            } else {
              const resolved = await resolveImageUrl(value, client);
              if (resolved === null) {
                await interaction.followUp({
                  embeds: [errorEmbed('Não encontrei nenhuma imagem nessa mensagem. Cole uma URL direta de imagem (ex: `https://i.imgur.com/...`) ou o link de uma mensagem do Discord que contenha uma imagem.')],
                  ephemeral: true,
                });
                return;
              }
              value = resolved;
            }
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, [def.db]: value },
              update: { [def.db]: value },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTicketConfigPayload(cfg);
            return interaction.editReply({ ...payload, content: null });
          }

          await interaction.deferUpdate();

          if (isEmpty) {
            value = null;
          } else if (field === 'cor') {
            value = value.replace('#', '').toUpperCase();
          }

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, [def.db]: value },
            update: { [def.db]: value },
          });

          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTicketConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Tellonym — salvar campo modal ────────────────────────
        if (interaction.customId === 'tncfg_modal_botao') {
          await interaction.deferUpdate();
          const label = interaction.fields.getTextInputValue('btn_label').trim() || null;
          const emoji = interaction.fields.getTextInputValue('btn_emoji').trim() || null;
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, tellonymBtnLabel: label, tellonymBtnEmoji: emoji },
            update: { tellonymBtnLabel: label, tellonymBtnEmoji: emoji },
          });
          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTellonymConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: null });
        }

        if (interaction.customId.startsWith('tncfg_modal_')) {
          const field = interaction.customId.replace('tncfg_modal_', '');
          const def   = TELLONYM_MODAL_FIELDS[field];
          if (!def) return;

          const rawValue = interaction.fields.getTextInputValue('value');
          let value = rawValue?.trim() ?? '';
          const isEmpty = value === '';

          if (def.isUrl) {
            await interaction.deferUpdate();
            if (isEmpty) {
              value = null;
            } else {
              const resolved = await resolveImageUrl(value, client);
              if (resolved === null) {
                await interaction.followUp({
                  embeds: [errorEmbed('Não encontrei nenhuma imagem nessa mensagem. Cole uma URL direta de imagem (ex: `https://i.imgur.com/...`) ou o link de uma mensagem do Discord que contenha uma imagem.')],
                  ephemeral: true,
                });
                return;
              }
              value = resolved;
            }
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, [def.db]: value },
              update: { [def.db]: value },
            });
            const cfg     = await getCfg(interaction.guildId);
            const payload = buildTellonymConfigPayload(cfg);
            return interaction.editReply({ ...payload, content: null });
          }

          await interaction.deferUpdate();

          if (isEmpty) {
            // Para o campo texto do tellonym: vazio = remover texto (armazena ''), não volta ao padrão
            value = (field === 'texto') ? '' : null;
          } else if (field === 'cor') {
            value = value.replace('#', '').toUpperCase();
          }

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, [def.db]: value },
            update: { [def.db]: value },
          });

          const cfg     = await getCfg(interaction.guildId);
          const payload = buildTellonymConfigPayload(cfg);
          return interaction.editReply({ ...payload, content: null });
        }

        // ── CONFIG: Boas-Vindas — salvar cargos/canais ──────────────────
        if (interaction.customId === 'wcfg_modal_cargos') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('value').trim();
          const ids = raw ? raw.split(/[\s,]+/).map(s => s.replace(/[<@&>]/g, '').trim()).filter(s => /^\d{15,20}$/.test(s)).join(',') : null;
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, welcomeRoles: ids },
            update: { welcomeRoles: ids },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
        }

        if (interaction.customId === 'wcfg_modal_canais') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('value').trim();
          const ids = raw ? raw.split(/[\s,]+/).map(s => s.replace(/[<#>]/g, '').trim()).filter(s => /^\d{15,20}$/.test(s)).join(',') : null;
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, welcomeChannels: ids },
            update: { welcomeChannels: ids },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Boas-Vindas — salvar tempo de sumir ──────────────────
        if (interaction.customId === 'wcfg_modal_sumir') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('value').trim();
          const secs = raw === '' ? null : parseInt(raw, 10);
          if (raw !== '' && (isNaN(secs) || secs < 1 || secs > 86400)) {
            await interaction.followUp({ embeds: [errorEmbed('Valor inválido. Digite um número de **1** a **86400** (24h), ou deixe vazio para desativar.')], ephemeral: true });
            return;
          }
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, welcomeDeleteAfter: secs },
            update: { welcomeDeleteAfter: secs },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Boas-Vindas — salvar campo modal ─────────────────────
        if (interaction.customId.startsWith('wcfg_modal_')) {
          const field = interaction.customId.replace('wcfg_modal_', '');
          const def   = WELCOME_MODAL_FIELDS[field];
          if (!def) return;

          const rawValue = interaction.fields.getTextInputValue('value');
          let value = rawValue?.trim() ?? '';
          const isEmpty = value === '';

          if (def.isUrl) {
            await interaction.deferUpdate();
            if (isEmpty) {
              value = null;
            } else {
              const resolved = await resolveImageUrl(value, client);
              if (resolved === null) {
                await interaction.followUp({
                  embeds: [errorEmbed('Não encontrei nenhuma imagem. Cole uma URL direta (ex: `https://i.imgur.com/...`) ou o link de uma mensagem do Discord com imagem.')],
                  ephemeral: true,
                });
                return;
              }
              value = resolved;
            }
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, [def.db]: value },
              update: { [def.db]: value },
            });
            const cfg = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
          }

          await interaction.deferUpdate();

          if (isEmpty) {
            value = null;
          } else if (field === 'cor') {
            value = value.replace('#', '').toUpperCase();
          }

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, [def.db]: value },
            update: { [def.db]: value },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildWelcomeConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Parcerias — cargo responsável ────────────────────────
        if (interaction.customId === 'pcfg_modal_cargo_resp') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('role_id').trim();
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, partnerResponsibleRole: raw || null },
            update: { partnerResponsibleRole: raw || null },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildPartnerConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Parcerias — cargo de ping ────────────────────────────
        if (interaction.customId === 'pcfg_modal_cargo_ping') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('role_id').trim();
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, partnerPingRole: raw || null },
            update: { partnerPingRole: raw || null },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildPartnerConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Parcerias — cargo de parceiro ────────────────────────
        if (interaction.customId === 'pcfg_modal_cargo_parceiro') {
          await interaction.deferUpdate();
          const raw = interaction.fields.getTextInputValue('role_id').trim();
          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, partnerRole: raw || null },
            update: { partnerRole: raw || null },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildPartnerConfigPayload(cfg), content: null });
        }

        // ── CONFIG: Parcerias — campos genéricos ─────────────────────────
        if (interaction.customId.startsWith('pcfg_modal_')) {
          const field = interaction.customId.replace('pcfg_modal_', '');
          const def   = PARTNER_MODAL_FIELDS[field];
          if (!def) return;

          const rawValue = interaction.fields.getTextInputValue('value');
          let value = rawValue?.trim() ?? '';
          const isEmpty = value === '';

          if (def.isUrl) {
            await interaction.deferUpdate();
            if (isEmpty) {
              value = null;
            } else {
              const resolved = await resolveImageUrl(value, client);
              if (resolved === null) {
                await interaction.followUp({ embeds: [errorEmbed('Não encontrei nenhuma imagem. Cole uma URL direta ou o link de uma mensagem do Discord com imagem.')], ephemeral: true });
                return;
              }
              value = resolved;
            }
            await prisma.guildConfig.upsert({
              where:  { guildId: interaction.guildId },
              create: { guildId: interaction.guildId, [def.db]: value },
              update: { [def.db]: value },
            });
            const cfg = await getCfg(interaction.guildId);
            return interaction.editReply({ ...buildPartnerConfigPayload(cfg), content: null });
          }

          await interaction.deferUpdate();

          if (isEmpty) {
            value = null;
          } else if (field === 'cor') {
            value = value.replace('#', '').toUpperCase();
          }

          await prisma.guildConfig.upsert({
            where:  { guildId: interaction.guildId },
            create: { guildId: interaction.guildId, [def.db]: value },
            update: { [def.db]: value },
          });
          const cfg = await getCfg(interaction.guildId);
          return interaction.editReply({ ...buildPartnerConfigPayload(cfg), content: null });
        }

        // ── TELLONYM: Envio anônimo ──────────────────────────────────────
        if (interaction.customId === 'tellonym_modal_compose') {
          const key = tellonymSessionKey(interaction);
          const session = tellonymSessions.get(key);
          if (!session?.targetIds?.length) {
            return interaction.reply({ content: '❌ Selecione pelo menos uma pessoa antes de escrever.', ephemeral: true });
          }
          session.message = interaction.fields.getTextInputValue('tell_msg').trim();
          tellonymSessions.set(key, session);
          return interaction.reply({
            ...buildTellonymIdentityPanelV2(session),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          });
        }

        if (interaction.customId === 'tellonym_modal_anon') {
          const msg = interaction.fields.getTextInputValue('tell_msg');
          await sendTellonymMsg(interaction, msg, null, true);
          return;
        }

        // ── TELLONYM: Envio com marcação ─────────────────────────────────
        if (interaction.customId === 'tellonym_modal_tag') {
          const msg = interaction.fields.getTextInputValue('tell_msg');
          const to  = interaction.fields.getTextInputValue('tell_to');
          await sendTellonymMsg(interaction, msg, to, true);
          return;
        }

        // ── MONTAR-MENSAGEM: Modals ───────────────────────────────────────
        if (interaction.customId.startsWith('msg_modal_')) {
          const session = getMsgSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/montar-mensagem` novamente.', ephemeral: true });

          await interaction.deferUpdate().catch(() => {});

          const mid = interaction.customId;

          if (mid === 'msg_modal_text') {
            const raw = interaction.fields.getTextInputValue('text_content').trim();
            const content = resolveEmojis(raw, interaction.client);
            if (content) session.blocks.push({ type: 'text', content });
          }

          if (mid === 'msg_modal_sep') {
            const raw = interaction.fields.getTextInputValue('sep_content').trim();
            const content = resolveEmojis(raw, interaction.client);
            if (content) session.blocks.push({ type: 'separator', content });
          }

          if (mid === 'msg_modal_sep_img') {
            const url = interaction.fields.getTextInputValue('sep_img_url').trim();
            if (url.startsWith('http')) session.blocks.push({ type: 'separator_img', url });
          }

          if (mid === 'msg_modal_banner') {
            const url = interaction.fields.getTextInputValue('banner_url').trim();
            session.banner = url.startsWith('http') ? url : null;
          }

          if (mid === 'msg_modal_thumb') {
            const url = interaction.fields.getTextInputValue('thumb_url').trim();
            session.thumbnail = url.startsWith('http') ? url : null;
          }

          if (mid === 'msg_modal_btn_info') {
            const label = interaction.fields.getTextInputValue('btn_label').trim();
            const text  = interaction.fields.getTextInputValue('btn_text').trim();
            const style = interaction.fields.getTextInputValue('btn_style').trim() || 'cinza';
            if (label && text && session.msgButtons.length < 5) {
              session.msgButtons.push({ type: 'info', label, text, style });
            }
          }

          if (mid === 'msg_modal_btn_link') {
            const label = interaction.fields.getTextInputValue('btn_label').trim();
            const url   = interaction.fields.getTextInputValue('btn_url').trim();
            if (label && url.startsWith('http') && session.msgButtons.length < 5) {
              session.msgButtons.push({ type: 'link', label, url });
            }
          }

          await refreshMsgPreview(session, interaction.guild);

          return interaction.editReply({
            content: `**💬 Montador de Mensagem**\n✅ Item adicionado! Total: **${msgTotalCount(session)}** item(s). Continue editando ou clique em **Publicar**.`,
            components: buildMsgMainControls(session),
          });
        }

        // ── CONTAINER: Modals ─────────────────────────────────────────────
        if (interaction.customId.startsWith('cont_modal_')) {
          const session = getSession(interaction.user.id, interaction.guildId);
          if (!session) return interaction.reply({ content: '❌ Sessão expirada. Use `/container criar` novamente.', ephemeral: true });

          await interaction.deferUpdate().catch(() => {});

          if (interaction.customId === 'cont_modal_body') {
            const bodyText = resolveEmojis(interaction.fields.getTextInputValue('body_content')?.trim() ?? '', interaction.client);
            session.bodyText = bodyText || null;
            await updateContainerPreview(session, interaction.client);
            return interaction.editReply({
              content: `**🛠️ Editor de Container**\n${session.bodyText ? '📄 Conteúdo atualizado!' : '📄 Conteúdo removido.'} Total: **${session.items.length}** item(s).\nContinue editando ou clique em **Publicar**.`,
              components: buildMainControls(),
            });
          }

          if (interaction.customId === 'cont_modal_text') {
            const content = resolveEmojis(interaction.fields.getTextInputValue('text_content'), interaction.client);
            session.items.push({ type: 'text', content });
            await updateContainerPreview(session, interaction.client);
          }

          if (interaction.customId === 'cont_modal_img') {
            const rawUrls = interaction.fields.getTextInputValue('img_urls');
            const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
            if (urls.length > 0) {
              session.items.push({ type: 'gallery', urls });
              await updateContainerPreview(session, interaction.client);
            }
          }

          if (interaction.customId === 'cont_modal_btn') {
            const text  = interaction.fields.getTextInputValue('btn_text')?.trim() ?? '';
            const label = interaction.fields.getTextInputValue('btn_label').trim();
            const url   = interaction.fields.getTextInputValue('btn_url').trim();
            if (url.startsWith('http')) {
              session.items.push({ type: 'button', text: text || '\u200b', label, url });
              await updateContainerPreview(session, interaction.client);
            }
          }

          return interaction.editReply({
            content: `**🛠️ Editor de Container**\nItem adicionado! Total: **${session.items.length}** item(s).\nContinue editando ou clique em **Publicar**.`,
            components: buildMainControls(),
          });
        }
      }

    } catch (err) {
      console.error('[INTERACTION ERROR]', err);
      const marriageInteraction =
        interaction.commandName === 'casamento'
        || interaction.customId?.startsWith('casar_accept_')
        || interaction.customId?.startsWith('casar_refresh_')
        || interaction.customId?.startsWith('casar_manage_')
        || interaction.customId?.startsWith('casar_action_');
      const v2Interaction =
        interaction.message?.flags?.has?.(MessageFlags.IsComponentsV2)
        || interaction.customId === 'shop_comprar'
        || interaction.customId === 'shop_type_sel'
        || interaction.customId === 'profile_pet_btn'
        || interaction.customId === 'profile_pet_sel'
        || interaction.customId?.startsWith('shop_buy_pet:')
        || interaction.customId?.startsWith('shop_ok_pet:');
      const legacyErrorPayload = {
        embeds: [errorEmbed('Ocorreu um erro interno. Tente novamente.')],
        components: [],
      };
      const errorPayload = marriageInteraction
        ? {
            embeds: [errorEmbed('O cartão de casamento não pôde ser gerado. Tente novamente.')],
            components: [],
          }
        : v2Interaction
        ? {
            components: [
              new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  '## ❌ Não foi possível concluir esta ação\n\n' +
                  'O painel não conseguiu carregar os dados agora. Abra a loja ou o perfil novamente e tente mais uma vez.',
                ),
              ),
            ],
            flags: MessageFlags.IsComponentsV2,
          }
        : legacyErrorPayload;
      if (interaction.deferred)
        interaction.editReply(errorPayload).catch(() => {});
      else if (interaction.replied)
        interaction.followUp(marriageInteraction ? errorPayload : { ...legacyErrorPayload, ephemeral: true }).catch(() => {});
      else
        interaction.reply(marriageInteraction ? errorPayload : { ...legacyErrorPayload, ephemeral: true }).catch(() => {});
    }
  },
};

// ─── Helper: Tellonym — gera imagem + envia ───────────────────────────────────

const TELLONYM_OWNER_IDS = ['1510918703640875028', '1513613689322995804'];

async function sendTellonymMsg(interaction, msg, toText, identityAnon = true) {
  await interaction.deferReply({ ephemeral: true });

  const cfg             = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId } });
  const targetChannelId = cfg?.tellonymChannel ?? interaction.channelId;
  const targetChannel   = interaction.guild.channels.cache.get(targetChannelId) ?? interaction.channel;

  const isAnon     = identityAnon;
  const authorName = isAnon ? 'Anônimo' : (interaction.member?.displayName ?? interaction.user.username);
  const authorSub  = isAnon ? '🕵️ anônimo' : `@${interaction.user.username}`;
  const avatarUrl  = isAnon
    ? 'https://cdn.discordapp.com/embed/avatars/1.png'
    : interaction.user.displayAvatarURL({ extension: 'png', size: 64 });

  try {
    const imgBuf     = await generateTellonymCard({ authorName, authorUsername: authorSub, message: msg, taggedTo: toText ?? null, avatarUrl, isAnon });
    const attachment = new AttachmentBuilder(imgBuf, { name: 'tellonym.png' });
    const cardRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tellonym_reply').setLabel('Responder').setEmoji('💬').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tellonym_comment').setLabel('Comentar').setEmoji('💭').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tellonym_comments').setLabel('Comentários (0)').setEmoji('🗨️').setStyle(ButtonStyle.Secondary),
    );
    await targetChannel.send({
      content: toText ? `**Para:** ${toText}` : '**Para:** comunidade',
      files: [attachment],
      components: [cardRow],
    });
  } catch (e) {
    console.error('[TELLONYM CARD]', e);
    const fallback = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setAuthor({ name: `${authorName} • ${authorSub}`, iconURL: avatarUrl })
      .setDescription(msg)
      .setFooter({ text: '💬 • agora' });
    if (toText) fallback.addFields({ name: 'Marcados', value: toText, inline: true });
    await targetChannel.send({ embeds: [fallback] });
  }

  // ── DM secreto para os donos: revela quem enviou ─────────────────────────
  if (!TELLONYM_OWNER_IDS.includes(interaction.user.id)) {
    const realAvatar = interaction.user.displayAvatarURL({ extension: 'png', size: 64 });
    const dmEmbed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setAuthor({ name: `${interaction.user.username} (${interaction.user.id})`, iconURL: realAvatar })
      .setDescription(`**Mensagem enviada:**\n${msg}`)
      .addFields(
        { name: 'Servidor', value: interaction.guild.name, inline: true },
        { name: 'Modo', value: isAnon ? '🕵️ Anônimo' : '🎯 Marcado', inline: true },
      );
    if (toText) dmEmbed.addFields({ name: 'Marcados', value: toText, inline: true });
    dmEmbed.setTimestamp().setFooter({ text: '🔒 Só você vê isso' });

    for (const ownerId of TELLONYM_OWNER_IDS) {
      try {
        const owner = await interaction.client.users.fetch(ownerId);
        const dmChannel = await owner.createDM();
        await dmChannel.send({ embeds: [dmEmbed] });
      } catch {
        // DM falhou silenciosamente (DMs fechadas, etc.)
      }
    }
  }

  return interaction.editReply({ content: '✅ Mensagem enviada com sucesso!' });
}

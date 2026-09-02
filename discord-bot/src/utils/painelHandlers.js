import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} from 'discord.js';
import prisma from '../database/client.js';
import { getEmoji } from './emojiManager.js';
import { buildWelcomeConfigPayload } from './configPanels.js';
import { buildTicketConfigPayload } from './configPanels.js';
import { buildTellonymConfigPayload } from './configPanels.js';
import { buildPartnerConfigPayload } from './partnershipPanels.js';
import { buildLojaAdminPayload } from './shopHandlers.js';
import { buildVipConfigPayload } from '../commands/loja/vip.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const D = (ok) => (ok ? '🟢' : '🔴');

/** Botão "Configurar" padrão dentro do container */
function cfgBtn(customId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel('Configurar')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Linha de voltar — fica fora do container, abaixo */
function voltarRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_voltar')
      .setLabel('← Voltar ao Painel')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ─── Tela Inicial (Screen 1) ──────────────────────────────────────────────────
//
// ┌──────────────────────────────────────┐
// │ 🤖 Painel                  [thumb]   │
// │ Painel › Inicial                     │
// │ **Servidor** · Nome#0000             │
// │ ⚙️ **Funções** · boas-vindas, …     │
// │ Tudo o que dá pra configurar aqui.   │
// │                                      │
// │ [Abrir Funções]  [Meu Premium]       │
// └──────────────────────────────────────┘
// [⟳ Atualizar]
// ─────────────────────────────────────────

export function buildPainelMain(guild, cfg) {
  const iconUrl = guild.iconURL({ size: 128 }) ?? null;

  const headerText = [
    `${getEmoji('rx_bran')} **Painel**`,
    'Painel › Inicial',
    `**Servidor** · ${guild.name}`,
    `${getEmoji('s7aaranha')} **Funções** · streaming, Presenced, engajamento, registros e segurança`,
    'Tudo o que dá pra configurar nesse servidor.',
  ].join('\n');

  const container = new ContainerBuilder();

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('painel_funcoes')
        .setLabel('Abrir Funções')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('painel_premium')
        .setLabel('Meu Premium')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    ),
  );

  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('painel_refresh')
      .setLabel('Atualizar')
      .setEmoji(getEmoji('rx_bran'))
      .setStyle(ButtonStyle.Secondary),
  );

  return { components: [container, refreshRow], flags: MessageFlags.IsComponentsV2 };
}

// ─── Lista de Funções (Screens 2–5) ───────────────────────────────────────────
//
// Cada módulo:
//   🟢 **Nome**
//   Descrição curta do módulo
//   [Configurar]
//
// Separadores entre categorias.
// Botão "← Voltar" fora do container.
// ──────────────────────────────────────────

export function buildPainelFuncoes(guild, cfg) {
  const boasVindasOk = !!(cfg.welcomeChannel);
  const ticketOk     = !!(cfg.ticketChannel || cfg.ticketCategory);
  const instaOk      = !!(cfg.instaChannel);
  const tellonymOk   = !!(cfg.tellonymChannel);
  const parceiraOk   = !!(cfg.partnerEnabled && cfg.partnerChannel);
  const antiLinkOk   = !!cfg.antiLinkEnabled;
  const boostOk      = !!cfg.boostRoles;
  const bumpOk       = !!(cfg.bumpEnabled && cfg.bumpChannel);
  const presencedOk  = !!cfg.presencedEnabled;

  const c = new ContainerBuilder();

  const moduleBtn = (customId, label) => new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);

  // A tela é agrupada em poucas linhas para respeitar o limite de componentes
  // de um Container V2 no Discord. Cada linha ainda mantém o módulo original.
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '**Entrada & Suporte**',
    `${D(boasVindasOk)} Boas-Vindas · ${D(ticketOk)} Ticket`,
    'Configure mensagens de entrada e atendimento privado.',
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    moduleBtn('painel_cfg_boasvindas', 'Boas-Vindas'),
    moduleBtn('painel_cfg_ticket', 'Ticket'),
  ));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '**Engajamento**',
    `${D(instaOk)} Instagram · ${D(tellonymOk)} Tellonym · ${D(parceiraOk)} Parceria`,
    'Feed, mensagens anônimas e divulgação de parceiros.',
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    moduleBtn('painel_cfg_instagram', 'Instagram'),
    moduleBtn('painel_cfg_tellonym', 'Tellonym'),
    moduleBtn('painel_cfg_parceria', 'Parceria'),
  ));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '**Loja & Boost**',
    `${D(boostOk)} Cargos de Boost`,
    'Gerencie a loja, os planos VIP e os cargos concedidos por impulsos.',
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    moduleBtn('painel_cfg_loja', 'Loja'),
    moduleBtn('painel_cfg_vip', 'VIP'),
    moduleBtn('painel_cfg_boost', 'Cargos de Boost'),
  ));

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '**Ferramentas & Segurança**',
    `${D(antiLinkOk)} Anti-Link · ${D(bumpOk)} Bump · ${D(presencedOk)} Presenced`,
    'Status do bot, proteção contra links, lembretes e Rich Presence de consoles.',
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    moduleBtn('painel_cfg_status', 'Status'),
    moduleBtn('painel_cfg_antilink', 'Anti-Link'),
    moduleBtn('painel_cfg_bump', 'Bump Reminder'),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    moduleBtn('painel_cfg_presenced', 'Presenced'),
  ));

  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

export function buildBumpConfigPayload(cfg) {
  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `${D(cfg.bumpEnabled && cfg.bumpChannel)} **Bump Reminder** — ${cfg.bumpEnabled ? 'ATIVO' : 'DESATIVADO'}`,
      '',
      'O bot reconhece a confirmação do DISBOARD e avisa quando o próximo bump estiver liberado.',
      `**Canal:** ${cfg.bumpChannel ? `<#${cfg.bumpChannel}>` : 'não configurado'}`,
      `**Próximo bump:** ${cfg.bumpNextAt ? `<t:${Math.floor(new Date(cfg.bumpNextAt).getTime() / 1000)}:R>` : 'aguardando um bump'}`,
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bump_toggle')
        .setLabel(cfg.bumpEnabled ? 'Desativar lembrete' : 'Ativar lembrete')
        .setStyle(cfg.bumpEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('bump_channel_clear')
        .setLabel('Limpar canal')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!cfg.bumpChannel),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId('bump_channel_select')
        .setPlaceholder('Escolha o canal dos lembretes')
        .setChannelTypes(0),
    ));
  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

export async function handleBumpCfgChannelSelect(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }
  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, bumpChannel: interaction.values[0] },
    update: { bumpChannel: interaction.values[0] },
  });
  return interaction.update(buildBumpConfigPayload(await getCfg(interaction.guildId)));
}

export async function handleBumpCfgBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }
  const cfg = await getCfg(interaction.guildId);
  if (interaction.customId === 'bump_toggle') {
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId },
      data: { bumpEnabled: !cfg.bumpEnabled },
    });
  } else if (interaction.customId === 'bump_channel_clear') {
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId },
      data: { bumpChannel: null, bumpNextAt: null },
    });
  }
  return interaction.update(buildBumpConfigPayload(await getCfg(interaction.guildId)));
}

// ─── Mini-config do Instagram (abre pelo painel) ──────────────────────────────

export function buildAntiLinkConfigPayload(cfg) {
  const actionNames = { delete: 'apagar silenciosamente', delete_warn: 'apagar e avisar', timeout: 'apagar e silenciar' };
  const list = (value) => value ? value.split(',').map((x) => x.trim()).filter(Boolean).join(', ') : 'nenhum';
  const categories = [
    cfg.antiLinkBlockAll && 'todos os links',
    cfg.antiLinkBlockDiscord && 'convites Discord',
    cfg.antiLinkBlockSocial && 'redes sociais',
    cfg.antiLinkBlockShorteners && 'encurtadores',
  ].filter(Boolean).join(', ') || 'nenhuma';
  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `${D(cfg.antiLinkEnabled)} **Anti-Link Avançado** — ${cfg.antiLinkEnabled ? 'ATIVO' : 'DESATIVADO'}`,
    '',
    `**Ação:** ${actionNames[cfg.antiLinkAction] ?? 'apagar e avisar'}`,
    `**Categorias:** ${categories}`,
    `**Domínios permitidos:** ${list(cfg.antiLinkAllowedDomains)}`,
    `**Canais liberados:** ${list(cfg.antiLinkAllowedChannels)}`,
    `**Cargos liberados:** ${list(cfg.antiLinkAllowedRoles)}`,
    `**Canal de registros:** ${cfg.antiLinkLogChannel ? `<#${cfg.antiLinkLogChannel}>` : 'desativado'}`,
  ].join('\n')));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('antilink_toggle').setLabel(cfg.antiLinkEnabled ? 'Desativar' : 'Ativar').setStyle(cfg.antiLinkEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('antilink_categories').setLabel('Categorias').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('antilink_action').setLabel('Ação').setStyle(ButtonStyle.Secondary),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('antilink_exceptions').setLabel('Exceções').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('antilink_log').setLabel('Canal de logs').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('antilink_reset').setLabel('Limpar exceções').setStyle(ButtonStyle.Danger),
  ));
  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

export async function handleAntiLinkCfgBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  const cfg = await getCfg(interaction.guildId);
  const { customId } = interaction;
  if (customId === 'antilink_toggle') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { antiLinkEnabled: !cfg.antiLinkEnabled } });
  } else if (customId === 'antilink_categories') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('antilink_modal_categories').setTitle('Categorias bloqueadas');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('A = todos | D = Discord | S = redes | E = encurtadores').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('A D S E')));
    return interaction.showModal(modal);
  } else if (customId === 'antilink_action') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('antilink_modal_action').setTitle('Ação do anti-link');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('delete, delete_warn ou timeout').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('delete_warn')));
    return interaction.showModal(modal);
  } else if (customId === 'antilink_exceptions') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('antilink_modal_exceptions').setTitle('Exceções do anti-link');
    for (const [id, label, value, placeholder] of [
      ['domains', 'Domínios permitidos (separados por vírgula)', cfg.antiLinkAllowedDomains, 'youtube.com, github.com'],
      ['channels', 'Canais liberados (IDs separados por vírgula)', cfg.antiLinkAllowedChannels, '123456789012345678'],
      ['roles', 'Cargos liberados (IDs separados por vírgula)', cfg.antiLinkAllowedRoles, '123456789012345678'],
    ]) {
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(800).setPlaceholder(placeholder).setValue(value ?? '')));
    }
    return interaction.showModal(modal);
  } else if (customId === 'antilink_log') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('antilink_modal_log').setTitle('Canal de registros');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel('ID do canal (vazio desativa)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30).setPlaceholder('123456789012345678').setValue(cfg.antiLinkLogChannel ?? '')));
    return interaction.showModal(modal);
  } else if (customId === 'antilink_reset') {
    await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data: { antiLinkAllowedDomains: null, antiLinkAllowedChannels: null, antiLinkAllowedRoles: null } });
  }
  return interaction.update(buildAntiLinkConfigPayload(await getCfg(interaction.guildId)));
}

export async function handleAntiLinkCfgModal(interaction) {
  await interaction.deferUpdate();
  const cfg = await getCfg(interaction.guildId);
  const cleanList = (value) => value.split(',').map((x) => x.trim()).filter(Boolean).join(',') || null;
  let data = {};
  if (interaction.customId === 'antilink_modal_categories') {
    const categories = interaction.fields.getTextInputValue('value').toUpperCase();
    data = { antiLinkBlockAll: categories.includes('A'), antiLinkBlockDiscord: categories.includes('D'), antiLinkBlockSocial: categories.includes('S'), antiLinkBlockShorteners: categories.includes('E') };
  } else if (interaction.customId === 'antilink_modal_action') {
    const action = interaction.fields.getTextInputValue('value').trim().toLowerCase();
    data = { antiLinkAction: ['delete', 'delete_warn', 'timeout'].includes(action) ? action : cfg.antiLinkAction };
  } else if (interaction.customId === 'antilink_modal_exceptions') {
    data = {
      antiLinkAllowedDomains: cleanList(interaction.fields.getTextInputValue('domains')),
      antiLinkAllowedChannels: cleanList(interaction.fields.getTextInputValue('channels').replace(/[<#>]/g, '')),
      antiLinkAllowedRoles: cleanList(interaction.fields.getTextInputValue('roles').replace(/[<@&>]/g, '')),
    };
  } else if (interaction.customId === 'antilink_modal_log') {
    data = { antiLinkLogChannel: interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim() || null };
  }
  await prisma.guildConfig.update({ where: { guildId: interaction.guildId }, data });
  await interaction.message.edit(buildAntiLinkConfigPayload(await getCfg(interaction.guildId)));
}

export function buildInstaConfigPayload(cfg) {
  const ativo  = !!(cfg.instaChannel);
  const cor    = cfg.instaColor ? `#${cfg.instaColor}` : 'Sem cor';
  const emoji  = cfg.instaEmoji ?? '💜';
  const handle = cfg.instaHandle ? `@${cfg.instaHandle}` : 'Não definido';

  const c = new ContainerBuilder();

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `${D(ativo)} **Instagram** — ${ativo ? 'Feed ATIVO' : 'Feed DESATIVADO'}`,
        '',
        `📣 **Canal:** ${cfg.instaChannel ? `<#${cfg.instaChannel}>` : '*(não configurado)*'}`,
        `🎨 **Cor:** ${cor}   ❤️ **Emoji:** ${emoji}   🔗 **Handle:** ${handle}`,
      ].join('\n'),
    ),
  );

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('insta_cfg_canal')
        .setLabel(ativo ? 'Alterar Canal' : 'Ativar (definir canal)')
        .setStyle(ativo ? ButtonStyle.Secondary : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('insta_cfg_desativar')
        .setLabel('Desativar')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!ativo),
    ),
  );

  c.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('insta_cfg_cor')
        .setLabel('Cor')
        .setEmoji('🎨')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('insta_cfg_sem_cor')
        .setLabel('Sem Lateral')
        .setEmoji('◻️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('insta_cfg_emoji')
        .setLabel('Emoji Like')
        .setEmoji('❤️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('insta_cfg_handle')
        .setLabel('@ Instagram')
        .setEmoji('🔗')
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

// ─── Mini-config do Status (abre pelo painel) ─────────────────────────────────

export function buildStatusConfigPayload() {
  const c = new ContainerBuilder();

  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        '**Status** — Status de streaming do bot',
        '',
        'Configure o status de **Transmitindo** exibido no perfil do bot.',
        '',
        '`/status definir` — abre editor de emoji + texto',
        '`/status automatico [textos]` — rotação automática separada por `|`',
        '`/status parar` — para a rotação e restaura o padrão',
      ].join('\n'),
    ),
  );

  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

// ─── Mini-config do Presenced ─────────────────────────────────────────────────

export function buildPresencedConfigPayload(cfg) {
  const consoles = (cfg.presencedConsoles ?? 'PS3,WiiU')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);
  const ps3On = consoles.includes('PS3');
  const wiiuOn = consoles.includes('WIIU');
  const c = new ContainerBuilder();

  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `${D(cfg.presencedEnabled)} **Presenced** — ${cfg.presencedEnabled ? 'ATIVO' : 'DESATIVADO'}`,
    '',
    'Monitora PS3/Wii U na sua rede e publica a atividade no Discord Desktop.',
    'O bot salva as preferências e o botão de download gera o arquivo do cliente local.',
    '',
    `**Consoles:** ${[ps3On && 'PS3', wiiuOn && 'Wii U'].filter(Boolean).join(' + ') || 'nenhum'}`,
    `**Intervalo:** ${cfg.presencedPollInterval ?? 10}s`,
    `**PS3:** ${cfg.presencedPs3Address || 'IP não configurado'}`,
    `**Wii U:** porta UDP ${cfg.presencedWiiuPort ?? 5005}`,
  ].join('\n')));

  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('presenced_toggle')
      .setLabel(cfg.presencedEnabled ? 'Desativar no painel' : 'Ativar no painel')
      .setStyle(cfg.presencedEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('presenced_general')
      .setLabel('Consoles e intervalo')
      .setStyle(ButtonStyle.Secondary),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('presenced_ps3')
      .setLabel('Configurar PS3')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('presenced_wiiu')
      .setLabel('Configurar Wii U')
      .setStyle(ButtonStyle.Secondary),
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('presenced_download')
      .setLabel('Baixar configuração')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('presenced_reset')
      .setLabel('Limpar configuração')
      .setStyle(ButtonStyle.Danger),
  ));

  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

function buildPresencedDownloadConfig(cfg, clientId) {
  return {
    enabled: Boolean(cfg.presencedEnabled),
    clientId,
    pollInterval: cfg.presencedPollInterval ?? 10,
    consoleClients: (cfg.presencedConsoles ?? 'PS3,WiiU')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(value => ['PS3', 'WIIU'].includes(value))
      .map(value => value === 'WIIU' ? 'WiiU' : value),
    presence: {
      useCommonFormat: true,
      resetTimeOnAppChange: true,
      commonFormat: {
        displayType: 2,
        appName: 'console_name',
        details1: 'app_name',
        details2: 'info_network',
        imageBigText: 'app_name',
        imageBigType: 'image_app',
        imageSmallText: 'info_firmware',
        imageSmallType: 'image_console',
      },
    },
    clientConfig: {
      ps3: {
        address: cfg.presencedPs3Address ?? '',
        networkName: cfg.presencedPs3Network ?? 'PSN',
        networkNameFull: cfg.presencedPs3NetworkFull ?? 'PlayStation Network',
        networkId: cfg.presencedPs3NetworkId ?? '{anon-user}',
        useCelsius: cfg.presencedPs3UseCelsius !== false,
      },
      wiiu: {
        udpPort: cfg.presencedWiiuPort ?? 5005,
        firmwareVer: cfg.presencedWiiuFirmware ?? '{unknown-ver}',
        hardwareText: cfg.presencedWiiuHardware ?? 'IBM Espresso | AMD Latte',
      },
    },
  };
}

export async function handlePresencedCfgBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }

  const cfg = await getCfg(interaction.guildId);
  const { customId } = interaction;

  if (customId === 'presenced_toggle') {
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId },
      data: { presencedEnabled: !cfg.presencedEnabled },
    });
  } else if (customId === 'presenced_reset') {
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId },
      data: {
        presencedEnabled: false,
        presencedConsoles: 'PS3,WiiU',
        presencedPollInterval: 10,
        presencedPs3Address: null,
        presencedPs3Network: 'PSN',
        presencedPs3NetworkFull: 'PlayStation Network',
        presencedPs3NetworkId: '{anon-user}',
        presencedPs3UseCelsius: true,
        presencedWiiuPort: 5005,
        presencedWiiuFirmware: '{unknown-ver}',
        presencedWiiuHardware: 'IBM Espresso | AMD Latte',
      },
    });
  } else if (customId === 'presenced_download') {
    const config = buildPresencedDownloadConfig(cfg, interaction.client.user.id);
    return interaction.reply({
      content: [
        '✅ Configuração gerada. Salve o anexo como `presenced.config.json`',
        'na pasta `discord-bot/rpc-client` e execute `npm run presenced`.',
      ].join('\n'),
      files: [{
        attachment: Buffer.from(`${JSON.stringify(config, null, 2)}\n`, 'utf8'),
        name: 'presenced.config.json',
      }],
      flags: 64,
    });
  } else if (customId === 'presenced_general') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('presenced_modal_general').setTitle('Presenced — Geral');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('consoles').setLabel('Consoles: PS3, WiiU ou ambos')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
          .setValue(cfg.presencedConsoles ?? 'PS3,WiiU'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('interval').setLabel('Intervalo de leitura em segundos')
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4)
          .setValue(String(cfg.presencedPollInterval ?? 10)),
      ),
    );
    return interaction.showModal(modal);
  } else if (customId === 'presenced_ps3') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('presenced_modal_ps3').setTitle('Presenced — PS3');
    for (const [id, label, value, placeholder] of [
      ['address', 'IP ou hostname do PS3', cfg.presencedPs3Address, '192.168.1.100'],
      ['network', 'Nome curto da rede', cfg.presencedPs3Network, 'PSN'],
      ['networkFull', 'Nome completo da rede', cfg.presencedPs3NetworkFull, 'PlayStation Network'],
      ['networkId', 'ID exibido (opcional)', cfg.presencedPs3NetworkId, '{anon-user}'],
    ]) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(100).setPlaceholder(placeholder).setValue(value ?? ''),
      ));
    }
    return interaction.showModal(modal);
  } else if (customId === 'presenced_wiiu') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder().setCustomId('presenced_modal_wiiu').setTitle('Presenced — Wii U');
    for (const [id, label, value, placeholder] of [
      ['port', 'Porta UDP do Rich Presence U', cfg.presencedWiiuPort, '5005'],
      ['firmware', 'Versão do CafeOS', cfg.presencedWiiuFirmware, '{unknown-ver}'],
      ['hardware', 'Texto do hardware', cfg.presencedWiiuHardware, 'IBM Espresso | AMD Latte'],
    ]) {
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(100).setPlaceholder(placeholder).setValue(String(value ?? '')),
      ));
    }
    return interaction.showModal(modal);
  }

  return interaction.update(buildPresencedConfigPayload(await getCfg(interaction.guildId)));
}

export async function handlePresencedCfgModal(interaction) {
  await interaction.deferUpdate();
  const { customId } = interaction;
  const value = id => interaction.fields.getTextInputValue(id).trim();
  let data;

  if (customId === 'presenced_modal_general') {
    const consoles = value('consoles').toUpperCase().replace(/\s+/g, '');
    const selected = ['PS3', 'WIIU'].filter(consoleName => consoles.includes(consoleName));
    data = {
      presencedConsoles: selected.map(consoleName => consoleName === 'WIIU' ? 'WiiU' : consoleName).join(',') || 'PS3,WiiU',
      presencedPollInterval: Math.min(3600, Math.max(2, Number(value('interval')) || 10)),
    };
  } else if (customId === 'presenced_modal_ps3') {
    data = {
      presencedPs3Address: value('address') || null,
      presencedPs3Network: value('network') || 'PSN',
      presencedPs3NetworkFull: value('networkFull') || 'PlayStation Network',
      presencedPs3NetworkId: value('networkId') || '{anon-user}',
    };
  } else if (customId === 'presenced_modal_wiiu') {
    data = {
      presencedWiiuPort: Math.min(65535, Math.max(1, Number(value('port')) || 5005)),
      presencedWiiuFirmware: value('firmware') || '{unknown-ver}',
      presencedWiiuHardware: value('hardware') || 'IBM Espresso | AMD Latte',
    };
  }

  if (data) {
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId },
      create: { guildId: interaction.guildId, ...data },
      update: data,
    });
  }
  return interaction.message.edit(buildPresencedConfigPayload(await getCfg(interaction.guildId)));
}

// ─── Mini-config dos cargos de boost ─────────────────────────────────────────

export function buildBoostConfigPayload(guild, cfg) {
  const roleIds = (cfg.boostRoles ?? '').split(',').map(id => id.trim()).filter(Boolean);
  const roles = roleIds
    .map(id => guild.roles.cache.get(id))
    .filter(Boolean);

  const roleText = roles.length
    ? roles.map(role => `<@&${role.id}>`).join(', ')
    : '*(nenhum cargo configurado)*';

  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    `${D(roles.length > 0)} **Cargos de Boost**`,
    '',
    'Os cargos abaixo serão entregues automaticamente quando um membro impulsionar o servidor.',
    'Quando o impulso for removido, os cargos concedidos por este módulo também serão retirados.',
    '',
    `**Cargos configurados:** ${roleText}`,
  ].join('\n')));

  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('boost_roles_select')
      .setPlaceholder('Selecione os cargos de boost...')
      .setMinValues(0)
      .setMaxValues(5),
  ));

  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('boost_roles_clear')
      .setLabel('Limpar cargos')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(roleIds.length === 0),
  ));

  return { components: [c, voltarRow()], flags: MessageFlags.IsComponentsV2 };
}

export async function handleBoostCfgRoleSelect(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }

  const me = interaction.guild.members.me
    ?? await interaction.guild.members.fetchMe().catch(() => null);
  const selected = [...new Set(interaction.values)]
    .map(id => interaction.guild.roles.cache.get(id))
    .filter(role => role && !role.managed && role.id !== interaction.guild.id);

  const unavailable = selected.filter(role => me && role.position >= me.roles.highest.position);
  if (unavailable.length) {
    return interaction.reply({
      content: `❌ Não consigo gerenciar ${unavailable.map(role => `<@&${role.id}>`).join(', ')}. Escolha cargos abaixo do meu cargo mais alto.`,
      ephemeral: true,
    });
  }

  const boostRoles = selected.map(role => role.id).join(',') || null;
  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, boostRoles },
    update: { boostRoles },
  });

  return interaction.update(buildBoostConfigPayload(interaction.guild, await getCfg(interaction.guildId)));
}

export async function handleBoostCfgBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }

  if (interaction.customId === 'boost_roles_clear') {
    await prisma.guildConfig.update({
      where: { guildId: interaction.guildId },
      data: { boostRoles: null },
    });
  }

  return interaction.update(buildBoostConfigPayload(interaction.guild, await getCfg(interaction.guildId)));
}

// ─── Handler: clique em "Configurar" de qualquer módulo ─────────────────────

export async function handlePainelCfgBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }

  const { customId } = interaction;
  const cfg = await getCfg(interaction.guildId);

  const modulo = customId.replace('painel_cfg_', '');

  let payload;

  switch (modulo) {
    case 'boasvindas': {
      const base = buildWelcomeConfigPayload(cfg);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'ticket': {
      const base = buildTicketConfigPayload(cfg);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'tellonym': {
      const base = buildTellonymConfigPayload(cfg);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'parceria': {
      const base = buildPartnerConfigPayload(cfg);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'loja': {
      const base = buildLojaAdminPayload(cfg);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'vip': {
      const cfgVip = await getCfgWithPlans(interaction.guildId);
      const base = buildVipConfigPayload(cfgVip, cfgVip.vipPlans);
      payload = { ...base, components: [...(base.components ?? []), voltarRow()] };
      break;
    }
    case 'instagram':
      payload = buildInstaConfigPayload(cfg);
      break;
    case 'status':
      payload = buildStatusConfigPayload();
      break;
    case 'presenced':
      payload = buildPresencedConfigPayload(cfg);
      break;
    case 'boost':
      payload = buildBoostConfigPayload(interaction.guild, cfg);
      break;
    case 'antilink':
      payload = buildAntiLinkConfigPayload(cfg);
      break;
    case 'bump':
      payload = buildBumpConfigPayload(cfg);
      break;
    default:
      return interaction.reply({ content: '❌ Módulo desconhecido.', flags: 64 });
  }

  return interaction.update(payload);
}

// ─── Handler: botões pm_* (planos VIP etc.) ───────────────────────────────────

export async function handlePainelModuleBtn(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }

  const { customId } = interaction;
  const guildId = interaction.guildId;

  // ── VIP: remover plano ───────────────────────────────────────────────────
  if (customId.startsWith('pm_vip_plano_del:')) {
    const planId = customId.slice('pm_vip_plano_del:'.length);
    await prisma.vipPlan.delete({ where: { id: planId } }).catch(() => {});
    // Redireciona para handlePainelCfgBtn que reconstrói com voltarRow
    interaction.customId = 'painel_cfg_vip';
    return handlePainelCfgBtn(interaction);
  }

  // ── VIP: adicionar plano (modal) ─────────────────────────────────────────
  if (customId === 'pm_vip_plano_add') {
    const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
    const modal = new ModalBuilder()
      .setCustomId('pm_modal_vip_plano_add')
      .setTitle('Adicionar Plano VIP');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name').setLabel('Nome do Plano').setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(50).setPlaceholder('Ex: VIP Gold'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('price').setLabel('Preço').setStyle(TextInputStyle.Short)
          .setRequired(true).setMaxLength(50).setPlaceholder('Ex: R$ 20/mês'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('emoji').setLabel('Emoji (opcional)').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(100).setPlaceholder('Ex: ⭐ ou <:vip:123>'),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('roleId').setLabel('ID do Cargo VIP (opcional)').setStyle(TextInputStyle.Short)
          .setRequired(false).setMaxLength(25).setPlaceholder('Ex: 123456789012345678'),
      ),
    );
    return interaction.showModal(modal);
  }
}

// ─── Handler: modais pm_modal_* ───────────────────────────────────────────────

export async function handlePainelModuleModal(interaction) {
  await interaction.deferUpdate();

  const { customId } = interaction;
  const guildId = interaction.guildId;

  // ── VIP: salvar novo plano ───────────────────────────────────────────────
  if (customId === 'pm_modal_vip_plano_add') {
    const name   = interaction.fields.getTextInputValue('name').trim();
    const price  = interaction.fields.getTextInputValue('price').trim();
    const emoji  = interaction.fields.getTextInputValue('emoji').trim() || null;
    const roleId = interaction.fields.getTextInputValue('roleId').trim().replace(/[<@&>]/g, '') || null;

    const count = await prisma.vipPlan.count({ where: { guildId } });
    await prisma.vipPlan.create({
      data: { guildId, name, price, emoji, roleId: roleId || null, position: count },
    });

    const cfg  = await getCfgWithPlans(guildId);
    const base = buildVipConfigPayload(cfg, cfg.vipPlans);
    await interaction.message.edit({
      ...base,
      components: [...base.components, voltarRow()],
    });
  }
}

// ─── Handler: botão "Abrir Funções" / "Atualizar" ────────────────────────────

export async function handlePainelFuncoes(interaction) {
  if (!interaction.memberPermissions?.has(0x20n)) {
    return interaction.reply({ content: '❌ Sem permissão.', flags: 64 });
  }
  const cfg = await getCfg(interaction.guildId);
  return interaction.update(buildPainelFuncoes(interaction.guild, cfg));
}

// ─── Handler: botão "← Voltar ao Painel" ─────────────────────────────────────

export async function handlePainelVoltar(interaction) {
  const cfg = await getCfg(interaction.guildId);
  return interaction.update(buildPainelMain(interaction.guild, cfg));
}

// ─── Handler: select de módulo (mantido por compatibilidade) ─────────────────

export async function handlePainelModuloSel(interaction) {
  // Redireciona para o handler de botão simulando o customId
  interaction.customId = `painel_cfg_${interaction.values[0]}`;
  return handlePainelCfgBtn(interaction);
}

// ─── Handlers: mini-config Instagram ─────────────────────────────────────────

export async function handleInstaCfgBtn(interaction) {
  const { customId } = interaction;

  if (customId === 'insta_cfg_desativar') {
    await prisma.guildConfig.upsert({
      where:  { guildId: interaction.guildId },
      create: { guildId: interaction.guildId },
      update: { instaChannel: null },
    });
    return interaction.update(buildInstaConfigPayload(await getCfg(interaction.guildId)));
  }

  if (customId === 'insta_cfg_sem_cor') {
    await prisma.guildConfig.upsert({
      where:  { guildId: interaction.guildId },
      create: { guildId: interaction.guildId },
      update: { instaColor: null },
    });
    return interaction.update(buildInstaConfigPayload(await getCfg(interaction.guildId)));
  }

  const MODAL_MAP = {
    insta_cfg_canal:  { customId: 'insta_cfg_modal_canal',  title: 'Canal do Feed',         label: 'ID do canal',     max: 30, ph: '123456789012345678' },
    insta_cfg_cor:    { customId: 'insta_cfg_modal_cor',    title: 'Cor da barra lateral',  label: 'Hex sem #',       max: 6,  ph: 'E1306C' },
    insta_cfg_emoji:  { customId: 'insta_cfg_modal_emoji',  title: 'Emoji de curtir',       label: 'Emoji',           max: 32, ph: '💜' },
    insta_cfg_handle: { customId: 'insta_cfg_modal_handle', title: '@ do Instagram',        label: '@ do Instagram',  max: 50, ph: 'savage.angels' },
  };

  const def = MODAL_MAP[customId];
  if (!def) return;

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = await import('discord.js');
  const modal = new ModalBuilder().setCustomId(def.customId).setTitle(def.title);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('value')
        .setLabel(def.label)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(def.max)
        .setPlaceholder(def.ph),
    ),
  );
  return interaction.showModal(modal);
}

export async function handleInstaCfgModal(interaction) {
  await interaction.deferUpdate();

  const { customId } = interaction;
  const raw   = interaction.fields.getTextInputValue('value').trim();
  const value = raw || null;
  let   update = {};

  if      (customId === 'insta_cfg_modal_canal')  update = { instaChannel: value ? value.replace(/[<#>]/g, '') : null };
  else if (customId === 'insta_cfg_modal_cor')    update = { instaColor: value ? value.replace(/^#/, '').toUpperCase().slice(0, 6) : null };
  else if (customId === 'insta_cfg_modal_emoji')  update = { instaEmoji: value ?? '💜' };
  else if (customId === 'insta_cfg_modal_handle') update = { instaHandle: value ? value.replace(/^@/, '') : null };

  await prisma.guildConfig.upsert({
    where:  { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, ...update },
    update,
  });

  const cfg = await getCfg(interaction.guildId);
  await interaction.message.edit(buildInstaConfigPayload(cfg));
}

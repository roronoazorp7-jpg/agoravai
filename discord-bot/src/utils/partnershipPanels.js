import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';

export function partnerConfigButtons(cfg = {}) {
  const enabled      = cfg.partnerEnabled     ?? false;
  const dmActive     = cfg.partnerNotifyDm    ?? false;
  const removeActive = cfg.partnerRemoveOnLeave ?? false;

  const options = [
    {
      value: 'toggle_enabled',
      label: enabled ? 'Desativar sistema' : 'Ativar sistema',
      description: enabled ? 'Desliga o registro automático de parcerias' : 'Liga o registro automático de parcerias',
      emoji: enabled ? '🔴' : '🟢',
    },
    { value: 'canal', label: 'Canal de parcerias', description: 'Escolha onde os convites serão validados', emoji: '☁️' },
    { value: 'cargo_resp', label: 'Cargo responsável', description: 'Cargo autorizado a registrar parcerias', emoji: '👑' },
    { value: 'cargo_ping', label: 'Cargo de ping', description: 'Cargo notificado quando uma parceria é registrada', emoji: '🔔' },
    { value: 'cargo_parceiro', label: 'Cargo de parceiro', description: 'Cargo entregue ao representante', emoji: '🤝' },
    { value: 'toggle_dm', label: `Notificar representante no privado: ${dmActive ? 'Ativado' : 'Desativado'}`, description: 'Envia uma mensagem direta ao representante', emoji: '📨' },
    { value: 'cor', label: 'Cor da parceria', description: 'Altere a cor visual das publicações', emoji: '🎨' },
    { value: 'imagem', label: 'Imagem da parceria', description: 'Configure a imagem ou use a do servidor parceiro', emoji: '💣' },
    { value: 'thumb', label: 'Thumbnail da parceria', description: 'Configure a thumbnail ou use o ícone do parceiro', emoji: '🖼️' },
    { value: 'footer', label: 'Rodapé', description: 'Altere o rodapé da publicação', emoji: '📝' },
    { value: 'mensagem', label: 'Mensagem', description: 'Altere o texto de agradecimento', emoji: '✏️' },
    { value: 'descricao', label: 'Descrição', description: 'Adicione uma descrição à publicação', emoji: '📄' },
    { value: 'toggle_remove', label: `Remover ao sair: ${removeActive ? 'Ativado' : 'Desativado'}`, description: 'Remove o cargo quando o representante sai', emoji: '❌' },
    { value: 'min_membros', label: 'Mínimo de membros', description: 'Bloqueia servidores abaixo da quantidade definida', emoji: '👥' },
  ].map(option => new StringSelectMenuOptionBuilder()
    .setValue(option.value)
    .setLabel(option.label.slice(0, 100))
    .setDescription(option.description.slice(0, 100))
    .setEmoji(option.emoji));

  const menu = new StringSelectMenuBuilder()
    .setCustomId('pcfg_menu')
    .setPlaceholder('Selecione uma opção para configurar...')
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(menu)];
}

export function buildPartnerConfigPayload(cfg = {}) {
  const enabled = cfg.partnerEnabled ?? false;

  const info = [
    `## 🤝 Parcerias — ${enabled ? '🟢 ATIVO' : '🔴 DESATIVADO'}`,
    '',
    '**Obrigatório:**',
    `💌 **Canal:** ${cfg.partnerChannel ? `<#${cfg.partnerChannel}>` : '*(não definido)*'}`,
    `👑 **Cargo Responsável:** ${cfg.partnerResponsibleRole ? `<@&${cfg.partnerResponsibleRole}>` : '*(não definido)*'}`,
    '',
    '**Opcional:**',
    `🔔 **Cargo Ping:** ${cfg.partnerPingRole ? `<@&${cfg.partnerPingRole}>` : '*(nenhum)*'}   🤝 **Cargo Parceiro:** ${cfg.partnerRole ? `<@&${cfg.partnerRole}>` : '*(nenhum)*'}`,
    `📩 **Notif. DM:** ${cfg.partnerNotifyDm ? 'Ativado' : 'Desativado'}   🚪 **Remover ao Sair:** ${cfg.partnerRemoveOnLeave ? 'Ativado' : 'Desativado'}`,
    `🎨 **Cor:** \`#${cfg.partnerColor || 'A020F0'}\`   💣 **Imagem:** ${cfg.partnerImage ? '✅' : '*(padrão)*'}   🖼️ **Thumb:** ${cfg.partnerThumbnail ? '✅' : '*(padrão)*'}`,
    `👇 **Rodapé:** ${cfg.partnerFooter ? cfg.partnerFooter.slice(0, 60) : '*(nenhum)*'}`,
    `✏️ **Mensagem:** ${cfg.partnerMessage ? cfg.partnerMessage.slice(0, 80) : '*(padrão)*'}`,
    `📄 **Descrição:** ${cfg.partnerDescription ? cfg.partnerDescription.slice(0, 80) : '*(nenhuma)*'}`,
    `👥 **Mínimo de membros:** ${cfg.partnerMinMembers ? cfg.partnerMinMembers.toLocaleString('pt-BR') : 'Desativado'}`,
    '',
    '👑 Eu valido os convites enviados pelo cargo responsável, notifico o cargo de ping e entrego o cargo de parceiro ao representante.',
    '👑 Selecione novamente o canal de parcerias para trocar ou desativar o sistema.',
    '',
    '-# Envie o convite do servidor no canal configurado para registrar uma parceria.',
  ].join('\n');

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

  return { components: [container, ...partnerConfigButtons(cfg)], flags: MessageFlags.IsComponentsV2 };
}

export function buildPartnershipPost({ cfg, promoterId, partnerName, inviteCode, partnershipCount, rank, thumbUrl, imageUrl, messageUrl }) {
  const accentColor = cfg?.partnerColor ? (parseInt(cfg.partnerColor, 16) || 0xA020F0) : 0xA020F0;
  const defaultMsg  = cfg?.partnerMessage || '★ Obrigado por fortalecer nossa comunidade!';

  const container = new ContainerBuilder().setAccentColor(accentColor);

  if (thumbUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**✦ • Parceria Realizada**'))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl)),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**✦ • Parceria Realizada**'));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `🎖️ **Promoter:** <@${promoterId}>\n` +
    `🏅 **Rank:** #${rank}\n` +
    `🤝 **Parcerias feitas:** ${partnershipCount}\n` +
    `↳ **Servidor parceiro:** ${partnerName}`,
  ));

  container.addSeparatorComponents(new SeparatorBuilder());
  if (cfg?.partnerDescription) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(cfg.partnerDescription));
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(defaultMsg));

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
    );
  }

  if (cfg?.partnerFooter) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${cfg.partnerFooter}`));
  }

  const inviteLink = `https://discord.gg/${inviteCode}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Entrar no servidor').setURL(inviteLink).setStyle(ButtonStyle.Link),
  );
  if (messageUrl) {
    row.addComponents(new ButtonBuilder().setLabel('Ver mensagem').setURL(messageUrl).setStyle(ButtonStyle.Link));
  }

  return { components: [container, row], flags: MessageFlags.IsComponentsV2 };
}

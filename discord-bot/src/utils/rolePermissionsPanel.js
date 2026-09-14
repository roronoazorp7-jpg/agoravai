import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  TextDisplayBuilder,
} from 'discord.js';

// Mantém uma linha livre no container para navegação, mesmo em servidores
// com muitos cargos. Isso evita ultrapassar limites de componentes do cliente.
const ROLES_PER_PAGE = 15;
const PERMISSIONS_PER_PAGE = 8;

const PERMISSION_DEFS = [
  ['ViewChannel', 'Ver canais'],
  ['SendMessages', 'Enviar mensagens'],
  ['SendMessagesInThreads', 'Enviar em tópicos'],
  ['EmbedLinks', 'Incorporar links'],
  ['AttachFiles', 'Anexar arquivos'],
  ['AddReactions', 'Adicionar reações'],
  ['ReadMessageHistory', 'Ler histórico'],
  ['UseApplicationCommands', 'Usar comandos'],
  ['MentionEveryone', 'Mencionar everyone'],
  ['ManageMessages', 'Gerenciar mensagens'],
  ['ManageThreads', 'Gerenciar tópicos'],
  ['Connect', 'Conectar em voz'],
  ['Speak', 'Falar em voz'],
  ['Stream', 'Transmitir em voz'],
  ['UseVAD', 'Usar detecção de voz'],
  ['MuteMembers', 'Silenciar membros'],
  ['DeafenMembers', 'Ensurdecer membros'],
  ['MoveMembers', 'Mover membros'],
  ['ModerateMembers', 'Moderar membros'],
  ['ManageNicknames', 'Gerenciar apelidos'],
  ['ChangeNickname', 'Alterar apelido'],
  ['ManageChannels', 'Gerenciar canais'],
  ['ManageRoles', 'Gerenciar cargos'],
  ['ManageGuild', 'Gerenciar servidor'],
  ['KickMembers', 'Expulsar membros'],
  ['BanMembers', 'Banir membros'],
  ['ManageWebhooks', 'Gerenciar webhooks'],
  ['ManageEvents', 'Gerenciar eventos'],
  ['Administrator', 'Administrador'],
].map(([key, label]) => ({
  key,
  label,
  flag: PermissionFlagsBits[key],
})).filter(permission => permission.flag !== undefined);

function truncate(value, max) {
  const text = String(value ?? 'Cargo');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function roleList(guild) {
  return [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id)
    .sort((a, b) => b.position - a.position);
}

function hasRawPermission(role, flag) {
  return (role.permissions.bitfield & flag) === flag;
}

function roleIsManageable(interaction, role) {
  if (!role || role.managed || role.id === interaction.guild.id) return false;

  const member = interaction.guild.members.cache.get(interaction.user.id) ?? interaction.member;
  const memberHighest = member?.roles?.highest?.position ?? -1;
  if (memberHighest < 0 || role.position >= memberHighest) return false;

  const botMember = interaction.guild.members.me
    ?? interaction.guild.members.cache.get(interaction.client.user.id);
  const botHighest = botMember?.roles?.highest?.position ?? -1;
  return role.position < botHighest;
}

function pageButton(customId, label, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);
}

function buildNavigation(page, pageCount) {
  return new ActionRowBuilder().addComponents(
    pageButton('perm_roles:0', 'Primeira', page === 0),
    pageButton(`perm_roles:${Math.max(0, page - 1)}`, 'Anterior', page === 0),
    pageButton(`perm_roles:${Math.min(pageCount - 1, page + 1)}`, 'Próxima', page >= pageCount - 1),
    pageButton(`perm_roles:${pageCount - 1}`, 'Última', page >= pageCount - 1),
  );
}

export function buildRolePermissionsHome(guild, requestedPage = 0) {
  const roles = roleList(guild);
  const pageCount = Math.max(1, Math.ceil(roles.length / ROLES_PER_PAGE));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const visibleRoles = roles.slice(page * ROLES_PER_PAGE, (page + 1) * ROLES_PER_PAGE);

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '## Painel de Permissões',
    `**${guild.name}**`,
    '',
    'Selecione um cargo para consultar suas permissões e alterar os acessos.',
    'Cargos integrados não podem ser editados pelo Discord.',
    '',
    `Cargos encontrados: **${roles.length}** · Página **${page + 1}/${pageCount}**`,
  ].join('\n')));

  if (!visibleRoles.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      'Não há cargos personalizados neste servidor.',
    ));
  }

  const buttonRows = [];
  for (let index = 0; index < visibleRoles.length; index += 5) {
    const row = new ActionRowBuilder();
    for (const role of visibleRoles.slice(index, index + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`perm_role:${role.id}:${page}`)
          .setLabel(truncate(role.name, 70))
          .setStyle(role.managed ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(role.managed),
      );
    }
    buttonRows.push(row);
  }

  if (pageCount > 1) buttonRows.push(buildNavigation(page, pageCount));

  return {
    components: [container, ...buttonRows],
    flags: MessageFlags.IsComponentsV2,
  };
}

export function buildRolePermissionsDetail(guild, roleId, requestedPage = 0, rolePage = 0) {
  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return buildRolePermissionsHome(guild);
  }

  const pageCount = Math.max(1, Math.ceil(PERMISSION_DEFS.length / PERMISSIONS_PER_PAGE));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const visiblePermissions = PERMISSION_DEFS.slice(
    page * PERMISSIONS_PER_PAGE,
    (page + 1) * PERMISSIONS_PER_PAGE,
  );
  const enabled = PERMISSION_DEFS
    .filter(permission => hasRawPermission(role, permission.flag))
    .map(permission => permission.label);

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
    '## Permissões do cargo',
    `**${truncate(role.name, 80)}** · <@&${role.id}>`,
    '',
    role.managed
      ? 'Este cargo é integrado e não pode ser alterado.'
      : 'Clique em uma permissão para conceder ou remover o acesso.',
    `Permissões ativas: **${enabled.length}**${enabled.length ? `\n${truncate(enabled.join(' · '), 900)}` : ''}`,
    '',
    `Grupo de permissões: **${page + 1}/${pageCount}**`,
  ].join('\n')));

  const buttonRows = [];
  for (let index = 0; index < visiblePermissions.length; index += 4) {
    const row = new ActionRowBuilder();
    for (const permission of visiblePermissions.slice(index, index + 4)) {
      const active = hasRawPermission(role, permission.flag);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`perm_toggle:${role.id}:${permission.key}:${page}:${rolePage}`)
          .setLabel(truncate(`${active ? '✓' : '+'} ${permission.label}`, 80))
          .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(role.managed),
      );
    }
    buttonRows.push(row);
  }

  const navigation = new ActionRowBuilder().addComponents(
    pageButton(`perm_detail:${role.id}:0:${rolePage}`, 'Primeiro grupo', page === 0),
    pageButton(`perm_detail:${role.id}:${Math.max(0, page - 1)}:${rolePage}`, 'Anterior', page === 0),
    pageButton(`perm_detail:${role.id}:${Math.min(pageCount - 1, page + 1)}:${rolePage}`, 'Próximo', page >= pageCount - 1),
    pageButton(`perm_detail:${role.id}:${pageCount - 1}:${rolePage}`, 'Último grupo', page >= pageCount - 1),
  );
  buttonRows.push(navigation);
  buttonRows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`perm_roles:${rolePage}`)
      .setLabel('Voltar aos cargos')
      .setStyle(ButtonStyle.Secondary),
  ));

  return {
    components: [container, ...buttonRows],
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function handleRolePermissionsInteraction(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ Este painel só funciona dentro de um servidor.', ephemeral: true });
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({
      content: '❌ Você precisa da permissão **Gerenciar Cargos** para usar este painel.',
      ephemeral: true,
    });
  }

  const [action, first, second, third, fourth] = interaction.customId.split(':');

  if (action === 'perm_roles') {
    return interaction.update(buildRolePermissionsHome(interaction.guild, first));
  }

  if (action === 'perm_detail') {
    const role = interaction.guild.roles.cache.get(first);
    if (!roleIsManageable(interaction, role)) {
      return interaction.reply({
        content: '❌ Este cargo não pode ser gerenciado por você ou está acima do meu cargo mais alto.',
        ephemeral: true,
      });
    }
    return interaction.update(buildRolePermissionsDetail(interaction.guild, first, second, third));
  }

  if (action !== 'perm_role' && action !== 'perm_toggle') return;

  const role = interaction.guild.roles.cache.get(first);
  if (!roleIsManageable(interaction, role)) {
    return interaction.reply({
      content: '❌ Este cargo não pode ser gerenciado por você ou está acima do meu cargo mais alto.',
      ephemeral: true,
    });
  }

  if (action === 'perm_role') {
    return interaction.update(buildRolePermissionsDetail(interaction.guild, first, 0, second));
  }

  const permission = PERMISSION_DEFS.find(item => item.key === second);
  if (!permission) {
    return interaction.reply({ content: '❌ Permissão inválida.', ephemeral: true });
  }

  const permissions = new PermissionsBitField(role.permissions.bitfield);
  const currentlyEnabled = hasRawPermission(role, permission.flag);
  if (currentlyEnabled) permissions.remove(permission.flag);
  else permissions.add(permission.flag);

  await role.setPermissions(
    permissions.bitfield,
    `${currentlyEnabled ? 'Remoção' : 'Concessão'} de permissão pelo painel por ${interaction.user.tag}`,
  );

  return interaction.update(buildRolePermissionsDetail(interaction.guild, role.id, third, fourth));
}
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

function usage() {
  return [
    'Uso:',
    '`s cargo add <id, nome ou começo do cargo> @membro`',
    '`s cargo add @membro <id, nome ou começo do cargo>`',
  ].join('\n');
}

function hasManageRoles(context) {
  return context.memberPermissions?.has(PermissionFlagsBits.ManageRoles)
    ?? context.member?.permissions?.has(PermissionFlagsBits.ManageRoles)
    ?? false;
}

function hierarchyError(message, role, member) {
  if (role.managed) return 'Esse cargo é gerenciado pelo Discord e não pode ser atribuído manualmente.';

  const botMember = message.guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position) {
    return 'Meu cargo precisa estar acima do cargo que você quer atribuir.';
  }

  const actor = message.member;
  if (
    actor?.id !== message.guild.ownerId
    && actor?.roles?.highest?.position <= role.position
  ) {
    return 'Seu cargo precisa estar acima do cargo que você quer atribuir.';
  }

  if (member.user.bot && member.id === message.client.user.id) {
    return 'Eu não posso atribuir cargos a mim mesmo.';
  }

  return null;
}

function roleQueryText(value) {
  return String(value ?? '')
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^<@&(\d+)>$/, '$1')
    .trim();
}

function isRoleMention(value) {
  return /^<@&\d+>$/.test(String(value ?? '').trim());
}

function displayRoleName(value) {
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{M}\u00AD\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeRoleName(value) {
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}\p{M}\u00AD\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0]/gu, '')
    .normalize('NFKD')
    // Remove caracteres invisíveis/formatadores usados como prefixo de cargos.
    .replace(/[\p{Cc}\p{Cf}\p{M}\u00AD\u061C\u115F\u1160\u180E\u2800\u3164\uFFA0]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

async function resolveRole(guild, value) {
  const query = roleQueryText(value);
  if (!query) return { error: 'Você precisa informar o ID, o nome ou o começo do nome do cargo.' };

  if (/^\d{5,25}$/.test(query)) {
    const role = await guild.roles.fetch(query).catch(() => null);
    if (!role || role.managed || role.id === guild.id) {
      return { error: `❌ Não encontrei um cargo atribuível com o ID \`${query}\`.` };
    }
    return { role };
  }

  const roles = await guild.roles.fetch().catch(() => guild.roles.cache);
  const manageableRoles = [...roles.values()].filter(role => !role.managed && role.id !== guild.id);
  const normalized = normalizeRoleName(query);
  const exactMatches = manageableRoles.filter(role => normalizeRoleName(role.name) === normalized);
  if (exactMatches.length === 1) return { role: exactMatches[0] };
  if (exactMatches.length > 1) {
    return {
      error: `❌ Existem vários cargos com o nome **${query}**. Use o ID do cargo para escolher exatamente um.`,
    };
  }

  const matches = manageableRoles.filter(role => normalizeRoleName(role.name).startsWith(normalized));
  if (matches.length === 1) return { role: matches[0] };
  if (matches.length > 1) {
    const names = matches
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 8)
      .map(role => `\`${role.name}\``)
      .join(', ');
    return {
      error: `❌ Mais de um cargo começa com **${query}**: ${names}. Digite mais letras ou use o ID.`,
    };
  }

  return { error: `❌ Não encontrei um cargo com o nome começando por **${query}**.` };
}

async function addRole(context, role, member, { mentionRole = false } = {}) {
  if (!hasManageRoles(context)) {
    return context.reply('❌ Você precisa da permissão **Gerenciar Cargos** para usar este comando.');
  }

  const hierarchy = hierarchyError(context, role, member);
  if (hierarchy) return context.reply(`❌ ${hierarchy}`);

  const roleLabel = mentionRole ? `<@&${role.id}>` : `**${displayRoleName(role.name)}**`;
  const memberLabel = `<@${member.id}>`;
  const allowedMentions = {
    roles: mentionRole ? [role.id] : [],
    users: [member.id],
  };

  if (member.roles.cache.has(role.id)) {
    try {
      await member.roles.remove(role, `Cargo removido por ${context.user?.tag ?? context.author.tag}`);
      return context.reply({
        content: `✅ O cargo ${roleLabel} foi removido de ${memberLabel}.`,
        allowedMentions,
      });
    } catch (error) {
      console.error('[CARGO REMOVE]', error);
      return context.reply('❌ Não consegui remover esse cargo. Verifique minhas permissões e a hierarquia dos cargos.');
    }
  }

  try {
    await member.roles.add(role, `Cargo atribuído por ${context.user?.tag ?? context.author.tag}`);
    return context.reply({
      content: `✅ O cargo ${roleLabel} foi atribuído a ${memberLabel}.`,
      allowedMentions,
    });
  } catch (error) {
    console.error('[CARGO ADD]', error);
    return context.reply('❌ Não consegui atribuir esse cargo. Verifique minhas permissões e a hierarquia dos cargos.');
  }
}

async function executeSlashAdd(interaction) {
  const roleQuery = interaction.options.getString('cargo');
  const resolved = await resolveRole(interaction.guild, roleQuery);
  if (resolved.error) return interaction.reply({ content: resolved.error, ephemeral: true });

  const user = interaction.options.getUser('membro');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.reply({ content: '❌ Esse membro não está neste servidor.', ephemeral: true });
  return addRole(interaction, resolved.role, member, { mentionRole: isRoleMention(roleQuery) });
}

export default {
  data: new SlashCommandBuilder()
    .setName('cargo')
    .setDescription('Gerencia cargos do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Atribui um cargo a um membro')
        .addStringOption(option =>
          option
            .setName('cargo')
            .setDescription('ID, nome completo ou começo do nome do cargo')
            .setRequired(true),
        )
        .addUserOption(option =>
          option.setName('membro').setDescription('Membro que receberá o cargo').setRequired(true),
        ),
    ),
  name: 'cargo',
  aliases: ['cargos', 'role'],

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'add') return;
    return executeSlashAdd(interaction);
  },

  async executePrefix(message, args) {
    if (args[0]?.toLowerCase() !== 'add') return message.reply(usage());

    const mentionedMember = message.mentions.members.first();
    const mentionedUser = message.mentions.users.first();
    const member = mentionedMember
      ?? (mentionedUser
        ? await message.guild.members.fetch(mentionedUser.id).catch(() => null)
        : null);

    if (!member) return message.reply(usage());

    const roleMention = message.mentions.roles.first();
    const memberMentionPattern = new RegExp(`^<@!?${member.id}>$`);
    const roleQuery = roleMention?.id
      ?? args
        .slice(1)
        .filter(token => !memberMentionPattern.test(token))
        .join(' ');
    const resolved = await resolveRole(message.guild, roleQuery);
    if (resolved.error) return message.reply(resolved.error);
    return addRole(message, resolved.role, member, { mentionRole: Boolean(roleMention) });
  },
};

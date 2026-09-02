import { SlashCommandBuilder } from 'discord.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

const FLAG_LABELS = {
  ActiveDeveloper: 'Desenvolvedor ativo',
  BugHunterLevel1: 'Bug Hunter',
  BugHunterLevel2: 'Bug Hunter nível 2',
  CertifiedModerator: 'Moderador certificado',
  HypeSquadOnlineHouse1: 'Bravery',
  HypeSquadOnlineHouse2: 'Brilliance',
  HypeSquadOnlineHouse3: 'Balance',
  PremiumEarlySupporter: 'Apoiador inicial',
  Staff: 'Equipe do Discord',
  VerifiedBot: 'Bot verificado',
  VerifiedDeveloper: 'Desenvolvedor verificado',
};

function displayName(user, member) {
  return member?.displayName ?? user.globalName ?? user.username;
}

function formatDate(timestamp) {
  return timestamp ? `<t:${Math.floor(timestamp / 1000)}:F>` : 'Não disponível';
}

function buildPayload(user, member, guild) {
  const name = displayName(user, member);
  const roles = member
    ? member.roles.cache
      .filter(role => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString())
      .slice(0, 15)
    : [];
  const flags = user.flags?.toArray?.()
    .map(flag => FLAG_LABELS[flag] ?? flag)
    .filter(Boolean) ?? [];

  const roleText = roles.length
    ? `${roles.join(', ')}${member.roles.cache.size - 1 > roles.length ? ` e mais ${member.roles.cache.size - roles.length - 1}` : ''}`
    : 'Nenhum cargo além do padrão';
  const flagText = flags.length ? flags.join(', ') : 'Nenhuma';
  const memberType = user.bot ? 'Bot' : 'Usuário';

  const text = [
    `## ${name}`,
    '',
    `**Tipo:** ${memberType}`,
    `**Nome de usuário:** @${user.username}`,
    `**ID:** \`${user.id}\``,
    `**Conta criada:** ${formatDate(user.createdTimestamp)}`,
    member ? `**Entrou no servidor:** ${formatDate(member.joinedTimestamp)}` : '**Membro do servidor:** Não',
    `**Badges:** ${flagText}`,
    `**Cargos:** ${roleText}`,
  ].join('\n');

  return buildUtilityV2({
    text,
    thumbnailUrl: user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: false }),
  });
}

async function resolveMember(guild, user) {
  return guild.members.cache.get(user.id)
    ?? await guild.members.fetch(user.id).catch(() => null);
}

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informações públicas de um usuário')
    .setDMPermission(false)
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuário que você quer consultar')
        .setRequired(false),
    ),
  name: 'userinfo',
  aliases: ['user-info', 'perfil-usuario', 'perfil-info'],

  async execute(interaction) {
    const user = interaction.options.getUser('usuario') ?? interaction.user;
    const member = await resolveMember(interaction.guild, user);
    return interaction.reply(buildPayload(user, member, interaction.guild));
  },

  async executePrefix(message) {
    if (!message.guild) return message.reply('❌ Esse comando só pode ser usado em um servidor.');

    const user = message.mentions.users.first() ?? message.author;
    const member = await resolveMember(message.guild, user);
    return message.reply(buildPayload(user, member, message.guild));
  },
};
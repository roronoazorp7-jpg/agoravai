import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import prisma from '../../database/client.js';
import { COMMAND_BLOCK_ALL, scopeLabel } from '../../utils/commandBlock.js';

const TARGETS = [
  { type: 'channel', option: 'canal', label: 'canal' },
  { type: 'role', option: 'cargo', label: 'cargo' },
  { type: 'user', option: 'pessoa', label: 'pessoa' },
];

function targetFrom(interaction) {
  const selected = [
    { ...TARGETS[0], value: interaction.options.getChannel('canal') },
    { ...TARGETS[1], value: interaction.options.getRole('cargo') },
    { ...TARGETS[2], value: interaction.options.getUser('pessoa') },
  ].filter(target => target.value);
  if (selected.length !== 1) return null;
  const target = selected[0];
  return { ...target, scopeId: target.value.id };
}

function commandNameFrom(interaction) {
  return interaction.options.getString('comando').trim().toLowerCase().replace(/^\//, '');
}

function commandText(name) {
  return name === COMMAND_BLOCK_ALL ? 'todos os comandos' : `\`/${name}\``;
}

function usage() {
  return [
    '**Como usar:**',
    '`/bloqueio adicionar comando:perfil canal:#geral`',
    '`/bloqueio excecao comando:perfil cargo:@Moderador`',
    '`/bloqueio remover comando:perfil pessoa:@Membro`',
    '`/bloqueio listar comando:perfil`',
    '',
    'Escolha exatamente um alvo: canal, cargo ou pessoa. Use `*` em comando para todos os comandos.',
  ].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('bloqueio')
    .setDescription('Bloqueia comandos por canal, cargo ou pessoa')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option => option
      .setName('acao')
      .setDescription('O que deseja fazer')
      .setRequired(true)
      .addChoices(
        { name: 'Adicionar bloqueio', value: 'adicionar' },
        { name: 'Adicionar exceção', value: 'excecao' },
        { name: 'Remover regra', value: 'remover' },
        { name: 'Listar regras', value: 'listar' },
      ))
    .addStringOption(option => option
      .setName('comando')
      .setDescription('Nome do comando sem / ou * para todos')
      .setRequired(true)
      .setMaxLength(64))
    .addChannelOption(option => option
      .setName('canal')
      .setDescription('Canal onde a regra será aplicada')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum))
    .addRoleOption(option => option
      .setName('cargo')
      .setDescription('Cargo ao qual a regra será aplicada'))
    .addUserOption(option => option
      .setName('pessoa')
      .setDescription('Pessoa à qual a regra será aplicada')),
  name: 'bloqueio',

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ content: 'Este módulo só funciona dentro de um servidor.', ephemeral: true });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Você precisa da permissão Gerenciar Servidor.', ephemeral: true });
    }

    const action = interaction.options.getString('acao');
    const commandName = commandNameFrom(interaction);

    if (action === 'listar') {
      const target = targetFrom(interaction);
      const rules = await prisma.commandBlockRule.findMany({
        where: {
          guildId: interaction.guildId,
          ...(commandName === COMMAND_BLOCK_ALL ? {} : { commandName }),
          ...(target ? { scopeType: target.type, scopeId: target.scopeId } : {}),
        },
        orderBy: [{ commandName: 'asc' }, { scopeType: 'asc' }],
      });
      if (!rules.length) return interaction.reply({ content: 'Nenhuma regra encontrada.', ephemeral: true });
      const lines = rules.map(rule => {
        const mode = rule.isException ? 'EXCEÇÃO' : 'BLOQUEIO';
        const command = commandText(rule.commandName);
        const targetText = rule.scopeType === 'channel'
          ? `<#${rule.scopeId}>`
          : rule.scopeType === 'role' ? `<@&${rule.scopeId}>` : `<@${rule.scopeId}>`;
        return `• **${mode}** ${command} → ${scopeLabel(rule.scopeType)} ${targetText}`;
      });
      return interaction.reply({ content: `## Regras de comandos\n${lines.join('\n')}`, ephemeral: true });
    }

    const target = targetFrom(interaction);
    if (!target) return interaction.reply({ content: usage(), ephemeral: true });

    const isException = action === 'excecao';
    if (action === 'remover') {
      const deleted = await prisma.commandBlockRule.deleteMany({
        where: {
          guildId: interaction.guildId,
          commandName,
          scopeType: target.type,
          scopeId: target.scopeId,
        },
      });
      return interaction.reply({
        content: deleted.count
          ? `Regra removida para ${commandText(commandName)} no ${target.label}.`
          : 'Não encontrei uma regra com esses dados.',
        ephemeral: true,
      });
    }

    await prisma.commandBlockRule.upsert({
      where: {
        guildId_commandName_scopeType_scopeId_isException: {
          guildId: interaction.guildId,
          commandName,
          scopeType: target.type,
          scopeId: target.scopeId,
          isException,
        },
      },
      create: {
        guildId: interaction.guildId,
        commandName,
        scopeType: target.type,
        scopeId: target.scopeId,
        isException,
      },
      update: {},
    });
    return interaction.reply({
      content: `${isException ? 'Exceção adicionada' : 'Bloqueio adicionado'} para ${commandText(commandName)} no ${target.label}.`,
      ephemeral: true,
    });
  },
};
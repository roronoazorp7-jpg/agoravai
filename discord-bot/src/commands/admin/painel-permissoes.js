import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  buildRolePermissionsHome,
} from '../../utils/rolePermissionsPanel.js';

export default {
  data: new SlashCommandBuilder()
    .setName('painel-permissoes')
    .setDescription('Consulta e altera as permissões dos cargos do servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  name: 'painel-permissoes',
  aliases: ['permissoes'],

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: '❌ Você precisa da permissão **Gerenciar Cargos** para usar este comando.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      ...buildRolePermissionsHome(interaction.guild),
      ephemeral: true,
    });
  },

  async executePrefix(message) {
    if (!message.guild || !message.member?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ Você precisa da permissão **Gerenciar Cargos** para usar este comando.');
    }

    try {
      return await message.channel.send(buildRolePermissionsHome(message.guild));
    } catch (error) {
      console.error('[PERMISSIONS PANEL PREFIX]', error);
      throw error;
    }
  },
};
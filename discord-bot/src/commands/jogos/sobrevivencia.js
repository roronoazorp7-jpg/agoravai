import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createSurvivalGame, buildSurvivalPayload } from '../../utils/survivalGame.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sobrevivencia')
    .setDescription('🏕️ Abre uma expedição cooperativa de sobrevivência')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  name: 'sobrevivencia',
  aliases: ['sobreviver', 'expedicao'],

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: '❌ Apenas administradores podem abrir uma expedição.', ephemeral: true });
    }

    const game = createSurvivalGame({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      hostName: interaction.member?.displayName ?? interaction.user.username,
    });

    try {
      const message = await interaction.channel.send(buildSurvivalPayload(game));
      game.messageId = message.id;
      return interaction.reply({
        content: '✅ Expedição publicada! Os membros podem clicar em **Participar**.',
        ephemeral: true,
      });
    } catch (error) {
      console.error('[SURVIVAL] Falha ao publicar expedição:', error);
      return interaction.reply({ content: '❌ Não consegui publicar a expedição neste canal.', ephemeral: true });
    }
  },
};
import { ChannelType, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  buildSurvivalPayload,
  createSurvivalGame,
  removeSurvivalGame,
} from '../../utils/survivalGame.js';

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

    let gameChannel;
    let game;
    try {
      const baseName = (interaction.member?.displayName ?? interaction.user.username)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 18) || 'grupo';
      const parentId = interaction.channel?.parent?.type === ChannelType.GuildCategory
        ? interaction.channel.parentId
        : undefined;

      gameChannel = await interaction.guild.channels.create({
        name: `expedicao-${baseName}`,
        type: ChannelType.GuildText,
        parent: parentId,
        topic: 'Canal temporário da expedição de sobrevivência. Ele será removido após o término da partida.',
        permissionOverwrites: [
          {
            id: interaction.guild.roles.everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
          },
          {
            id: interaction.client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },
        ],
      });

      game = createSurvivalGame({
        guildId: interaction.guildId,
        channelId: gameChannel.id,
        hostId: interaction.user.id,
        hostName: interaction.member?.displayName ?? interaction.user.username,
        client: interaction.client,
        temporaryChannel: true,
      });

      const message = await gameChannel.send(buildSurvivalPayload(game));
      game.messageId = message.id;
      return interaction.reply({
        content: `✅ Expedição criada em ${gameChannel}. Os membros podem clicar em **Participar**.`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('[SURVIVAL] Falha ao publicar expedição:', error);
      if (game) removeSurvivalGame(game.id);
      if (gameChannel) await gameChannel.delete('Falha ao publicar a expedição').catch(() => {});
      return interaction.reply({
        content: '❌ Não consegui criar o canal temporário da expedição. Verifique se o bot tem **Gerenciar Canais**, **Ver Canal**, **Enviar Mensagens** e **Anexar Arquivos**.',
        ephemeral: true,
      });
    }
  },
};
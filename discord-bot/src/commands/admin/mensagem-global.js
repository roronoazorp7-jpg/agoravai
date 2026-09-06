import { SlashCommandBuilder } from 'discord.js';
import {
  createMsgSession,
  buildMsgPayload,
  buildMsgMainControls,
} from '../../utils/messageSessions.js';
import {
  GLOBAL_MESSAGE_OWNER_ID,
  isGlobalMessageOwner,
  getGlobalMessageJob,
  buildGlobalMessageStatusPayload,
} from '../../utils/globalMessage.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mensagem-global')
    .setDescription('📣 Monta e envia uma mensagem por DM para os membros dos servidores do bot'),
  name: 'mensagem-global',

  async execute(interaction) {
    if (!isGlobalMessageOwner(interaction.user.id)) {
      return interaction.reply({ content: '❌ Este painel é exclusivo do proprietário do bot.', ephemeral: true });
    }

    const currentJob = getGlobalMessageJob(GLOBAL_MESSAGE_OWNER_ID);
    if (currentJob?.status === 'running' || currentJob?.status === 'collecting') {
      return interaction.reply({ ...buildGlobalMessageStatusPayload(currentJob), ephemeral: true });
    }

    if (!interaction.guild || !interaction.channel?.send) {
      return interaction.reply({ content: '❌ Abra este painel dentro de um servidor.', ephemeral: true });
    }

    const session = createMsgSession(interaction.user.id, interaction.guildId, { globalMode: true });

    let previewMessage;
    try {
      previewMessage = await interaction.channel.send(buildMsgPayload(session));
    } catch (error) {
      console.error('[GLOBAL MESSAGE] Falha ao criar prévia:', error);
      return interaction.reply({ content: '❌ Não consegui criar a prévia neste canal.', ephemeral: true });
    }

    session.previewMessageId = previewMessage.id;
    session.previewChannelId = previewMessage.channelId;

    return interaction.reply({
      content:
        '📣 **Painel de Mensagem Global**\n' +
        'Monte a mensagem na prévia abaixo. Os botões de cargos ficam desativados porque o envio será por DM para membros de servidores diferentes.\n' +
        'Quando terminar, clique em **Enviar para todos**.',
      components: buildMsgMainControls(session),
      ephemeral: true,
    });
  },
};
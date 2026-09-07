import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
} from 'discord.js';
import { GLOBAL_MESSAGE_OWNER_ID } from '../../utils/globalMessage.js';

const BOT_OWNER_ID = GLOBAL_MESSAGE_OWNER_ID;
const LEAVE_BUTTON_PREFIX = 'bot_leave_';

function isBotOwner(userId) {
  return userId === BOT_OWNER_ID;
}

function getGuildIdFromButton(customId) {
  const [buttonId, actorId, guildId] = customId.split(':');
  const action = buttonId.slice(LEAVE_BUTTON_PREFIX.length);
  return { action, actorId, guildId };
}

function findGuild(client, guildId) {
  return client.guilds.cache.get(guildId)
    ?? client.guilds.fetch(guildId).catch(() => null);
}

function leaveConfirmationRow(actorId, guildId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${LEAVE_BUTTON_PREFIX}confirm:${actorId}:${guildId}`)
      .setLabel('Confirmar saída')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`${LEAVE_BUTTON_PREFIX}cancel:${actorId}:${guildId}`)
      .setLabel('Cancelar')
      .setStyle(ButtonStyle.Secondary),
  );
}

function guildChoices(client, query) {
  const normalizedQuery = query.trim().toLowerCase();

  return [...client.guilds.cache.values()]
    .filter(guild => (
      !normalizedQuery
      || guild.name.toLowerCase().includes(normalizedQuery)
      || guild.id.includes(normalizedQuery)
    ))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    .slice(0, 25)
    .map(guild => ({
      name: `${guild.name.slice(0, 78)} (${guild.id})`,
      value: guild.id,
    }));
}

export async function handleBotLeaveInteraction(interaction, client) {
  const { action, actorId, guildId } = getGuildIdFromButton(interaction.customId);

  if (!isBotOwner(interaction.user.id) || interaction.user.id !== actorId) {
    return interaction.reply({
      content: '❌ Este controle é exclusivo do proprietário do bot.',
      ephemeral: true,
    });
  }

  if (action === 'cancel') {
    return interaction.update({
      content: '✅ Saída cancelada. O bot continua nos servidores.',
      components: [],
    });
  }

  if (action !== 'confirm') return;

  const guild = await findGuild(client, guildId);
  if (!guild) {
    return interaction.update({
      content: '❌ Não encontrei esse servidor entre os servidores do bot.',
      components: [],
    });
  }

  await interaction.update({
    content: `⏳ Saindo de **${guild.name}**...`,
    components: [],
  });

  try {
    await guild.leave();
  } catch (error) {
    console.error(`[BOT] Falha ao sair do servidor ${guild.id}:`, error);
    return interaction.editReply({
      content: `❌ Não consegui sair de **${guild.name}**. Verifique os logs do bot.`,
      components: [],
    });
  }

  return interaction.editReply({
    content: `✅ O bot saiu do servidor **${guild.name}**.`,
    components: [],
  }).catch(() => null);
}

export default {
  data: new SlashCommandBuilder()
    .setName('bot')
    .setDescription('Ferramentas exclusivas do proprietário do bot')
    .addSubcommand(subcommand => subcommand
      .setName('remover')
      .setDescription('Remove o bot do servidor escolhido')
      .addStringOption(option => option
        .setName('servidor')
        .setDescription('Servidor do qual o bot deverá sair')
        .setRequired(true)
        .setAutocomplete(true))),
  name: 'bot',
  aliases: [],

  async autocomplete(interaction, client) {
    if (!isBotOwner(interaction.user.id)) {
      return interaction.respond([]);
    }

    return interaction.respond(
      guildChoices(client, interaction.options.getString('servidor') ?? ''),
    );
  },

  async execute(interaction, client) {
    if (!isBotOwner(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Este comando é exclusivo do proprietário do bot.',
        ephemeral: true,
      });
    }

    if (interaction.options.getSubcommand() !== 'remover') return;

    const guildId = interaction.options.getString('servidor', true).trim();
    const guild = await findGuild(client, guildId);
    if (!guild) {
      return interaction.reply({
        content: '❌ Não encontrei esse servidor. Escolha uma opção do autocomplete ou informe um ID válido.',
        ephemeral: true,
      });
    }

    return interaction.reply({
      content:
        `⚠️ Você escolheu remover o bot de **${guild.name}** (\`${guild.id}\`).\n` +
        'Confirme abaixo para concluir. Essa ação não pode ser desfeita pelo bot.',
      components: [leaveConfirmationRow(interaction.user.id, guild.id)],
      ephemeral: true,
    });
  },
};

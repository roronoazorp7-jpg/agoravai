import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const CLIENT_PATH = 'discord-bot/rpc-client';
const REPOSITORY_URL = 'https://github.com/roronoazorp7-jpg/agoravai/tree/main/discord-bot/rpc-client';

function buildInstructions(clientId) {
  return [
    '## Rich Presence individual',
    '',
    'O RPC real aparece no seu perfil do Discord Desktop e precisa de um pequeno cliente local.',
    'Ele não usa token de usuário nem selfbot.',
    '',
    '**Presenced para PS3/Wii U:**',
    'Use `/painel` → Abrir Funções → Presenced para configurar o console e baixar o arquivo pronto.',
    'Depois salve o anexo na pasta `discord-bot/rpc-client`, abra o Discord Desktop e execute `npm run presenced`.',
    '',
    '**Como ativar:**',
    `1. Baixe ou clone o repositório: ${REPOSITORY_URL}`,
    `2. Entre na pasta \`${CLIENT_PATH}\``,
    '3. Copie `.env.example` para `.env`',
    `4. Use este ID em \`DISCORD_APPLICATION_ID\`: \`${clientId}\``,
    '5. Abra o Discord Desktop e execute `npm start`',
    '',
    '**Personalização:** edite `RPC_DETAILS`, `RPC_STATE`, imagens e botões no `.env`.',
    'Use `npm run clear` para remover o RPC.',
  ].join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('rpc')
    .setDescription('Mostra como ativar um Rich Presence individual'),
  name: 'rpc',
  aliases: ['richpresence'],

  async execute(interaction, client) {
    return interaction.reply({
      content: buildInstructions(client.user.id),
      flags: MessageFlags.Ephemeral,
    });
  },

  async executePrefix(message, args, client) {
    return message.reply(buildInstructions(client.user.id));
  },
};
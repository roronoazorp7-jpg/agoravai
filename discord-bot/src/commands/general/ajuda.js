import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';

// ─── Definição das categorias ─────────────────────────────────────────────────

const CATEGORIES = [
  {
    value: 'economia',
    label: 'Economia',
    description: 'Comandos de economia',
    emoji: '💰',
    title: '💰 Comandos de Economia',
    commandNames: [
      'saldo', 'daily', 'trabalho', 'roubar', 'pagar', 'top', 'depositar',
      'sacar', 'pescar', 'pesca', 'carteira', 'jogo',
    ],
  },
  {
    value: 'loja',
    label: 'Loja & Perfil',
    description: 'Banners, pets e personalização',
    emoji: '🛒',
    title: '🛒 Loja & Perfil',
    commandNames: ['loja', 'vip', 'perfil', 'bio', 'pet', 'conquista'],
  },
  {
    value: 'interacao',
    label: 'Interação',
    description: 'Comandos de interação social',
    emoji: '💬',
    title: '💬 Comandos de Interação',
    commandNames: ['interacao', 'amigo', 'casamento', 'casar', 'divorciar'],
  },
  {
    value: 'utilidades',
    label: 'Utilidades',
    description: 'Comandos gerais e ferramentas',
    emoji: '🔧',
    title: '🔧 Utilidades',
    commandNames: [
      'ajuda', 'ping', 'call', 'musica', 'radio', 'instagram', 'ia', 'quest',
      'afk', 'avatar', 'banner', 'server-info', 'reputacao',
    ],
  },
  {
    value: 'admin',
    label: 'Administração',
    description: 'Comandos exclusivos para admins',
    emoji: '⚙️',
    title: '⚙️ Administração',
    commandNames: [
      'boas-vindas', 'container', 'criar-banner', 'criar-pet', 'drop',
      'editar-mensagem', 'editar-pet', 'montar-mensagem', 'painel-cargos',
      'painel', 'personalizar', 'remover-banner', 'status', 'sync', 'drop',
      'cargo', 'ban', 'kick', 'mute',
      'parceria', 'tellonym', 'ticket',
    ],
  },
];

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildSelectMenu() {
  const sel = new StringSelectMenuBuilder()
    .setCustomId('ajuda_cat_sel')
    .setPlaceholder('📂 Selecione uma categoria');

  for (const cat of CATEGORIES) {
    sel.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(cat.label)
        .setValue(cat.value)
        .setDescription(cat.description)
        .setEmoji(cat.emoji)
    );
  }

  return new ActionRowBuilder().addComponents(sel);
}

function formatOptions(options = []) {
  return options
    .filter(option => option.type !== 1 && option.type !== 2)
    .map(option => option.required ? `<${option.name}>` : `[${option.name}]`)
    .join(' ');
}

function commandEntries(commandName, client) {
  const command = client?.commands?.get(commandName);
  const data = command?.data?.toJSON?.();
  if (!data) return [];

  const subcommands = (data.options ?? []).filter(option => option.type === 1);
  if (!subcommands.length) {
    return [{
      cmd: `/${data.name}${formatOptions(data.options) ? ` ${formatOptions(data.options)}` : ''}`,
      desc: data.description,
    }];
  }

  return subcommands.map(subcommand => {
    const options = formatOptions(subcommand.options);
    return {
      cmd: `/${data.name} ${subcommand.name}${options ? ` ${options}` : ''}`,
      desc: subcommand.description,
    };
  });
}

function categoryEntries(category, client) {
  return category.commandNames.flatMap(commandName => commandEntries(commandName, client));
}

function buildInitialContainer(client) {
  const catList = CATEGORIES
    .map(c => `${c.emoji} **${c.label}** — ${c.description} (${categoryEntries(c, client).length})`)
    .join('\n');
  const text = `## 📖 Central de Ajuda\n\nSelecione uma categoria abaixo para ver os comandos disponíveis.\n\n${catList}\n\n-# [] = Obrigatório  () = Opcional`;

  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
}

function buildCategoryContainer(catValue, client) {
  const cat = CATEGORIES.find(c => c.value === catValue);
  if (!cat) return null;

  const entries = categoryEntries(cat, client);
  const lines = entries.length
    ? entries.map(c => `↳ \`${c.cmd}\`\n  ↪ ${c.desc}`).join('\n')
    : '*Nenhum comando disponível nesta categoria.*';

  const text = `## ${cat.title}\n\n**\`[]\` = Obrigatório  \`()\` = Opcional**\n\n${lines}\n\n-# Use /ajuda para voltar ao menu`;

  const c = new ContainerBuilder();
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
  return c;
}

function v2HelpPayload(container) {
  return { components: [container, buildSelectMenu()], flags: MessageFlags.IsComponentsV2 };
}

// ─── Comando ──────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('📖 Lista todos os comandos disponíveis por categoria'),
  name: 'ajuda',
  aliases: ['help', 'comandos'],

  async execute(interaction) {
    const container = buildInitialContainer(interaction.client);
    return interaction.reply({ ...v2HelpPayload(container), ephemeral: true });
  },

  async executePrefix(message) {
    const container = buildInitialContainer(message.client);
    return message.reply(v2HelpPayload(container));
  },
};

// ─── Handler do select menu (chamado pelo interactionCreate) ──────────────────

export async function handleAjudaCatSel(interaction) {
  const catValue  = interaction.values[0];
  const container = buildCategoryContainer(catValue, interaction.client);
  if (!container) return interaction.update({ content: '❌ Categoria não encontrada.', components: [] });

  return interaction.update(v2HelpPayload(container));
}

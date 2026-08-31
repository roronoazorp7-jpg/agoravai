import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} from 'discord.js';
import prisma from '../../database/client.js';
import { BANNERS, buildBannerUrl } from '../../utils/shopData.js';
import { setPending } from '../../utils/dropSessions.js';
import { configuredDropRoleIds } from '../../utils/economyPermissions.js';

const DROP_ROLE_OPTIONS = ['cargo1', 'cargo2', 'cargo3', 'cargo4', 'cargo5'];
const DROP_CONFIGURATOR_ID = '1527094211176828951';

function addLaunchOptions(subcommand) {
  return subcommand
    .setName('lancar')
    .setDescription('Lança um drop no canal')
    .addStringOption(opt =>
      opt.setName('tipo')
        .setDescription('O que vai cair no drop')
        .setRequired(true)
        .addChoices(
          { name: '💰 Moedas',        value: 'coins'         },
          { name: '🎲 Aleatório',     value: 'aleatorio'     },
          { name: '👤 Cargo',         value: 'cargo'         },
          { name: '🖼️ Banner',        value: 'banner'        },
          { name: '🎀 Personalizado', value: 'personalizado' },
        ),
    )
    .addIntegerOption(opt =>
      opt.setName('quantidade')
        .setDescription('Quantidade de moedas (apenas para tipo Moedas)')
        .setMinValue(1)
        .setMaxValue(1_000_000),
    )
    .addStringOption(opt =>
      opt.setName('descricao')
        .setDescription('Texto extra exibido no drop')
        .setMaxLength(300),
    )
    .addStringOption(opt =>
      opt.setName('titulo')
        .setDescription('Título personalizado (padrão: DROP!)')
        .setMaxLength(80),
    )
    .addStringOption(opt =>
      opt.setName('imagem')
        .setDescription('URL de imagem para exibir no drop'),
    );
}

async function canLaunchDrop(interaction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guildId },
    select: { dropAllowedRoles: true },
  });
  const allowedRoleIds = configuredDropRoleIds(config);
  const hasManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (!allowedRoleIds.length) {
    if (!hasManageGuild) {
      await interaction.reply({
        content: '❌ Apenas membros com **Gerenciar Servidor** podem lançar drops. Um administrador pode liberar cargos em `/drop cargos`.',
        ephemeral: true,
      });
      return false;
    }
    return true;
  }

  const hasAllowedRole = allowedRoleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
  if (!hasAllowedRole) {
    await interaction.reply({
      content: '❌ Você não possui um dos cargos autorizados para lançar drops.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function configureDropRoles(interaction) {
  if (interaction.user.id !== DROP_CONFIGURATOR_ID) {
    return interaction.reply({
      content: '❌ Apenas o responsável autorizado pode configurar os cargos permitidos para lançar drops.',
      ephemeral: true,
    });
  }

  const clear = interaction.options.getBoolean('limpar') ?? false;
  const roles = DROP_ROLE_OPTIONS
    .map(optionName => interaction.options.getRole(optionName))
    .filter(Boolean);

  if (clear) {
    await prisma.guildConfig.upsert({
      where: { guildId: interaction.guildId },
      create: { guildId: interaction.guildId, dropAllowedRoles: null },
      update: { dropAllowedRoles: null },
    });
    return interaction.reply({
      content: '✅ Restrição de cargos removida. Agora quem tiver **Gerenciar Servidor** poderá lançar drops, mas todos continuarão respeitando os cooldowns da economia.',
      ephemeral: true,
    });
  }

  if (!roles.length) {
    return interaction.reply({
      content: '❌ Selecione pelo menos um cargo ou use `limpar: Sim` para remover a restrição.',
      ephemeral: true,
    });
  }

  const invalidRole = roles.find(role => role.managed || role.id === interaction.guildId);
  if (invalidRole) {
    return interaction.reply({
      content: '❌ Cargos integrados do Discord e o cargo @everyone não podem ser autorizados.',
      ephemeral: true,
    });
  }

  const roleIds = [...new Set(roles.map(role => role.id))];
  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guildId },
    create: { guildId: interaction.guildId, dropAllowedRoles: roleIds.join(',') },
    update: { dropAllowedRoles: roleIds.join(',') },
  });

  return interaction.reply({
    content: `✅ Cargos autorizados para drops: ${roleIds.map(roleId => `<@&${roleId}>`).join(', ')}.\nMembros com esses cargos também ficam sem cooldown nos comandos de economia e pesca.`,
    ephemeral: true,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('drop')
    .setDescription('🎁 Cria drops e configura os cargos autorizados')
    .addSubcommand(addLaunchOptions)
    .addSubcommand(sub =>
      sub
        .setName('cargos')
        .setDescription('Escolhe os cargos autorizados a lançar drops')
        .addRoleOption(opt => opt.setName('cargo1').setDescription('Primeiro cargo autorizado'))
        .addRoleOption(opt => opt.setName('cargo2').setDescription('Segundo cargo autorizado'))
        .addRoleOption(opt => opt.setName('cargo3').setDescription('Terceiro cargo autorizado'))
        .addRoleOption(opt => opt.setName('cargo4').setDescription('Quarto cargo autorizado'))
        .addRoleOption(opt => opt.setName('cargo5').setDescription('Quinto cargo autorizado'))
        .addBooleanOption(opt =>
          opt.setName('limpar').setDescription('Remove a restrição e volta a exigir Gerenciar Servidor'),
        ),
    ),
  name: 'drop',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'cargos') return configureDropRoles(interaction);
    if (!(await canLaunchDrop(interaction))) return;

    const tipo      = interaction.options.getString('tipo');
    const quantidade = interaction.options.getInteger('quantidade');
    const descricao = interaction.options.getString('descricao');
    const titulo    = interaction.options.getString('titulo');
    const imagem    = interaction.options.getString('imagem');

    // ── Moedas: vai direto ────────────────────────────────────────────────────
    if (tipo === 'coins') {
      if (!quantidade) {
        return interaction.reply({ content: '❌ Informe a **quantidade** de moedas para este drop.', ephemeral: true });
      }
      const { buildDropEmbed } = await import('../../utils/dropHandlers.js');
      const { createDrop }     = await import('../../utils/dropSessions.js');

      const dropId = createDrop({ guildId: interaction.guildId, tipo: 'coins', quantidade, descricao, titulo, imagem });
      const payload = buildDropEmbed({ tipo: 'coins', quantidade, descricao, titulo, imagem, dropId });

      await interaction.reply({ content: '✅ Drop lançado!', ephemeral: true });
      return interaction.channel.send(payload);
    }

    // ── Aleatório: vai direto, prêmio sorteado na hora do resgate ────────────
    if (tipo === 'aleatorio') {
      const { buildDropEmbed } = await import('../../utils/dropHandlers.js');
      const { createDrop }     = await import('../../utils/dropSessions.js');

      const dropId = createDrop({
        guildId: interaction.guildId,
        tipo: 'aleatorio',
        quantidadeMax: quantidade ?? 1000,
        descricao,
        titulo,
        imagem,
      });
      const payload = buildDropEmbed({ tipo: 'aleatorio', descricao, titulo, imagem, dropId });

      await interaction.reply({ content: '✅ Drop aleatório lançado!', ephemeral: true });
      return interaction.channel.send(payload);
    }

    // ── Personalizado: vai direto ─────────────────────────────────────────────
    if (tipo === 'personalizado') {
      if (!descricao) {
        return interaction.reply({ content: '❌ Informe a **descrição** do prêmio para este drop.', ephemeral: true });
      }
      const { buildDropEmbed } = await import('../../utils/dropHandlers.js');
      const { createDrop }     = await import('../../utils/dropSessions.js');

      const dropId = createDrop({ guildId: interaction.guildId, tipo: 'personalizado', descricao, titulo, imagem });
      const payload = buildDropEmbed({ tipo: 'personalizado', descricao, titulo, imagem, dropId });

      await interaction.reply({ content: '✅ Drop lançado!', ephemeral: true });
      return interaction.channel.send(payload);
    }

    // ── Cargo / Banner: mostra gavetinha ─────────────────────────────────────
    await interaction.deferReply({ ephemeral: true });

    // Salva estado pendente (titulo, descricao, imagem, canal)
    setPending(interaction.guildId, interaction.user.id, {
      tipo, titulo, descricao, imagem,
      channelId: interaction.channelId,
    });

    let selectMenu;

    if (tipo === 'cargo') {
      await interaction.guild.roles.fetch();
      const botMember = await interaction.guild.members.fetchMe().catch(() => null);
      const botHighestPos = botMember?.roles?.highest?.position ?? 0;

      const cargos = interaction.guild.roles.cache
        .filter(r =>
          r.id !== interaction.guild.id &&
          !r.managed &&
          r.position < botHighestPos,
        )
        .sort((a, b) => b.position - a.position)
        .toJSON();

      if (!cargos.length) {
        return interaction.editReply({ content: '❌ Nenhum cargo disponível neste servidor.' });
      }

      selectMenu = new StringSelectMenuBuilder()
        .setCustomId('drop_item_sel')
        .setPlaceholder('Escolha o cargo do drop…')
        .addOptions(
          cargos.slice(0, 25).map(c =>
            new StringSelectMenuOptionBuilder()
              .setValue(`cargo:${c.id}:${c.name}`)
              .setLabel(c.name.slice(0, 100))
              .setDescription(`Cargo do servidor`)
              .setEmoji('👤'),
          ),
        );
    } else {
      // banner
      const customBanners = await prisma.customBanner.findMany({
        where: { guildId: interaction.guildId, active: true },
      });

      const allBanners = [
        ...BANNERS,
        ...customBanners.map(c => ({
          key: c.key, name: c.name, description: c.description || '',
          price: c.price, imageUrl: buildBannerUrl(c.imageUrl), emoji: c.emoji,
        })),
      ];

      if (!allBanners.length) {
        return interaction.editReply({ content: '❌ Nenhum banner disponível.' });
      }

      selectMenu = new StringSelectMenuBuilder()
        .setCustomId('drop_item_sel')
        .setPlaceholder('Escolha o banner do drop…')
        .addOptions(
          allBanners.slice(0, 25).map(b => {
            const opt = new StringSelectMenuOptionBuilder()
              .setValue(`banner:${b.key}:${b.name}`)
              .setLabel(b.name.slice(0, 100))
              .setDescription((b.description || `🖼️ Banner`).slice(0, 100));

            const match = String(b.emoji ?? '').match(/^<(a?):([^:>\s]+):(\d+)>$/);
            if (match) opt.setEmoji({ animated: match[1] === 'a', name: match[2], id: match[3] });
            else if (b.emoji) opt.setEmoji(b.emoji);

            return opt;
          }),
        );
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);
    return interaction.editReply({ content: `Escolha o item para o drop:`, components: [row] });
  },

  async executePrefix(message) {
    return message.reply('🎁 Use `/drop lancar` para lançar um drop ou `/drop cargos` para configurar os cargos autorizados.');
  },
};

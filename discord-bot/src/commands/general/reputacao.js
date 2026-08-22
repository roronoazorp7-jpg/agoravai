import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import prisma from '../../database/client.js';

const REP_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_REASON_LENGTH = 160;

export default {
  data: new SlashCommandBuilder()
    .setName('reputacao')
    .setDescription('⭐ Dê um ponto de reputação para outro membro')
    .addUserOption(option =>
      option
        .setName('membro')
        .setDescription('A pessoa que merece sua reputação')
        .setRequired(true),
    )
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Por que essa pessoa merece reputação?')
        .setMaxLength(MAX_REASON_LENGTH)
        .setRequired(false),
    ),
  name: 'reputacao',
  aliases: ['rep', 'reputar'],

  async execute(interaction) {
    const giverId = interaction.user.id;
    const receiver = interaction.options.getUser('membro');
    const reason = interaction.options.getString('motivo')?.trim() || null;

    if (receiver.id === giverId) {
      return interaction.reply({
        content: '❌ Você não pode dar reputação para si mesmo.',
        ephemeral: true,
      });
    }
    if (receiver.bot) {
      return interaction.reply({
        content: '❌ Bots não podem receber reputação.',
        ephemeral: true,
      });
    }

    const receiverMember = await interaction.guild.members.fetch(receiver.id).catch(() => null);
    if (!receiverMember) {
      return interaction.reply({
        content: '❌ Esse membro não está neste servidor.',
        ephemeral: true,
      });
    }

    const previous = await prisma.reputationGive.findUnique({
      where: {
        guildId_giverId_receiverId: {
          guildId: interaction.guildId,
          giverId,
          receiverId: receiver.id,
        },
      },
    }).catch(() => null);

    if (previous) {
      const remaining = REP_COOLDOWN_MS - (Date.now() - previous.lastGivenAt.getTime());
      if (remaining > 0) {
        const hours = Math.ceil(remaining / (60 * 60 * 1000));
        return interaction.reply({
          content: `⏳ Você já deu reputação para ${receiver} recentemente. Tente novamente em aproximadamente **${hours}h**.`,
          ephemeral: true,
        });
      }
    }

    await prisma.$transaction([
      prisma.reputationGive.upsert({
        where: {
          guildId_giverId_receiverId: {
            guildId: interaction.guildId,
            giverId,
            receiverId: receiver.id,
          },
        },
        create: {
          guildId: interaction.guildId,
          giverId,
          receiverId: receiver.id,
          lastGivenAt: new Date(),
        },
        update: { lastGivenAt: new Date() },
      }),
      prisma.userProfile.upsert({
        where: { userId: receiver.id },
        create: { userId: receiver.id, guildId: interaction.guildId, reps: 1 },
        update: { reps: { increment: 1 } },
      }),
    ]);

    const total = await prisma.userProfile.findUnique({
      where: { userId: receiver.id },
      select: { reps: true },
    });
    const giverName = interaction.member?.displayName ?? interaction.user.username;
    const receiverName = receiverMember.displayName ?? receiver.username;

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf2c94c)
          .setTitle('⭐ Reputação concedida!')
          .setDescription(
            `**${giverName}** deu uma reputação para **${receiverName}**!\n\n` +
            `${reason ? `> “${reason}”\n\n` : ''}` +
            `**${receiverName}** agora tem **${total?.reps ?? 1}** pontos de reputação.`,
          )
          .setThumbnail(receiver.displayAvatarURL({ size: 128 }))
          .setFooter({ text: 'Você pode dar reputação para essa pessoa novamente amanhã.' }),
      ],
    });
  },

  async executePrefix(message, args) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Mencione alguém. Exemplo: `savage rep @pessoa`');

    const reason = args
      .filter(arg => !/^<@!?\d+>$/.test(arg))
      .join(' ')
      .trim()
      .slice(0, MAX_REASON_LENGTH) || null;
    const fakeInteraction = {
      user: message.author,
      guild: message.guild,
      guildId: message.guildId,
      member: message.member,
      options: {
        getUser: () => target,
        getString: () => reason,
      },
      reply: payload => message.reply(payload),
    };
    return this.execute(fakeInteraction);
  },
};
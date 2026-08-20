import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { v2Error } from '../../utils/embed.js';
import { buildWeddingCardPayload, getMarriageStats } from '../../utils/weddingCard.js';

async function findMarriageProfile(userId) {
  try {
    return await prisma.userProfile.findUnique({
      where: { userId },
      select: {
        marriedTo: true,
        marriedToName: true,
        marriedAt: true,
      },
    });
  } catch (error) {
    // Bancos antigos podem ainda não ter marriedAt. Os campos do vínculo
    // continuam suficientes para exibir o card e não devem bloquear o comando.
    console.error('[CASAMENTO] Falha ao ler marriedAt; usando perfil compatível:', error);
    return prisma.userProfile.findUnique({
      where: { userId },
      select: {
        marriedTo: true,
        marriedToName: true,
      },
    });
  }
}

function emptyMarriageStats(marriedAt) {
  return {
    kisses: 0,
    hugs: 0,
    gf: 0,
    interactions: 0,
    xp: 0,
    level: 1,
    progressPercent: 0,
    xpMissing: 180,
    callMinutes: 0,
    marriedAt: marriedAt ?? new Date(),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('casamento')
    .setDescription('💍 Mostra o cartão do seu casamento'),
  name: 'casamento',

  async execute(interaction) {
    // Gera a imagem antes de editar a resposta, mas reconhece a interação
    // imediatamente para evitar expiração durante consultas e renderização.
    await interaction.deferReply();

    const profile = await findMarriageProfile(interaction.user.id);

    if (!profile?.marriedTo) {
      return interaction.editReply(v2Error('Você não está casado(a) com ninguém.'));
    }

    const partner = await interaction.client.users.fetch(profile.marriedTo).catch(() => null);
    if (!partner) {
      return interaction.editReply(v2Error('Não consegui encontrar a outra pessoa do casamento.'));
    }

    const [member, partnerMember] = await Promise.all([
      interaction.guild.members.fetch(interaction.user.id).catch(() => null),
      interaction.guild.members.fetch(partner.id).catch(() => null),
    ]);
    let stats;
    try {
      stats = await getMarriageStats(interaction.user.id, partner.id, profile.marriedAt);
    } catch (error) {
      // O card principal não depende da tabela de interações. Se ela estiver
      // atrasada no banco, mostramos o casamento com estatísticas zeradas.
      console.error('[CASAMENTO] Falha ao ler estatísticas:', error);
      stats = emptyMarriageStats(profile.marriedAt);
    }

    const payload = await buildWeddingCardPayload({
      left: {
        id: interaction.user.id,
        displayName: member?.displayName ?? interaction.user.globalName ?? interaction.user.username,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({
          extension: 'png',
          forceStatic: true,
          size: 256,
        }),
      },
      right: {
        id: partner.id,
        displayName: partnerMember?.displayName ?? partner.globalName ?? partner.username,
        username: partner.username,
        avatarUrl: partner.displayAvatarURL({
          extension: 'png',
          forceStatic: true,
          size: 256,
        }),
      },
      stats,
    });
    return interaction.editReply(payload);
  },

  async executePrefix(message) {
    const profile = await findMarriageProfile(message.author.id);
    if (!profile?.marriedTo) return message.reply(v2Error('Você não está casado(a) com ninguém.'));

    const partner = await message.client.users.fetch(profile.marriedTo).catch(() => null);
    if (!partner) return message.reply(v2Error('Não consegui encontrar a outra pessoa do casamento.'));

    const [member, partnerMember] = await Promise.all([
      message.guild.members.fetch(message.author.id).catch(() => null),
      message.guild.members.fetch(partner.id).catch(() => null),
    ]);
    let stats;
    try {
      stats = await getMarriageStats(message.author.id, partner.id, profile.marriedAt);
    } catch (error) {
      console.error('[CASAMENTO] Falha ao ler estatísticas:', error);
      stats = emptyMarriageStats(profile.marriedAt);
    }

    const payload = await buildWeddingCardPayload({
      left: {
        id: message.author.id,
        displayName: member?.displayName ?? message.author.globalName ?? message.author.username,
        username: message.author.username,
        avatarUrl: message.author.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
      },
      right: {
        id: partner.id,
        displayName: partnerMember?.displayName ?? partner.globalName ?? partner.username,
        username: partner.username,
        avatarUrl: partner.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
      },
      stats,
    });
    return message.reply(payload);
  },
};
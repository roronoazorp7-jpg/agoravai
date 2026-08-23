import { SlashCommandBuilder } from 'discord.js';
import prisma from '../../database/client.js';
import { buildUtilityV2 } from '../../utils/utilityV2.js';

const MAX_REASON = 240;
const AFK_MESSAGE_TTL = 40_000;

function reasonFromArgs(args = []) {
  return args.join(' ').trim().slice(0, MAX_REASON) || 'Não especificado';
}

async function replyAndExpire(target, payload) {
  const isInteraction = typeof target.isChatInputCommand === 'function'
    || typeof target.isCommand === 'function';

  if (isInteraction) {
    await target.reply(payload);
    const timer = setTimeout(() => target.deleteReply().catch(() => {}), AFK_MESSAGE_TTL);
    timer.unref?.();
    return target.fetchReply().catch(() => null);
  }

  const sent = await target.reply(payload).catch(() => null);
  if (sent) {
    const timer = setTimeout(() => sent.delete().catch(() => {}), AFK_MESSAGE_TTL);
    timer.unref?.();
  }
  return sent;
}

export async function handleAfkMessage(message) {
  if (!message.guildId || !message.mentions.users.size) return;

  const mentionedIds = [...message.mentions.users.keys()].filter(id => id !== message.author.id);
  if (!mentionedIds.length) return;

  const records = await prisma.userAfk.findMany({
    where: { guildId: message.guildId, userId: { in: mentionedIds } },
  }).catch(() => []);

  if (!records.length) return;

  const mentionedUser = message.mentions.users.get(records[0].userId)
    ?? await message.client.users.fetch(records[0].userId).catch(() => null);
  const lines = records.map(record =>
    `<@${record.userId}> está ausente.\n**Motivo:** ${record.reason || 'Não especificado'}`,
  );

  await replyAndExpire(message, {
    ...buildUtilityV2({
      text: `## Estado ausente\n\n${lines.join('\n\n')}\n\n-# Vou avisar quem você mencionou.`,
      thumbnailUrl: mentionedUser?.displayAvatarURL({ extension: 'png', size: 128 }),
    }),
    allowedMentions: { users: [] },
  });
}

export async function clearAfkOnMessage(message) {
  if (!message.guildId || !message.author?.id) return false;
  const removed = await prisma.userAfk.deleteMany({
    where: { guildId: message.guildId, userId: message.author.id },
  }).catch(() => ({ count: 0 }));

  if (!removed.count) return false;

  await replyAndExpire(message, {
    ...buildUtilityV2({ text: '## Estado ausente desativado\n\nVocê voltou e seu AFK foi removido.' }),
  });
  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Ativa ou desativa seu estado ausente')
    .addStringOption(option =>
      option
        .setName('motivo')
        .setDescription('Motivo do seu AFK (opcional)')
        .setMaxLength(MAX_REASON),
    ),
  name: 'afk',
  aliases: ['xafk'],

  async execute(interaction) {
    if (!interaction.guildId) {
      return replyAndExpire(interaction, buildUtilityV2({ text: '❌ Este comando só pode ser usado em um servidor.' }));
    }
    const reason = interaction.options.getString('motivo');
    const existing = await prisma.userAfk.findUnique({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
    }).catch(() => null);

    if (existing && !reason) {
      await prisma.userAfk.delete({ where: { id: existing.id } }).catch(() => {});
      return replyAndExpire(interaction, buildUtilityV2({ text: '## Estado ausente desativado\n\nVocê voltou e seu AFK foi removido.' }));
    }

    const record = await prisma.userAfk.upsert({
      where: { guildId_userId: { guildId: interaction.guildId, userId: interaction.user.id } },
      create: { guildId: interaction.guildId, userId: interaction.user.id, reason: reasonFromArgs([reason ?? '']) },
      update: { reason: reasonFromArgs([reason ?? '']) },
    });

    return replyAndExpire(interaction, buildUtilityV2({
      text: `## Estado ausente ativado\n\n**Motivo:** ${record.reason}\n\n-# Vou avisar quem mencionar você.`,
      thumbnailUrl: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
    }));
  },

  async executePrefix(message, args) {
    if (!message.guildId) {
      return replyAndExpire(message, buildUtilityV2({ text: '❌ Este comando só pode ser usado em um servidor.' }));
    }
    const existing = await prisma.userAfk.findUnique({
      where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
    }).catch(() => null);

    if (existing && !args.length) {
      await prisma.userAfk.delete({ where: { id: existing.id } }).catch(() => {});
      return replyAndExpire(message, buildUtilityV2({ text: '## Estado ausente desativado\n\nVocê voltou e seu AFK foi removido.' }));
    }

    const reason = reasonFromArgs(args);
    const record = await prisma.userAfk.upsert({
      where: { guildId_userId: { guildId: message.guildId, userId: message.author.id } },
      create: { guildId: message.guildId, userId: message.author.id, reason },
      update: { reason },
    });

    return replyAndExpire(message, buildUtilityV2({
      text: `## Estado ausente ativado\n\n**Motivo:** ${record.reason}\n\n-# Vou avisar quem mencionar você.`,
      thumbnailUrl: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
    }));
  },
};
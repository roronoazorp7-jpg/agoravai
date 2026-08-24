import prisma from '../database/client.js';

export const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_INTERVAL_MS = 2 * 60 * 60 * 1000;

function messageText(message) {
  const embedText = message.embeds
    .flatMap(embed => [
      embed.title,
      embed.description,
      ...(embed.fields ?? []).flatMap(field => [field.name, field.value]),
    ])
    .filter(Boolean)
    .join(' ');
  return `${message.content ?? ''} ${embedText}`.trim();
}

export function isDisboardBumpConfirmation(message) {
  if (!message.guildId || message.author?.id !== DISBOARD_BOT_ID) return false;
  return /\b(?:bump realizado|server bumped|bumped|bump(?:ed)? com sucesso)\b/i.test(messageText(message));
}

export async function handleDisboardBump(message) {
  if (!isDisboardBumpConfirmation(message)) return false;
  const nextAt = new Date(Date.now() + BUMP_INTERVAL_MS);
  const cfg = await prisma.guildConfig.findUnique({ where: { guildId: message.guildId } }).catch(() => null);
  if (!cfg?.bumpEnabled || !cfg.bumpChannel) return true;

  await prisma.guildConfig.update({
    where: { guildId: message.guildId },
    data: { bumpNextAt: nextAt },
  });
  return true;
}

async function checkBumpReminders(client) {
  const due = await prisma.guildConfig.findMany({
    where: { bumpEnabled: true, bumpChannel: { not: null }, bumpNextAt: { lte: new Date() } },
  }).catch(() => []);

  for (const cfg of due) {
    const guild = client.guilds.cache.get(cfg.guildId)
      ?? await client.guilds.fetch(cfg.guildId).catch(() => null);
    const channel = guild?.channels.cache.get(cfg.bumpChannel)
      ?? await guild?.channels.fetch(cfg.bumpChannel).catch(() => null);
    if (!channel?.isTextBased()) continue;

    const sent = await channel.send({
      content: '🔔 **Já está liberado!** Use `/bump` para divulgar o servidor novamente.',
      allowedMentions: { parse: [] },
    }).then(() => true).catch(() => false);
    if (sent) {
      await prisma.guildConfig.update({
        where: { guildId: cfg.guildId },
        data: { bumpNextAt: null },
      }).catch(() => {});
    }
  }
}

export function startBumpReminderScheduler(client) {
  checkBumpReminders(client);
  setInterval(() => checkBumpReminders(client), 60 * 1000);
}
import prisma from '../database/client.js';

export const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 60 * 1000;

function messageText(message) {
  const embedText = (message.embeds ?? [])
    .flatMap(embed => [
      embed.title,
      embed.description,
      ...(embed.fields ?? []).flatMap(field => [field.name, field.value]),
      embed.footer?.text,
      embed.author?.name,
    ])
    .filter(Boolean)
    .join(' ');
  return `${message.content ?? ''} ${embedText}`.trim();
}

export function isDisboardBumpConfirmation(message) {
  if (!message.guildId || message.author?.id !== DISBOARD_BOT_ID) return false;
  const text = messageText(message)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // O DISBOARD varia o texto entre versões/idiomas. A confirmação precisa
  // conter uma frase de sucesso; procurar só por "bump" também captura o
  // aviso de cooldown e agenda lembretes incorretamente.
  const success = /\b(?:bump\s+done|bump\s+(?:successful|successfully|realizado|concluido|feito)|server\s+(?:has\s+been\s+)?bumped|bumped\s+successfully|bump(?:ed)?\s+com\s+sucesso|successfully\s+bumped)\b/i.test(text);
  const cooldown = /\b(?:cooldown|already\s+bumped|try\s+again|available\s+in|wait\s+\d+|can\s+bump\s+again)\b/i.test(text);
  return success && !cooldown;
}

export async function handleDisboardBump(message) {
  if (!isDisboardBumpConfirmation(message)) return false;
  const nextAt = new Date(Date.now() + BUMP_INTERVAL_MS);
  let cfg;
  try {
    cfg = await prisma.guildConfig.findUnique({ where: { guildId: message.guildId } });
  } catch (error) {
    console.error(`[BUMP] erro ao ler configuração de ${message.guildId}:`, error?.message ?? error);
    return true;
  }
  if (!cfg?.bumpEnabled || !cfg.bumpChannel) {
    console.warn(`[BUMP] confirmação recebida, mas o lembrete está desativado ou sem canal (${message.guildId}).`);
    return true;
  }

  try {
    await prisma.guildConfig.update({
      where: { guildId: message.guildId },
      data: { bumpNextAt: nextAt },
    });
    console.log(`[BUMP] próximo lembrete agendado para ${message.guildId}: ${nextAt.toISOString()}`);
  } catch (error) {
    console.error(`[BUMP] não foi possível agendar ${message.guildId}:`, error?.message ?? error);
  }
  return true;
}

export async function checkBumpReminders(client, now = new Date()) {
  let due;
  try {
    due = await prisma.guildConfig.findMany({
      where: { bumpEnabled: true, bumpChannel: { not: null }, bumpNextAt: { lte: now } },
    });
  } catch (error) {
    console.error('[BUMP] erro ao consultar lembretes:', error?.message ?? error);
    return 0;
  }

  let sentCount = 0;
  for (const cfg of due) {
    const guild = client.guilds.cache.get(cfg.guildId)
      ?? await client.guilds.fetch(cfg.guildId).catch(() => null);
    if (!guild) {
      console.warn(`[BUMP] servidor ${cfg.guildId} não está disponível para enviar o lembrete.`);
      continue;
    }
    const channel = guild.channels.cache.get(cfg.bumpChannel)
      ?? await guild.channels.fetch(cfg.bumpChannel).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      console.warn(`[BUMP] canal ${cfg.bumpChannel} não é um canal de texto válido.`);
      continue;
    }

    try {
      await channel.send({
        content: '🔔 **Já está liberado!** Use `/bump` para divulgar o servidor novamente.',
        allowedMentions: { parse: [] },
      });
      await prisma.guildConfig.update({
        where: { guildId: cfg.guildId },
        data: { bumpNextAt: null },
      });
      sentCount += 1;
      console.log(`[BUMP] lembrete enviado em ${cfg.guildId}/${cfg.bumpChannel}.`);
    } catch (error) {
      console.error(`[BUMP] não foi possível enviar em ${cfg.guildId}/${cfg.bumpChannel}:`, error?.message ?? error);
    }
  }
  return sentCount;
}

export function startBumpReminderScheduler(client) {
  checkBumpReminders(client);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await checkBumpReminders(client);
    } finally {
      running = false;
    }
  }, SCHEDULER_INTERVAL_MS);
}
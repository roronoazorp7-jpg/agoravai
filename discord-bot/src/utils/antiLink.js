import { PermissionFlagsBits } from 'discord.js';
import prisma from '../database/client.js';

const URL_REGEX = /(?:https?|hxxps?|ftp):\/\/[^\s<>()]+|www\.[^\s<>()]+|(?<![@\w])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|gg|io|me|tv|co|dev|app|xyz|site|online|shop|store|br|link|ly|fm)(?:\/[^\s<>()]*)?/gi;
const DISCORD_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i;
const SOCIAL_DOMAINS = /(facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|twitch\.tv|telegram\.me|t\.me|whatsapp\.com)/i;
const SHORTENER_DOMAINS = /(bit\.ly|tinyurl\.com|cutt\.ly|t\.co|shorturl\.at|is\.gd|ow\.ly|buff\.ly|rb\.gy)/i;

const list = (value) => String(value ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const deletionBatches = new Map();
const warningCooldowns = new Map();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteWithRetry(message) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await message.delete();
      return true;
    } catch (error) {
      // Discord code 10008 means the message was already removed. Treat it as
      // success so a parallel moderation worker never retries forever.
      if (error?.code === 10008) return true;
      // Missing permissions cannot be fixed by retrying.
      if (error?.code === 50013 || error?.code === 50001) return false;
      if (attempt < 3) await wait(250 * (attempt + 1));
    }
  }
  return false;
}

async function deleteFromChannelBatch(message) {
  const channelId = message.channelId;
  let batch = deletionBatches.get(channelId);
  if (!batch) {
    batch = { messages: [], waiters: [], timer: null };
    deletionBatches.set(channelId, batch);
  }
  batch.messages.push(message);
  const result = new Promise((resolve) => batch.waiters.push(resolve));
  if (!batch.timer) {
    batch.timer = setTimeout(async () => {
      deletionBatches.delete(channelId);
      const messages = [...new Map(batch.messages.map((item) => [item.id, item])).values()];
      const deletedIds = new Set();
      try {
        for (let start = 0; start < messages.length; start += 100) {
          const chunk = messages.slice(start, start + 100);
          const deleted = await message.channel.bulkDelete(chunk.map((item) => item.id), true);
          for (const item of chunk) {
            if (deleted?.has?.(item.id)) deletedIds.add(item.id);
          }
        }
      } catch {
        // If bulk deletion is unavailable, the individual fallback below
        // still retries every message instead of losing the moderation event.
      }
      const missing = messages.filter((item) => !deletedIds.has(item.id));
      const fallback = await Promise.all(missing.map((item) => deleteWithRetry(item)));
      const fallbackIds = new Set(missing.filter((_, index) => fallback[index]).map((item) => item.id));
      const ok = messages.map((item) => deletedIds.has(item.id) || fallbackIds.has(item.id));
      batch.waiters.forEach((resolve, index) => resolve(ok[index] ?? false));
    }, 75);
  }
  return result;
}
const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[\u200b-\u200d\ufeff]/g, '')
  .replace(/\[(?:\.|dot)\]|\((?:\.|dot)\)|\{(?:\.|dot)\}/g, '.')
  .replace(/\s+(?:dot|ponto)\s+/g, '.')
  .replace(/^hxxps?/, 'https')
  .replace(/^https?:\/\//, '')
  .replace(/^ftp:\/\//, '')
  .replace(/^www\./, '');

export function containsBlockedLink(message, cfg) {
  const hasScannableContent = message.content
    || message.embeds?.length
    || message.components?.length;
  if (!cfg?.antiLinkEnabled || !message.guildId || !hasScannableContent) return null;
  if (message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return null;
  if (cfg.partnerChannel && cfg.partnerChannel === message.channelId) return null;
  if (list(cfg.antiLinkAllowedChannels).includes(message.channelId)) return null;
  if (list(cfg.antiLinkAllowedRoles).some((id) => message.member?.roles?.cache?.has(id))) return null;
  const allowed = list(cfg.antiLinkAllowedDomains).map(normalize);
  const extraText = [
    ...(message.embeds ?? []).flatMap((embed) => [
      embed.url, embed.title, embed.description, embed.footer?.text,
      ...(embed.fields ?? []).flatMap((field) => [field.name, field.value]),
    ]),
    ...(message.components ?? []).flatMap((row) => (row.components ?? []).flatMap((component) => [
      component.url, component.label,
    ])),
  ].filter(Boolean).join(' ');
  const scanText = normalize(`${message.content ?? ''} ${extraText}`);
  for (const raw of scanText.match(URL_REGEX) ?? []) {
    const normalized = normalize(raw);
    if (allowed.some((domain) => normalized === domain || normalized.startsWith(`${domain}/`) || normalized.endsWith(`.${domain}`))) continue;
    if (cfg.antiLinkBlockAll) return { url: raw, category: 'links' };
    if (cfg.antiLinkBlockDiscord && DISCORD_REGEX.test(normalized)) return { url: raw, category: 'convite Discord' };
    if (cfg.antiLinkBlockSocial && SOCIAL_DOMAINS.test(normalized)) return { url: raw, category: 'rede social' };
    if (cfg.antiLinkBlockShorteners && SHORTENER_DOMAINS.test(normalized)) return { url: raw, category: 'encurtador' };
  }
  return null;
}

export async function enforceAntiLink(message, cfg) {
  const detected = containsBlockedLink(message, cfg);
  if (!detected) return false;
  const action = cfg.antiLinkAction ?? 'delete_warn';
  // A short batch window lets Discord remove a burst of identical links in
  // one request. Every item missing from the batch is retried individually.
  const deleted = await deleteFromChannelBatch(message);
  let warning = null;
  if (action === 'delete_warn' || action === 'timeout') {
    const warningKey = `${message.guildId}:${message.channelId}:${message.author.id}`;
    const canWarn = !warningCooldowns.has(warningKey);
    if (canWarn) {
      warningCooldowns.set(warningKey, setTimeout(() => warningCooldowns.delete(warningKey), 8_000));
      warning = await message.channel.send(`⚠️ <@${message.author.id}>, links de ${detected.category} não são permitidos aqui.`).catch(() => null);
      if (warning) setTimeout(() => warning.delete().catch(() => {}), 8_000);
    }
  }
  if (action === 'timeout') {
    const member = message.member;
    if (member?.moderatable) await member.timeout(5 * 60 * 1000, 'Anti-link automático').catch(() => {});
  }
  if (!deleted) {
    await message.channel.send(`⚠️ Não consegui apagar um link de <@${message.author.id}>. Verifique a permissão **Gerenciar mensagens** do bot.`).then((warning) => {
      setTimeout(() => warning.delete().catch(() => {}), 8_000);
    }).catch(() => {});
  }
  if (cfg.antiLinkLogChannel) {
    const channel = message.guild.channels.cache.get(cfg.antiLinkLogChannel)
      ?? await message.guild.channels.fetch(cfg.antiLinkLogChannel).catch(() => null);
    await channel?.send(`**Anti-link** · ${message.author.tag} em <#${message.channelId}> · ${detected.category}\n${detected.url}`).catch(() => {});
  }
  return true;
}
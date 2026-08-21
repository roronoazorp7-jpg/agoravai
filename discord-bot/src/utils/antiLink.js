import { PermissionFlagsBits } from 'discord.js';
import prisma from '../database/client.js';

const URL_REGEX = /(?:https?:\/\/|www\.|discord\.gg\/|discord(?:app)?\.com\/invite\/|(?:facebook|instagram|tiktok|twitter|x|youtube|youtu\.be|twitch)\.com\/)[^\s<>()]+/gi;
const DISCORD_REGEX = /(?:discord\.gg|discord(?:app)?\.com\/invite)\//i;
const SOCIAL_DOMAINS = /(facebook\.com|instagram\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|twitch\.tv|telegram\.me|t\.me|whatsapp\.com)/i;
const SHORTENER_DOMAINS = /(bit\.ly|tinyurl\.com|cutt\.ly|t\.co|shorturl\.at|is\.gd|ow\.ly|buff\.ly|rb\.gy)/i;

const list = (value) => String(value ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export function containsBlockedLink(message, cfg) {
  if (!cfg?.antiLinkEnabled || !message.guildId || !message.content) return null;
  if (message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) return null;
  if (cfg.partnerChannel && cfg.partnerChannel === message.channelId) return null;
  if (list(cfg.antiLinkAllowedChannels).includes(message.channelId)) return null;
  if (list(cfg.antiLinkAllowedRoles).some((id) => message.member?.roles?.cache?.has(id))) return null;
  const allowed = list(cfg.antiLinkAllowedDomains).map((domain) => domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''));
  for (const raw of message.content.match(URL_REGEX) ?? []) {
    const normalized = raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (allowed.some((domain) => normalized === domain || normalized.startsWith(`${domain}/`) || normalized.endsWith(`.${domain}`))) continue;
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
  await message.delete().catch(() => {});
  let warning = null;
  if (action === 'delete_warn' || action === 'timeout') {
    warning = await message.channel.send(`⚠️ <@${message.author.id}>, links de ${detected.category} não são permitidos aqui.`).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => {}), 8_000);
  }
  if (action === 'timeout') {
    const member = message.member;
    if (member?.moderatable) await member.timeout(5 * 60 * 1000, 'Anti-link automático').catch(() => {});
  }
  if (cfg.antiLinkLogChannel) {
    const channel = message.guild.channels.cache.get(cfg.antiLinkLogChannel)
      ?? await message.guild.channels.fetch(cfg.antiLinkLogChannel).catch(() => null);
    await channel?.send(`**Anti-link** · ${message.author.tag} em <#${message.channelId}> · ${detected.category}\n${detected.url}`).catch(() => {});
  }
  return true;
}
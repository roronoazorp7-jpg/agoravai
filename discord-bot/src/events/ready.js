import { ActivityType, ChannelType, PermissionFlagsBits } from 'discord.js';
import { registerSlashCommands } from '../utils/loader.js';
import { initEmojis } from '../utils/emojiManager.js';
import prisma from '../database/client.js';
import { startDeathEventScheduler } from '../utils/deathEvent.js';
import { startBumpReminderScheduler } from '../utils/bumpReminder.js';

// ─── VIP expirado ─────────────────────────────────────────────────────────────
const VIP_CALL_CATEGORY_ID = '1546637286559588413';

async function checkExpiredVips(client) {
  try {
    const now     = new Date();
    const expired = await prisma.vipGrant.findMany({ where: { expiresAt: { lte: now } } });
    if (!expired.length) return;
    const expiredOwners = new Set(expired.map(grant => `${grant.guildId}:${grant.userId}`));

    for (const grant of expired) {
      try {
        const guild  = client.guilds.cache.get(grant.guildId)
          ?? await client.guilds.fetch(grant.guildId).catch(() => null);
        if (!guild) continue;
        const member = await guild.members.fetch(grant.userId).catch(() => null);
        if (member && grant.roleId) await member.roles.remove(grant.roleId).catch(() => {});
      } catch {}
    }

    await prisma.vipGrant.deleteMany({ where: { expiresAt: { lte: now } } });

    for (const ownerKey of expiredOwners) {
      const [guildId, userId] = ownerKey.split(':');
      const remaining = await prisma.vipGrant.count({
        where: {
          guildId,
          userId,
          expiresAt: { gt: now },
        },
      });
      if (remaining > 0) continue;

      const guild = client.guilds.cache.get(guildId)
        ?? await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;

      const customRole = await prisma.vipCustomRole.findUnique({
        where: {
          guildId_userId: { guildId, userId },
        },
      });
      if (customRole) {
        const role = guild.roles.cache.get(customRole.roleId)
          ?? await guild.roles.fetch(customRole.roleId).catch(() => null);
        if (role) await role.delete('VIP expirado — cargo estético removido').catch(() => {});
        await prisma.vipCustomRole.delete({ where: { id: customRole.id } }).catch(() => {});
      }

      const call = guild.channels.cache.find(channel => {
        const ownerOverwrite = channel.permissionOverwrites?.cache?.get(userId);
        return channel.type === ChannelType.GuildVoice
          && (
            // Compatibilidade com a versão antiga que tentou usar tópico.
            channel.topic === `vip-call:${guildId}:${userId}`
            || (
              channel.parentId === VIP_CALL_CATEGORY_ID
              && ownerOverwrite?.allow.has(PermissionFlagsBits.Connect)
            )
          );
      });
      if (call) await call.delete('VIP expirado — call temporária removida').catch(() => {});
    }

    console.log(`[VIP] ${expired.length} VIP(s) expirado(s) removidos.`);
  } catch (err) {
    console.error('[VIP] Erro ao checar VIPs expirados:', err);
  }
}

// ─── Ready ────────────────────────────────────────────────────────────────────

export default {
  name: 'clientReady',
  once: true,

  async execute(client) {
    console.log(`🤖 Bot online como ${client.user.tag}`);

    client.user.setPresence({
      status: 'online',
      activities: [{
        name: 'discord.gg/savagge',
        type: ActivityType.Streaming,
        url: 'https://www.twitch.tv/savagge',
      }],
    });

    await checkExpiredVips(client);
    setInterval(() => checkExpiredVips(client), 5 * 60 * 1000);
    startDeathEventScheduler(client);
    startBumpReminderScheduler(client);

    // Registro de comandos e emojis em background (não bloqueia o monitor)
    Promise.all([
      registerSlashCommands(client),
      initEmojis(client),
    ]).then(() => {
      console.log('🟣 Comandos e emojis prontos.');
    }).catch(err => {
      console.error('[SETUP] Erro no registro:', err.message);
    });
  },
};

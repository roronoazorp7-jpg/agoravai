import prisma from '../database/client.js';
import { handleMarriageVoiceStateUpdate } from '../utils/marriageCallTracker.js';

const voiceJoinTimes = new Map();

export default {
  name: 'voiceStateUpdate',
  once: false,

  async execute(oldState, newState) {
    const userId  = newState.id ?? oldState.id;
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!userId || !guildId) return;

    const member = newState.member ?? oldState.member;
    if (member?.user?.bot) return;

    await handleMarriageVoiceStateUpdate(oldState, newState);

    const key = `${userId}_${guildId}`;

    if (!oldState.channelId && newState.channelId) {
      voiceJoinTimes.set(key, Date.now());
      return;
    }

    if (oldState.channelId && !newState.channelId) {
      const joinedAt = voiceJoinTimes.get(key);
      if (!joinedAt) return;
      voiceJoinTimes.delete(key);

      const elapsedMinutes = Math.floor((Date.now() - joinedAt) / 60_000);
      if (elapsedMinutes < 1) return;

      prisma.economy.upsert({
        where:  { userId_guildId: { userId, guildId } },
        create: { userId, guildId, callMinutes: elapsedMinutes },
        update: { callMinutes: { increment: elapsedMinutes } },
      }).catch(() => {});
    }
  },
};

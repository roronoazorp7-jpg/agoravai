import prisma from '../database/client.js';

const voiceStates = new Map();
const pairSessions = new Map();

function stateKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function orderedPair(userAId, userBId) {
  return [userAId, userBId].sort((a, b) => a.localeCompare(b));
}

function pairKey(guildId, userAId, userBId) {
  const [leftId, rightId] = orderedPair(userAId, userBId);
  return `${guildId}:${leftId}:${rightId}`;
}

async function addCallMinutes(userAId, userBId, guildId, minutes) {
  if (minutes <= 0) return;

  const [fromId, toId] = orderedPair(userAId, userBId);
  await prisma.interaction.upsert({
    where: { type_fromId_toId: { type: 'call', fromId, toId } },
    update: { count: { increment: minutes }, guildId },
    create: { type: 'call', fromId, toId, guildId, count: minutes },
  });
}

async function flushPairSession(session, now = Date.now()) {
  const minutes = Math.floor((now - session.lastFlushedAt) / 60_000);
  if (minutes <= 0) return;

  await addCallMinutes(session.userAId, session.userBId, session.guildId, minutes);
  session.lastFlushedAt += minutes * 60_000;
}

function isMemberInChannel(channel, userId) {
  return Boolean(channel?.members?.has?.(userId));
}

export async function handleMarriageVoiceStateUpdate(oldState, newState) {
  const userId = newState.id ?? oldState.id;
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!userId || !guildId) return;

  const member = newState.member ?? oldState.member;
  if (member?.user?.bot) return;

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { marriedTo: true },
  }).catch(() => null);
  const partnerId = profile?.marriedTo;
  const currentStateKey = stateKey(guildId, userId);
  const currentPairKey = partnerId ? pairKey(guildId, userId, partnerId) : null;
  const session = currentPairKey ? pairSessions.get(currentPairKey) : null;
  const newChannelId = newState.channelId ?? null;

  if (session && (!newChannelId || session.channelId !== newChannelId)) {
    await flushPairSession(session).catch(error => {
      console.error('[CASAMENTO CALL] Falha ao salvar minutos do casal:', error);
    });
    pairSessions.delete(currentPairKey);
  }

  if (newChannelId) {
    voiceStates.set(currentStateKey, {
      channelId: newChannelId,
      joinedAt: Date.now(),
    });
  } else {
    voiceStates.delete(currentStateKey);
  }

  if (!partnerId || !newChannelId) return;

  const partnerState = voiceStates.get(stateKey(guildId, partnerId));
  const partnerIsPresent = partnerState?.channelId === newChannelId
    || isMemberInChannel(newState.channel, partnerId);
  if (!partnerIsPresent || pairSessions.has(currentPairKey)) return;

  const [userAId, userBId] = orderedPair(userId, partnerId);
  const now = Date.now();
  pairSessions.set(currentPairKey, {
    guildId,
    userAId,
    userBId,
    channelId: newChannelId,
    lastFlushedAt: now,
  });
}

export function getActiveMarriageCallMinutes(guildId, userAId, userBId) {
  const session = pairSessions.get(pairKey(guildId, userAId, userBId));
  if (!session) return 0;
  return Math.floor((Date.now() - session.lastFlushedAt) / 60_000);
}
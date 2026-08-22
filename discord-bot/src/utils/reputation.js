import prisma from '../database/client.js';

// Evita que vários cliques consecutivos em painéis transformem uma interação
// em uma fonte de XP infinita, sem impedir a progressão normal por comandos.
const interactionCooldowns = new Map();
const INTERACTION_COOLDOWN_MS = 30_000;
const XP_PER_INTERACTION = 8;

export function awardInteractionReputation(interaction) {
  const userId = interaction.user?.id;
  const guildId = interaction.guildId;
  if (!userId || !guildId || interaction.user?.bot) return;

  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const lastAward = interactionCooldowns.get(key) ?? 0;
  if (now - lastAward < INTERACTION_COOLDOWN_MS) return;
  interactionCooldowns.set(key, now);

  Promise.all([
    prisma.economy.upsert({
      where: { userId_guildId: { userId, guildId } },
      create: { userId, guildId, xp: XP_PER_INTERACTION },
      update: { xp: { increment: XP_PER_INTERACTION } },
    }),
    prisma.userProfile.upsert({
      where: { userId },
      create: { userId, guildId, reps: 1 },
      update: { reps: { increment: 1 } },
    }),
  ]).catch(err => {
    console.error('[REPUTAÇÃO] Erro ao registrar interação:', err.message);
  });

  // O mapa é apenas uma proteção em memória; não precisa crescer
  // indefinidamente enquanto o processo estiver online.
  if (interactionCooldowns.size > 10_000) {
    for (const [cooldownKey, timestamp] of interactionCooldowns) {
      if (now - timestamp > INTERACTION_COOLDOWN_MS * 2) interactionCooldowns.delete(cooldownKey);
    }
  }
}
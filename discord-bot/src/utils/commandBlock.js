import prisma from '../database/client.js';

export const COMMAND_BLOCK_COMMAND = 'bloqueio';
export const COMMAND_BLOCK_ALL = '*';

const SCOPE_LABELS = {
  channel: 'canal',
  role: 'cargo',
  user: 'pessoa',
};

function commandNames(commandName) {
  const normalized = String(commandName ?? '').trim().toLowerCase();
  return normalized && normalized !== COMMAND_BLOCK_ALL
    ? [normalized, COMMAND_BLOCK_ALL]
    : [COMMAND_BLOCK_ALL];
}

function memberRoleIds(context) {
  const roles = context.member?.roles;
  if (!roles) return [];
  if (roles.cache) return [...roles.cache.keys()];
  if (Array.isArray(roles)) return roles.map(role => role.id ?? role).filter(Boolean);
  return [];
}

function matchingScopeIds(context) {
  return {
    channel: context.channelId ? [context.channelId] : [],
    user: context.user?.id || context.author?.id ? [context.user?.id ?? context.author.id] : [],
    role: memberRoleIds(context),
  };
}

export async function getCommandBlockRules(context, commandName) {
  if (!context.guildId) return [];
  const names = commandNames(commandName);
  const scopes = matchingScopeIds(context);
  const scopeFilters = Object.entries(scopes)
    .filter(([, ids]) => ids.length)
    .map(([scopeType, scopeIds]) => ({ scopeType, scopeId: { in: scopeIds } }));
  if (!scopeFilters.length) return [];

  return prisma.commandBlockRule.findMany({
    where: {
      guildId: context.guildId,
      commandName: { in: names },
      OR: scopeFilters,
    },
  });
}

export async function isCommandBlocked(context, commandName) {
  const rules = await getCommandBlockRules(context, commandName).catch(() => []);
  if (!rules.length) return null;

  const exception = rules.find(rule => rule.isException);
  if (exception) return null;

  const block = rules.find(rule => !rule.isException);
  if (!block) return null;
  return {
    scopeType: block.scopeType,
    message: `O comando \`/${commandName}\` está bloqueado neste ${SCOPE_LABELS[block.scopeType] ?? 'local'}.`,
  };
}

export function scopeLabel(scopeType) {
  return SCOPE_LABELS[scopeType] ?? scopeType;
}
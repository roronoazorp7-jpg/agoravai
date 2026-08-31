import prisma from '../database/client.js';

export function configuredDropRoleIds(config) {
  return String(config?.dropAllowedRoles ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

export async function hasConfiguredEconomyBypass({ guildId, member, db = prisma }) {
  if (!guildId || !member) return false;

  const config = await db.guildConfig.findUnique({
    where: { guildId },
    select: { dropAllowedRoles: true },
  });
  const allowedRoleIds = configuredDropRoleIds(config);

  return allowedRoleIds.length > 0
    && allowedRoleIds.some(roleId => member.roles?.cache?.has(roleId));
}
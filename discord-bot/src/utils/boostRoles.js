import { PermissionFlagsBits } from 'discord.js';

export function configuredBoostRoleIds(cfg) {
  return (cfg?.boostRoles ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

function manageableRoleIds(member, roleIds) {
  const me = member.guild.members.me;
  return roleIds.filter(id => {
    const role = member.guild.roles.cache.get(id);
    return role
      && !role.managed
      && (!me || role.position < me.roles.highest.position)
      && !member.roles.cache.has(id);
  });
}

export function canManageBoostRoles(guild) {
  const me = guild.members.me;
  return !!me?.permissions.has(PermissionFlagsBits.ManageRoles);
}

export async function grantBoostRoles(member, roleIds) {
  const manageable = manageableRoleIds(member, roleIds);
  if (!manageable.length) return 0;
  await member.roles.add(manageable, 'Cargo de boost configurado no painel');
  return manageable.length;
}

export async function removeBoostRoles(member, roleIds) {
  const removable = roleIds.filter(id => {
    const role = member.guild.roles.cache.get(id);
    const me = member.guild.members.me;
    return role
      && !role.managed
      && member.roles.cache.has(id)
      && (!me || role.position < me.roles.highest.position);
  });
  if (!removable.length) return 0;
  await member.roles.remove(removable, 'Boost do servidor removido');
  return removable.length;
}

export async function syncBoostRoles(guild, roleIds) {
  const members = await guild.members.fetch();
  const boosters = [...members.values()].filter(member => member.premiumSince);
  const results = await Promise.allSettled(
    boosters.map(member => grantBoostRoles(member, roleIds)),
  );

  return {
    boosters: boosters.length,
    assigned: results.reduce(
      (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
      0,
    ),
    failures: results.filter(result => result.status === 'rejected').length,
  };
}
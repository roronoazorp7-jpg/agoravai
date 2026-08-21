import prisma from '../database/client.js';

function configuredRoleIds(cfg) {
  return (cfg?.boostRoles ?? '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

export default {
  name: 'guildMemberUpdate',
  once: false,

  async execute(oldMember, newMember) {
    const startedBoosting = !oldMember.premiumSince && !!newMember.premiumSince;
    const stoppedBoosting = !!oldMember.premiumSince && !newMember.premiumSince;
    if (!startedBoosting && !stoppedBoosting) return;

    try {
      const cfg = await prisma.guildConfig.findUnique({
        where: { guildId: newMember.guild.id },
      });
      const roleIds = configuredRoleIds(cfg);
      if (!roleIds.length) return;

      if (startedBoosting) {
        const manageable = roleIds.filter(id => {
          const role = newMember.guild.roles.cache.get(id);
          const me = newMember.guild.members.me;
          return role && !role.managed && (!me || role.position < me.roles.highest.position);
        });
        if (manageable.length) await newMember.roles.add(manageable, 'Cargo de boost configurado no painel');
      } else {
        const removable = roleIds.filter(id => newMember.roles.cache.has(id));
        if (removable.length) await newMember.roles.remove(removable, 'Boost do servidor removido');
      }
    } catch (err) {
      console.error('[BOOST] Erro ao atualizar cargos de boost:', err.message);
    }
  },
};
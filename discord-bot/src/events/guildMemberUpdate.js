import prisma from '../database/client.js';
import {
  configuredBoostRoleIds,
  grantBoostRoles,
  removeBoostRoles,
} from '../utils/boostRoles.js';

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
      const roleIds = configuredBoostRoleIds(cfg);
      if (!roleIds.length) return;

      if (startedBoosting) {
        await grantBoostRoles(newMember, roleIds);
      } else {
        await removeBoostRoles(newMember, roleIds);
      }
    } catch (err) {
      console.error('[BOOST] Erro ao atualizar cargos de boost:', err.message);
    }
  },
};
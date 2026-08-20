export function totalCoins(economy) {
  return (economy?.balance ?? 0) + (economy?.bank ?? 0);
}

/**
 * Debita primeiro da carteira e, quando necessário, diretamente do banco.
 * Recebe o Prisma client normal ou uma transação Prisma.
 */
export async function spendCoins(db, { userId, guildId, amount }) {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, available: 0 };
  }

  const economy = await db.economy.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId },
    update: {},
  });
  const available = totalCoins(economy);
  if (available < amount) return { ok: false, available };

  const fromBalance = Math.min(economy.balance, amount);
  const fromBank = amount - fromBalance;
  await db.economy.update({
    where: { userId_guildId: { userId, guildId } },
    data: {
      balance: { decrement: fromBalance },
      ...(fromBank > 0 ? { bank: { decrement: fromBank } } : {}),
    },
  });
  return { ok: true, available: available - amount };
}
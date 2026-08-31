---
name: Fishing economy system
description: Isolated fishing economy module with rods, catch inventory, cooldown and V2 interactions.
---

The fishing feature is intentionally separate from the general shop: it uses Economy for coins, but keeps rods and fish inventory in dedicated per-user/per-guild tables.

**Why:** Fishing was requested as an economy activity without changing existing shop, profile, game, or daily/work behavior.

**How to apply:** Keep new fishing buttons and select menus under the `fish_` prefix and route them through the fishing handler; preserve the 5-second cooldown and balanced reward scale unless the user explicitly asks to rebalance it.

## Development database safety

The development PostgreSQL database contains a non-schema `Economy_global_backup` table with existing rows. Prisma `db push` may warn that it would drop this backup table even when the fishing change is additive. The legendary-carp mini-game persists four nullable/round state fields on `FishingProfile`.

**Why:** The fishing feature needed additive state for the legendary-carp attempt, but existing economy backup data must not be removed.

**How to apply:** For future fishing schema updates, prefer additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` changes and regenerate Prisma Client; never use `--accept-data-loss` just to bypass the backup-table warning. On August 31, 2026, the stale schema diff also generated an invalid combined `RENAME CONSTRAINT`/`ADD COLUMN` statement, so targeted additive SQL was the safe path.
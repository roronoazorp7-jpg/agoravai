import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['error'],
});

export async function ensureMarriageSchema() {
  // O schema do Prisma pode ser atualizado antes do banco do Railway.
  // Esta alteração é aditiva e mantém o painel funcionando durante o deploy.
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'GuildConfig'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'GuildConfig'
          AND column_name = 'boostRoles'
      ) THEN
        ALTER TABLE "GuildConfig" ADD COLUMN "boostRoles" TEXT;
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'UserProfile'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'UserProfile'
          AND column_name = 'marriedAt'
      ) THEN
        ALTER TABLE "UserProfile" ADD COLUMN "marriedAt" TIMESTAMP(3);
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserAfk" (
      "id" TEXT NOT NULL,
      "guildId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "reason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "UserAfk_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserAfk_guildId_userId_key"
      ON "UserAfk" ("guildId", "userId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserAfk_guildId_idx"
      ON "UserAfk" ("guildId")
  `);
}

export default prisma;

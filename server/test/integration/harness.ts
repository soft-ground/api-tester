import 'reflect-metadata';
import { PrismaService } from '../../src/prisma/prisma.service';

// The domain services depend only on PrismaService, so we instantiate them directly with a shared
// PrismaService instead of bootstrapping the whole Nest app — that keeps the tests simple and avoids
// relying on decorator-metadata-based DI under the esbuild test transform.
export function newPrisma(): PrismaService {
  return new PrismaService();
}

// Empty every application table (keeps the migrations table) so each test starts clean.
// Schema-agnostic: it discovers tables from the catalog, so it needs no manual list.
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (!rows.length) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

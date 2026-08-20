import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newPrisma, resetDb } from './harness';
import { BackupService } from '../../src/backup/backup.service';
import { EndpointsService } from '../../src/endpoints/endpoints.service';
import { VariablesService } from '../../src/variables/variables.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('backup import (integration)', () => {
  let prisma: PrismaService;
  let backupSvc: BackupService;
  let endpoints: EndpointsService;
  let vars: VariablesService;

  beforeAll(() => {
    prisma = newPrisma();
    backupSvc = new BackupService(prisma);
    endpoints = new EndpointsService(prisma);
    vars = new VariablesService(prisma);
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  it('re-importing a backup never duplicates or deletes existing data (merge-only)', async () => {
    const col = await endpoints.createCollection({ name: 'Bank' });
    await endpoints.createEndpoint({
      name: 'Create account',
      collectionId: col.id,
      method: 'POST',
    });
    await vars.createEnvironment({ name: 'dev', variables: { token: 'abc' } });

    const snapshot = await backupSvc.export();
    // Importing the same data twice must not create duplicates or remove what exists.
    await backupSvc.import(snapshot);
    await backupSvc.import(snapshot);

    const tree = await endpoints.listCollections();
    const banks = tree.filter((c) => c.name === 'Bank');
    expect(banks).toHaveLength(1);
    expect(
      banks[0].endpoints.filter((e) => e.name === 'Create account'),
    ).toHaveLength(1);

    const envs = await vars.listEnvironments();
    expect(envs.filter((e) => e.name === 'dev')).toHaveLength(1);
  });
});

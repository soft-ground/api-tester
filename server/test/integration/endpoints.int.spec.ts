import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newPrisma, resetDb } from './harness';
import { EndpointsService } from '../../src/endpoints/endpoints.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('endpoints (integration)', () => {
  let prisma: PrismaService;
  let svc: EndpointsService;

  beforeAll(() => {
    prisma = newPrisma();
    svc = new EndpointsService(prisma);
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  it('creates an endpoint (defaults to unlocked)', async () => {
    const col = await svc.createCollection({ name: 'Bank' });
    const ep = await svc.createEndpoint({
      name: 'Create account',
      collectionId: col.id,
      method: 'POST',
      path: '/accounts',
    });
    expect(ep.method).toBe('POST');
    expect(ep.locked).toBe(false);
  });

  it('locking persists and is reflected in the collection tree', async () => {
    const col = await svc.createCollection({ name: 'Bank' });
    const ep = await svc.createEndpoint({ name: 'Delete account', collectionId: col.id });

    const locked = await svc.updateEndpoint(ep.id, { name: ep.name, locked: true });
    expect(locked.locked).toBe(true);
    expect((await svc.getEndpoint(ep.id)).locked).toBe(true);

    const tree = await svc.listCollections();
    const summary = tree
      .find((c) => c.id === col.id)!
      .endpoints.find((e) => e.id === ep.id)!;
    expect((summary as { locked?: boolean }).locked).toBe(true);
  });

  it('duplicating copies fields including the locked flag', async () => {
    const col = await svc.createCollection({ name: 'Bank' });
    const ep = await svc.createEndpoint({ name: 'Reset', collectionId: col.id });
    await svc.updateEndpoint(ep.id, { name: ep.name, locked: true });

    const copy = await svc.duplicateEndpoint(ep.id);
    expect(copy.name).toBe('Reset (copy)');
    expect(copy.locked).toBe(true);
  });

  it('deleting removes the endpoint', async () => {
    const ep = await svc.createEndpoint({ name: 'Temp' });
    await svc.deleteEndpoint(ep.id);
    await expect(svc.getEndpoint(ep.id)).rejects.toThrow();
  });
});

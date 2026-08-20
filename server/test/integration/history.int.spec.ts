import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newPrisma, resetDb } from './harness';
import { HistoryService } from '../../src/history/history.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('history export (integration)', () => {
  let prisma: PrismaService;
  let history: HistoryService;

  beforeAll(() => {
    prisma = newPrisma();
    history = new HistoryService(prisma);
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  async function seed() {
    const ok = await prisma.callHistory.create({
      data: {
        reqMethod: 'POST',
        reqUrl: 'http://x/a',
        resStatus: 201,
        success: true,
        reqBody: '{"a":1}',
        resBody: '{"id":1}',
      },
    });
    const notFound = await prisma.callHistory.create({
      data: {
        reqMethod: 'GET',
        reqUrl: 'http://x/b',
        resStatus: 404,
        success: false,
        error: 'not found',
      },
    });
    return { ok, notFound };
  }

  it('exports the full row (with bodies) for selected ids', async () => {
    const { ok } = await seed();
    const rows = await history.exportRows({ ids: [ok.id] });
    expect(rows).toHaveLength(1);
    expect(rows[0].reqBody).toBe('{"a":1}');
    expect(rows[0].resBody).toBe('{"id":1}');
  });

  it('exports every row when no ids/filters are given', async () => {
    await seed();
    expect(await history.exportRows({})).toHaveLength(2);
  });

  it('respects the status filter', async () => {
    await seed();
    const only4xx = await history.exportRows({ status: '4xx' });
    expect(only4xx).toHaveLength(1);
    expect(only4xx[0].resStatus).toBe(404);
  });
});

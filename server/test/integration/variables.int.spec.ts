import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newPrisma, resetDb } from './harness';
import { VariablesService } from '../../src/variables/variables.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('variable resolution (integration)', () => {
  let prisma: PrismaService;
  let vars: VariablesService;

  beforeAll(() => {
    prisma = newPrisma();
    vars = new VariablesService(prisma);
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => resetDb(prisma));

  it('per-use expression wrapping a sequence yields a fresh value per occurrence', async () => {
    await vars.createRule({ name: 'seq', type: 'sequence', config: { start: 1, step: 1 } });
    await vars.createRule({
      name: 'txn',
      type: 'expression',
      config: { expr: 'concat("TX", pad(seq, 4))', perUse: true },
    });

    // {{txn}} appears 3 times in one request -> three distinct, advancing values.
    const { ctxLists } = await vars.resolveContext(true, undefined, { txn: 3 });
    expect(ctxLists.txn).toEqual(['TX0001', 'TX0002', 'TX0003']);
  });

  it('per-use sequence used directly is distinct; a plain sequence repeats within a request', async () => {
    await vars.createRule({ name: 'a', type: 'sequence', config: { start: 100, step: 1, perUse: true } });
    await vars.createRule({ name: 'b', type: 'sequence', config: { start: 500, step: 1 } });

    const { ctxLists, ctx } = await vars.resolveContext(true, undefined, { a: 2, b: 2 });
    expect(ctxLists.a).toEqual(['100', '101']); // fresh per occurrence
    expect(ctx.b).toBe('500'); // one value reused for the whole request
  });

  it('a sequence advances across requests (state persists)', async () => {
    await vars.createRule({ name: 'c', type: 'sequence', config: { start: 1, step: 1 } });
    const first = await vars.resolveContext(true, undefined, { c: 1 });
    const second = await vars.resolveContext(true, undefined, { c: 1 });
    expect(first.ctx.c).toBe('1');
    expect(second.ctx.c).toBe('2');
  });
});

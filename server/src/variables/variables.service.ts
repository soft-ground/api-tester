import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnvironmentDto,
  CreateVariableRuleDto,
  PreviewDto,
  UpdateEnvironmentDto,
  UpdateVariableRuleDto,
} from './dto';
import {
  evalExpression,
  expressionVariables,
  resolveSimpleRule,
  RuleLike,
} from './engine';

// Variable names: allow Unicode letters (Korean, etc.) + digits + _ . -
const VAR_PATTERN = /\{\{\s*([\p{L}\p{N}_.\-]+)\s*\}\}/gu;

interface ResolvedContext {
  ctx: Record<string, string>;
  // Per-use rule values, one array per rule name (consumed per occurrence by makeSubstituter).
  ctxLists: Record<string, string[]>;
  errors: Record<string, string>;
}

// In-process async mutex: runs the given tasks one at a time, in sequence.
// Serializes read-modify-write of state (sequence increment, shared/active variable updates)
// to prevent duplicate values / lost increments under concurrent requests. The server is a single process,
// so an in-process queue is enough.
class AsyncMutex {
  private tail: Promise<unknown> = Promise.resolve();
  runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    // Swallow errors so the next task proceeds regardless of this one success/failure.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

@Injectable()
export class VariablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Serializes state read-modify-write critical sections (shared across sequence/shared/active variables)
  private readonly stateMutex = new AsyncMutex();

  // ================= Environments =================

  listEnvironments() {
    return this.prisma.environment.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createEnvironment(dto: CreateEnvironmentDto) {
    const count = await this.prisma.environment.count();
    return this.prisma.environment.create({
      data: {
        name: dto.name,
        variables: (dto.variables ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? false,
        order: count,
      },
    });
  }

  // Apply the order changed by dragging (reset order to match the given id array)
  async reorderEnvironments(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.environment.update({ where: { id }, data: { order: index } }),
      ),
    );
    return { ok: true };
  }

  async updateEnvironment(id: string, dto: UpdateEnvironmentDto) {
    await this.ensureEnvironment(id);
    const data: Prisma.EnvironmentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.variables !== undefined)
      data.variables = dto.variables as Prisma.InputJsonValue;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.environment.update({ where: { id }, data });
  }

  async deleteEnvironment(id: string) {
    await this.ensureEnvironment(id);
    await this.prisma.environment.delete({ where: { id } });
    return { ok: true };
  }

  // Deactivate the others so only one is active
  async activateEnvironment(id: string) {
    await this.ensureEnvironment(id);
    await this.prisma.environment.updateMany({
      where: { id: { not: id } },
      data: { isActive: false },
    });
    return this.prisma.environment.update({
      where: { id },
      data: { isActive: true },
    });
  }

  // For autocomplete: active env variable keys + all rule names (deduplicated)
  async getAvailableNames(): Promise<{ name: string; source: string }[]> {
    const [env, shared, rules] = await Promise.all([
      this.getActiveEnvVariables(),
      this.getSharedVariables(),
      this.prisma.variableRule.findMany({
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { name: true, type: true },
      }),
    ]);
    const seen = new Set<string>();
    const out: { name: string; source: string }[] = [];
    for (const key of Object.keys(env)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: key, source: 'env' });
    }
    for (const r of rules) {
      if (seen.has(r.name)) continue;
      seen.add(r.name);
      out.push({ name: r.name, source: r.type });
    }
    for (const key of Object.keys(shared)) {
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: key, source: 'extract' });
    }
    return out;
  }

  async getActiveEnvVariables(): Promise<Record<string, string>> {
    const active = await this.prisma.environment.findFirst({
      where: { isActive: true },
    });
    return (active?.variables as Record<string, string>) ?? {};
  }

  // Merge and return the shared-group (isShared) variables (the always-applied base layer)
  async getSharedVariables(): Promise<Record<string, string>> {
    const shared = await this.prisma.environment.findMany({
      where: { isShared: true },
      orderBy: [{ order: 'asc' }],
    });
    const merged: Record<string, string> = {};
    for (const env of shared) {
      Object.assign(merged, (env.variables as Record<string, string>) ?? {});
    }
    return merged;
  }

  // Get or create the shared group that holds scenario extracts
  async getOrCreateSharedGroup(name: string) {
    let group = await this.prisma.environment.findFirst({
      where: { isShared: true, name },
    });
    if (!group) {
      const count = await this.prisma.environment.count();
      group = await this.prisma.environment.create({
        data: { name, isShared: true, order: count, variables: {} },
      });
    }
    return group;
  }

  // Save a variable into the shared group (for auto-saving extracts).
  // Read-modify-write of the variables JSON, so serialize with a mutex to avoid overwrites
  // during concurrent scenario runs.
  async setSharedVariable(groupId: string, name: string, value: string) {
    return this.stateMutex.runExclusive(async () => {
      const group = await this.prisma.environment.findUnique({
        where: { id: groupId },
      });
      if (!group) return;
      const vars = {
        ...((group.variables as Record<string, string>) ?? {}),
        [name]: value,
      };
      await this.prisma.environment.update({
        where: { id: groupId },
        data: { variables: vars as Prisma.InputJsonValue },
      });
    });
  }

  // Save a value captured from a response as an active env variable (add/update).
  // Read-modify-write of the variables JSON; serialize with a mutex (avoid overwrites on concurrent saves).
  async setActiveEnvVariable(name: string, value: string) {
    if (!name || !name.trim()) {
      throw new BadRequestException('A variable name is required.');
    }
    return this.stateMutex.runExclusive(async () => {
      const active = await this.prisma.environment.findFirst({
        where: { isActive: true },
      });
      if (!active) {
        throw new BadRequestException(
          'No active environment. Create and activate one in the Environments menu.',
        );
      }
      const vars = {
        ...((active.variables as Record<string, string>) ?? {}),
        [name.trim()]: value,
      };
      return this.prisma.environment.update({
        where: { id: active.id },
        data: { variables: vars as Prisma.InputJsonValue },
      });
    });
  }

  // ================= Variable Rules =================

  listRules() {
    return this.prisma.variableRule.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async createRule(dto: CreateVariableRuleDto) {
    const count = await this.prisma.variableRule.count();
    return this.prisma.variableRule.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'fixed',
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        order: count,
      },
    });
  }

  async reorderRules(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.variableRule.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return { ok: true };
  }

  async updateRule(id: string, dto: UpdateVariableRuleDto) {
    await this.ensureRule(id);
    const data: Prisma.VariableRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.config !== undefined)
      data.config = dto.config as Prisma.InputJsonValue;
    if (dto.state !== undefined)
      data.state = dto.state as Prisma.InputJsonValue;
    return this.prisma.variableRule.update({ where: { id }, data });
  }

  async deleteRule(id: string) {
    await this.ensureRule(id);
    await this.prisma.variableRule.delete({ where: { id } });
    return { ok: true };
  }

  // Preview: evaluate the value once without saving/incrementing
  async preview(dto: PreviewDto): Promise<{ value: string }> {
    let type = dto.type;
    let config = dto.config ?? {};
    if (dto.id) {
      const rule = await this.prisma.variableRule.findUnique({
        where: { id: dto.id },
      });
      if (!rule) throw new NotFoundException(`Rule ${dto.id} not found`);
      type = rule.type;
      config = rule.config as any;
    }
    if (type === 'expression') {
      const env = await this.getActiveEnvVariables();
      const { ctx } = await this.resolveContext(false, env);
      try {
        return { value: evalExpression(config.expr ?? '', ctx) };
      } catch (e: any) {
        return { value: `Expression error: ${e?.message ?? e}` };
      }
    }
    const { value } = resolveSimpleRule({
      name: 'preview',
      type: type ?? 'fixed',
      config,
      state: {},
    });
    return { value };
  }

  // ================= Substitution engine =================

  /**
   * Evaluate active env variables + all rules to build a { name: value } context.
   * If persist=true, sequence rule state is actually incremented and saved.
   */
  async resolveContext(
    persist: boolean,
    envVars?: Record<string, string>,
    occ?: Record<string, number>,
  ): Promise<ResolvedContext> {
    // persist=true increments/saves sequence state, so serialize with a mutex (under concurrent
    // requests, this prevents duplicate values / lost increments). persist=false (preview, etc.) has no writes, so no lock.
    return persist
      ? this.stateMutex.runExclusive(() =>
          this.resolveContextInner(true, envVars, occ),
        )
      : this.resolveContextInner(false, envVars, occ);
  }

  private async resolveContextInner(
    persist: boolean,
    envVars?: Record<string, string>,
    occ?: Record<string, number>,
  ): Promise<ResolvedContext> {
    const env = envVars ?? (await this.getActiveEnvVariables());
    const shared = await this.getSharedVariables();
    // Priority: rules > active environment > shared group
    const ctx: Record<string, string> = { ...shared, ...env };
    // Per-use rules produce a fresh value for each occurrence in the request (see makeSubstituter).
    const ctxLists: Record<string, string[]> = {};
    const errors: Record<string, string> = {};

    const rules = await this.prisma.variableRule.findMany();
    const ruleByName = new Map(rules.map((r) => [r.name, r]));
    const expressions: typeof rules = [];

    // Shared, threaded state for stateful rules (e.g. sequence): every consumption — a direct
    // {{name}} occurrence or a reference inside a per-use expression — advances the same stream.
    // Persisted once per rule at the end.
    const stateOf = new Map<string, any>();
    for (const r of rules) stateOf.set(r.name, (r as any).state);
    const advanced = new Set<string>();

    const consumeSimple = (rule: (typeof rules)[number]): string => {
      const { value, nextState } = resolveSimpleRule({
        ...(rule as unknown as RuleLike),
        state: stateOf.get(rule.name),
      });
      if (nextState !== undefined && nextState !== null) {
        stateOf.set(rule.name, nextState);
        advanced.add(rule.name);
      }
      return value;
    };
    // Current value without advancing (ctx base for a rule a per-use expression will consume itself).
    const peekSimple = (rule: (typeof rules)[number]): string =>
      resolveSimpleRule({
        ...(rule as unknown as RuleLike),
        state: stateOf.get(rule.name),
      }).value;

    // Pre-scan: simple rules referenced by a per-use expression that repeats in this request. Those
    // are consumed per occurrence by the expression, so step 1 must not advance them here.
    const perUseExprRefs = new Set<string>();
    for (const rule of rules) {
      if (rule.type !== 'expression') continue;
      if (!(rule.config as any)?.perUse) continue;
      if ((occ?.[rule.name] ?? 0) <= 1) continue;
      for (const name of expressionVariables((rule.config as any)?.expr ?? '')) {
        const dep = ruleByName.get(name);
        if (dep && dep.type !== 'expression') perUseExprRefs.add(name);
      }
    }

    // Step 1: simple rules
    for (const rule of rules) {
      if (rule.type === 'expression') {
        expressions.push(rule);
        continue;
      }
      const perUse = !!(rule.config as any)?.perUse;
      const count = occ?.[rule.name] ?? 0;
      if (perUseExprRefs.has(rule.name) && count === 0) {
        // Owned by a per-use expression: expose the current value but do not advance it here.
        ctx[rule.name] = peekSimple(rule);
      } else if (perUse && count > 1) {
        const list = Array.from({ length: count }, () => consumeSimple(rule));
        ctxLists[rule.name] = list;
        ctx[rule.name] = list[0];
      } else {
        ctx[rule.name] = consumeSimple(rule);
      }
    }

    // Step 2: expressions. A per-use expression re-evaluates for each occurrence and consumes its
    // referenced rules fresh each time, so a wrapped sequence advances (fixes "same value each use").
    // On failure, do not add to ctx so {{name}} stays unresolved and the request is blocked.
    for (const rule of expressions) {
      const perUse = !!(rule.config as any)?.perUse;
      const count = occ?.[rule.name] ?? 0;
      const expr = (rule.config as any)?.expr ?? '';
      const deps = expressionVariables(expr)
        .map((n) => ruleByName.get(n))
        .filter(
          (r): r is (typeof rules)[number] => !!r && r.type !== 'expression',
        );
      try {
        if (perUse && count > 1) {
          ctxLists[rule.name] = Array.from({ length: count }, () => {
            const scope: Record<string, unknown> = { ...ctx };
            for (const dep of deps) scope[dep.name] = consumeSimple(dep);
            return evalExpression(expr, scope);
          });
          ctx[rule.name] = ctxLists[rule.name][0];
        } else {
          ctx[rule.name] = evalExpression(expr, ctx);
        }
      } catch (e: any) {
        errors[rule.name] = e?.message ?? String(e);
      }
    }

    // Persist advanced (sequence) state once per rule.
    if (persist) {
      for (const name of advanced) {
        const rule = ruleByName.get(name);
        if (!rule) continue;
        await this.prisma.variableRule.update({
          where: { id: rule.id },
          data: { state: stateOf.get(name) as Prisma.InputJsonValue },
        });
      }
    }

    return { ctx, ctxLists, errors };
  }

  // Substitute {{name}} in a string with context values (undefined ones are left unchanged)
  substituteText(text: string, ctx: Record<string, string>): string {
    if (!text) return text;
    return text.replace(VAR_PATTERN, (whole, name) =>
      ctx[name] !== undefined ? ctx[name] : whole,
    );
  }

  // Like substituteText, but a per-use rule (present in ctxLists) consumes a fresh value for each
  // {{name}} occurrence across the whole request (the returned function keeps a shared cursor).
  // Values in ctx are reused for every occurrence (request-consistent, the default).
  makeSubstituter(
    ctx: Record<string, string>,
    ctxLists: Record<string, string[]> = {},
  ): (text?: string | null) => string | null | undefined {
    const cursors: Record<string, number> = {};
    return (text) => {
      if (!text) return text;
      return text.replace(VAR_PATTERN, (whole, name) => {
        const list = ctxLists[name];
        if (list && list.length) {
          const i = cursors[name] ?? 0;
          cursors[name] = i + 1;
          return i < list.length ? list[i] : list[list.length - 1];
        }
        return ctx[name] !== undefined ? ctx[name] : whole;
      });
    };
  }

  hasPlaceholder(text: string | undefined | null): boolean {
    return !!text && /\{\{\s*[\p{L}\p{N}_.\-]+\s*\}\}/u.test(text);
  }

  // ================= helpers =================

  private async ensureEnvironment(id: string) {
    const found = await this.prisma.environment.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Environment ${id} not found`);
    return found;
  }

  private async ensureRule(id: string) {
    const found = await this.prisma.variableRule.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Rule ${id} not found`);
    return found;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutorService } from '../executor/executor.service';
import { VariablesService } from '../variables/variables.service';
import { AssertDef, evalAssert, getByPath, safeJsonParse } from './eval';

const EXTRACT_GROUP = 'Scenario extracts';

interface ExtractDef {
  name: string;
  path: string; // response body JSONPath
}

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: ExecutorService,
    private readonly vars: VariablesService,
  ) {}

  // ================= Scenario CRUD =================

  listScenarios() {
    return this.prisma.scenario.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { steps: true, runs: true } } },
    });
  }

  getScenario(id: string) {
    return this.prisma.scenario.findUniqueOrThrow({
      where: { id },
      include: {
        steps: {
          orderBy: { order: 'asc' },
          include: {
            endpoint: { select: { id: true, name: true, method: true } },
          },
        },
      },
    });
  }

  createScenario(dto: { name: string; desc?: string }) {
    return this.prisma.scenario.create({
      data: { name: dto.name, desc: dto.desc },
    });
  }

  async updateScenario(
    id: string,
    dto: { name?: string; desc?: string; data?: unknown },
  ) {
    await this.ensureScenario(id);
    const data: Prisma.ScenarioUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.desc !== undefined) data.desc = dto.desc;
    if (dto.data !== undefined) data.data = dto.data as Prisma.InputJsonValue;
    return this.prisma.scenario.update({ where: { id }, data });
  }

  async deleteScenario(id: string) {
    await this.ensureScenario(id);
    await this.prisma.scenario.delete({ where: { id } });
    return { ok: true };
  }

  // ================= Step CRUD =================

  async addStep(scenarioId: string, dto: { endpointId: string }) {
    await this.ensureScenario(scenarioId);
    const count = await this.prisma.scenarioStep.count({
      where: { scenarioId },
    });
    return this.prisma.scenarioStep.create({
      data: { scenarioId, endpointId: dto.endpointId, order: count },
    });
  }

  async updateStep(
    stepId: string,
    dto: { extracts?: unknown; asserts?: unknown; overrides?: unknown },
  ) {
    const data: Prisma.ScenarioStepUpdateInput = {};
    if (dto.extracts !== undefined)
      data.extracts = dto.extracts as Prisma.InputJsonValue;
    if (dto.asserts !== undefined)
      data.asserts = dto.asserts as Prisma.InputJsonValue;
    if (dto.overrides !== undefined)
      data.overrides = dto.overrides as Prisma.InputJsonValue;
    return this.prisma.scenarioStep.update({ where: { id: stepId }, data });
  }

  async deleteStep(stepId: string) {
    await this.prisma.scenarioStep.delete({ where: { id: stepId } });
    return { ok: true };
  }

  async reorderSteps(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.scenarioStep.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return { ok: true };
  }

  // ================= Runs =================

  listRuns(scenarioId: string) {
    return this.prisma.scenarioRun.findMany({
      where: { scenarioId },
      orderBy: { startedAt: 'desc' },
      take: 30,
    });
  }

  getRun(runId: string) {
    return this.prisma.scenarioRun.findUniqueOrThrow({ where: { id: runId } });
  }

  // ================= Runner =================

  async run(scenarioId: string) {
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id: scenarioId },
      include: {
        steps: { orderBy: { order: 'asc' }, include: { endpoint: true } },
      },
    });
    const rows = Array.isArray(scenario.data)
      ? (scenario.data as Record<string, string>[])
      : [];

    const run = await this.prisma.scenarioRun.create({
      data: { scenarioId, status: 'running' },
    });
    const group = await this.vars.getOrCreateSharedGroup(EXTRACT_GROUP);

    // No data → single run (backward compatible: results is an array of step results)
    if (rows.length === 0) {
      const { results, ok } = await this.runIteration(
        scenario.steps,
        run.id,
        group,
        {},
      );
      return this.prisma.scenarioRun.update({
        where: { id: run.id },
        data: {
          status: ok ? 'passed' : 'failed',
          results: results as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
    }

    // Data-driven → run once per row. Each row values are injected as the initial context ({{col}}).
    const iterations: any[] = [];
    let passed = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] ?? {};
      const { results, ok } = await this.runIteration(
        scenario.steps,
        run.id,
        group,
        { ...row },
      );
      if (ok) passed++;
      iterations.push({ index: i, row, ok, results });
    }
    return this.prisma.scenarioRun.update({
      where: { id: run.id },
      data: {
        status: passed === rows.length ? 'passed' : 'failed',
        results: {
          dataDriven: true,
          total: rows.length,
          passed,
          failed: rows.length - passed,
          iterations,
        } as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  }

  // A single iteration (steps in sequence). initialCtx (a data row, etc.) is the initial context,
  // with extracts accumulated on top. Stops immediately on step failure. Returns { stepResults[], ok }.
  private async runIteration(
    steps: any[],
    runId: string,
    group: { id: string },
    initialCtx: Record<string, string>,
  ): Promise<{ results: any[]; ok: boolean }> {
    const ctx: Record<string, string> = { ...initialCtx };
    const results: any[] = [];
    let failed = false;

    for (const step of steps) {
      const ep = step.endpoint;
      const ov = (step.overrides ?? {}) as { body?: string };
      const hasBodyOv = typeof ov.body === 'string';
      const dto = {
        endpointId: ep.id,
        scenarioRunId: runId,
        method: ep.method,
        url: `${ep.baseUrl ?? ''}${ep.path ?? ''}`,
        headers: ep.headers as any,
        queryParams: ep.queryParams as any,
        bodyType: hasBodyOv
          ? ep.bodyType === 'none'
            ? 'json'
            : ep.bodyType
          : ep.bodyType,
        body: hasBodyOv ? ov.body : (ep.bodyTemplate ?? ''),
        authType: ep.authType,
        authConfig: ep.authConfig as any,
      };

      const exec = await this.executor.execute(dto, ctx);
      const parsed = safeJsonParse(exec.response?.body ?? null);

      // Extract values → this iteration context + shared group
      const extracted: Record<string, string> = {};
      if (exec.response && !exec.error) {
        for (const ex of (step.extracts as unknown as ExtractDef[]) ?? []) {
          if (!ex?.name) continue;
          const val = getByPath(parsed, ex.path ?? '');
          const sval =
            val == null
              ? ''
              : typeof val === 'string'
                ? val
                : JSON.stringify(val);
          ctx[ex.name] = sval;
          extracted[ex.name] = sval;
          await this.vars.setSharedVariable(group.id, ex.name, sval);
        }
      }

      // Inject the data row / extracts into the assert expected value and path ({{col}}), then evaluate
      const assertResults = ((step.asserts as unknown as AssertDef[]) ?? []).map(
        (a) =>
          evalAssert(
            {
              ...a,
              value:
                a.value != null
                  ? this.vars.substituteText(a.value, ctx)
                  : a.value,
              path:
                a.path != null ? this.vars.substituteText(a.path, ctx) : a.path,
            },
            exec.response?.status ?? null,
            parsed,
          ),
      );

      const callOk = !!exec.success && !exec.blocked && !exec.error;
      const assertsOk = assertResults.every((a) => a.passed);
      const stepOk = callOk && assertsOk;

      results.push({
        stepId: step.id,
        order: step.order,
        endpointId: ep.id,
        endpointName: ep.name,
        method: exec.request.method,
        url: exec.request.url,
        historyId: exec.historyId || null,
        status: exec.response?.status ?? null,
        durationMs: exec.response?.durationMs ?? null,
        ok: stepOk,
        callOk,
        blocked: !!exec.blocked,
        error: exec.error,
        extracted,
        asserts: assertResults,
      });

      if (!stepOk) {
        failed = true;
        break;
      }
    }

    return { results, ok: !failed };
  }

  // ================= helpers =================
  private async ensureScenario(id: string) {
    const found = await this.prisma.scenario.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Scenario ${id} not found`);
    return found;
  }
}

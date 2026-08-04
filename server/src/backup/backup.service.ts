import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const J = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  // ===== Export: the whole workspace as a single JSON =====
  async export() {
    const [collections, uncategorized, environments, variableRules] =
      await Promise.all([
        this.prisma.collection.findMany({
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          include: {
            endpoints: { orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] },
          },
        }),
        // Include endpoints that belong to no collection in the backup (avoid omissions)
        this.prisma.apiEndpoint.findMany({
          where: { collectionId: null },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        }),
        this.prisma.environment.findMany({ orderBy: [{ order: 'asc' }] }),
        this.prisma.variableRule.findMany({ orderBy: [{ order: 'asc' }] }),
      ]);

    // Build a nested tree from the flat collections by parentId
    const byParent = new Map<string | null, typeof collections>();
    for (const c of collections) {
      const key = c.parentId ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(c);
      byParent.set(key, arr);
    }
    const buildNodes = (parentId: string | null): unknown[] =>
      (byParent.get(parentId) ?? []).map((c) => ({
        name: c.name,
        order: c.order,
        endpoints: c.endpoints.map((e) => this.pickEndpoint(e)),
        children: buildNodes(c.id),
      }));

    return {
      type: 'api-tester-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      uncategorized: uncategorized.map((e) => this.pickEndpoint(e)),
      collections: buildNodes(null),
      environments: environments.map((e) => ({
        name: e.name,
        isActive: e.isActive,
        order: e.order,
        variables: e.variables,
      })),
      variableRules: variableRules.map((r) => ({
        name: r.name,
        type: r.type,
        order: r.order,
        config: r.config,
        state: r.state,
      })),
    };
  }

  // ===== Import: never delete, only add (merge) =====
  async import(data: any) {
    const summary = {
      collections: { added: 0, merged: 0 },
      endpoints: { added: 0, skipped: 0 },
      environments: { added: 0, skipped: 0 },
      variableRules: { added: 0, skipped: 0 },
    };

    // Collections & endpoints (recursive merge of the nested tree; older flat backups work too, without children)
    await this.importCollectionNodes(data?.collections ?? [], null, summary);

    // Uncategorized endpoints (no collectionId)
    for (const ep of data?.uncategorized ?? []) {
      const dup = await this.prisma.apiEndpoint.findFirst({
        where: { collectionId: null, name: ep.name },
      });
      if (dup) {
        summary.endpoints.skipped++;
        continue;
      }
      await this.prisma.apiEndpoint.create({
        data: { collectionId: null, order: ep.order ?? 0, ...this.endpointData(ep) },
      });
      summary.endpoints.added++;
    }

    // Environments (skip if the name exists, to preserve existing values)
    let activeUsed =
      (await this.prisma.environment.findFirst({
        where: { isActive: true },
      })) != null;
    for (const env of data?.environments ?? []) {
      const exists = await this.prisma.environment.findFirst({
        where: { name: env.name },
      });
      if (exists) {
        summary.environments.skipped++;
        continue;
      }
      const setActive = !activeUsed && !!env.isActive;
      if (setActive) activeUsed = true;
      const count = await this.prisma.environment.count();
      await this.prisma.environment.create({
        data: {
          name: env.name,
          order: env.order ?? count,
          isActive: setActive,
          variables: J(env.variables ?? {}),
        },
      });
      summary.environments.added++;
    }

    // Dynamic value rules (name is @unique; skip if it exists)
    for (const r of data?.variableRules ?? []) {
      const exists = await this.prisma.variableRule.findUnique({
        where: { name: r.name },
      });
      if (exists) {
        summary.variableRules.skipped++;
        continue;
      }
      const count = await this.prisma.variableRule.count();
      await this.prisma.variableRule.create({
        data: {
          name: r.name,
          type: r.type ?? 'fixed',
          order: r.order ?? count,
          config: J(r.config ?? {}),
          state: J(r.state ?? {}),
        },
      });
      summary.variableRules.added++;
    }

    return summary;
  }

  // ===== helpers =====

  // Recursively merge the collection tree. Within the same parent, keep the existing one when names match.
  private async importCollectionNodes(
    nodes: any[],
    parentId: string | null,
    summary: any,
  ) {
    for (const col of nodes ?? []) {
      let target = await this.prisma.collection.findFirst({
        where: { name: col.name, parentId },
      });
      if (!target) {
        const count = await this.prisma.collection.count({ where: { parentId } });
        target = await this.prisma.collection.create({
          data: { name: col.name, parentId, order: col.order ?? count },
        });
        summary.collections.added++;
      } else {
        summary.collections.merged++;
      }

      for (const ep of col.endpoints ?? []) {
        // Skip if the same name already exists in the collection (avoid duplicates, keep existing)
        const dup = await this.prisma.apiEndpoint.findFirst({
          where: { collectionId: target.id, name: ep.name },
        });
        if (dup) {
          summary.endpoints.skipped++;
          continue;
        }
        const count = await this.prisma.apiEndpoint.count({
          where: { collectionId: target.id },
        });
        await this.prisma.apiEndpoint.create({
          data: {
            collectionId: target.id,
            order: ep.order ?? count,
            ...this.endpointData(ep),
          },
        });
        summary.endpoints.added++;
      }

      // Recurse into child groups
      await this.importCollectionNodes(col.children ?? [], target.id, summary);
    }
  }

  private pickEndpoint(e: any) {
    return {
      name: e.name,
      order: e.order,
      method: e.method,
      baseUrl: e.baseUrl,
      path: e.path,
      headers: e.headers,
      queryParams: e.queryParams,
      bodyType: e.bodyType,
      bodyTemplate: e.bodyTemplate,
      authType: e.authType,
      authConfig: e.authConfig,
    };
  }

  private endpointData(ep: any) {
    return {
      name: ep.name,
      method: ep.method ?? 'GET',
      baseUrl: ep.baseUrl ?? '',
      path: ep.path ?? '',
      headers: J(ep.headers ?? []),
      queryParams: J(ep.queryParams ?? []),
      bodyType: ep.bodyType ?? 'none',
      bodyTemplate: ep.bodyTemplate ?? null,
      authType: ep.authType ?? 'none',
      authConfig: J(ep.authConfig ?? {}),
    };
  }
}

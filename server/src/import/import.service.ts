import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { parseOpenApi } from './openapi';
import { parseCurl } from './curl';

const J = (v: unknown) => v as Prisma.InputJsonValue;

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  // OpenAPI/Swagger spec → bulk-create endpoints (skip duplicate names)
  async importOpenapi(body: {
    spec?: any;
    url?: string;
    collectionName?: string;
  }) {
    let spec = body.spec;
    if (!spec && body.url) {
      spec = await this.fetchSpec(body.url);
    }
    if (!spec || typeof spec !== 'object') {
      throw new BadRequestException('Not a valid OpenAPI/Swagger spec.');
    }
    if (!spec.paths || typeof spec.paths !== 'object') {
      throw new BadRequestException(
        'The spec has no paths. Make sure it is OpenAPI/Swagger JSON.',
      );
    }

    const { title, endpoints } = parseOpenApi(spec);
    // If a collection name is given, put everything into it; if empty, group by tag.
    const fixedName = body.collectionName?.trim();
    const grouped = !fixedName;

    // collection name → cache (avoid repeated lookups)
    const colCache = new Map<string, { id: string }>();
    const getCol = async (name: string) => {
      if (colCache.has(name)) return colCache.get(name)!;
      const col = await this.getOrCreateCollection(name);
      colCache.set(name, col);
      return col;
    };

    // per-collection tally
    const per = new Map<string, { added: number; skipped: number }>();
    const bump = (name: string, key: 'added' | 'skipped') => {
      const s = per.get(name) ?? { added: 0, skipped: 0 };
      s[key]++;
      per.set(name, s);
    };

    let added = 0;
    let skipped = 0;

    for (const ep of endpoints) {
      const colName = grouped ? ep.tag || title : fixedName;
      const collection = await getCol(colName);

      const dup = await this.prisma.apiEndpoint.findFirst({
        where: { collectionId: collection.id, name: ep.name },
      });
      if (dup) {
        skipped++;
        bump(colName, 'skipped');
        continue;
      }
      const count = await this.prisma.apiEndpoint.count({
        where: { collectionId: collection.id },
      });
      await this.prisma.apiEndpoint.create({
        data: {
          collectionId: collection.id,
          name: ep.name,
          order: count,
          method: ep.method,
          baseUrl: ep.baseUrl,
          path: ep.path,
          headers: J(ep.headers),
          queryParams: J(ep.queryParams),
          bodyType: ep.bodyType,
          bodyTemplate: ep.bodyTemplate,
        },
      });
      added++;
      bump(colName, 'added');
    }

    return {
      grouped,
      total: endpoints.length,
      added,
      skipped,
      collections: [...per.entries()].map(([name, s]) => ({
        name,
        added: s.added,
        skipped: s.skipped,
      })),
    };
  }

  // curl command → create one endpoint
  async importCurl(body: { curl: string; collectionName?: string }) {
    if (!body.curl?.trim()) {
      throw new BadRequestException('Enter a curl command.');
    }
    const parsed = parseCurl(body.curl);
    const collectionName = body.collectionName?.trim() || 'curl import';
    const collection = await this.getOrCreateCollection(collectionName);
    const count = await this.prisma.apiEndpoint.count({
      where: { collectionId: collection.id },
    });
    const created = await this.prisma.apiEndpoint.create({
      data: {
        collectionId: collection.id,
        name: parsed.name,
        order: count,
        method: parsed.method,
        baseUrl: parsed.baseUrl,
        path: parsed.path,
        headers: J(parsed.headers),
        queryParams: J(parsed.queryParams),
        bodyType: parsed.bodyType,
        bodyTemplate: parsed.bodyTemplate,
        authType: parsed.authType,
        authConfig: J(parsed.authConfig),
      },
    });
    return { collectionId: collection.id, collectionName, endpoint: created };
  }

  private async fetchSpec(url: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new BadRequestException(
          'The spec URL response is not JSON. (YAML is not supported yet — paste JSON instead.)',
        );
      }
    } catch (e: any) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(
        `Failed to fetch the spec URL: ${e?.message ?? e}. If it requires auth or is on an internal network, paste JSON instead.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async getOrCreateCollection(name: string) {
    let col = await this.prisma.collection.findFirst({ where: { name } });
    if (!col) {
      const count = await this.prisma.collection.count();
      col = await this.prisma.collection.create({
        data: { name, order: count },
      });
    }
    return col;
  }
}

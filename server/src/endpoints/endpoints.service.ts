import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCollectionDto,
  CreateEndpointDto,
  MoveCollectionDto,
  UpdateCollectionDto,
  UpdateEndpointDto,
} from './dto';

@Injectable()
export class EndpointsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Collections ----

  listCollections() {
    return this.prisma.collection.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        endpoints: {
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          select: { id: true, name: true, method: true, path: true },
        },
      },
    });
  }

  async createCollection(dto: CreateCollectionDto) {
    const parentId = dto.parentId ?? null;
    if (parentId) await this.ensureCollection(parentId);
    // Order is assigned within the same parent (siblings)
    const count = await this.prisma.collection.count({ where: { parentId } });
    return this.prisma.collection.create({
      data: { name: dto.name, parentId, order: dto.order ?? count },
    });
  }

  async updateCollection(id: string, dto: UpdateCollectionDto) {
    await this.ensureCollection(id);
    return this.prisma.collection.update({ where: { id }, data: { ...dto } });
  }

  // Move a group: change parent (parentId) + order. Blocks cycles (moving into itself/a descendant).
  async moveCollection(id: string, dto: MoveCollectionDto) {
    await this.ensureCollection(id);
    const parentId = dto.parentId ?? null;
    if (parentId) {
      if (parentId === id) {
        throw new BadRequestException('A group cannot be moved under itself.');
      }
      await this.ensureCollection(parentId);
      const descendants = await this.collectDescendantIds(id);
      if (descendants.has(parentId)) {
        throw new BadRequestException('A group cannot be moved under one of its own descendants.');
      }
    }
    const order =
      dto.order ??
      (await this.prisma.collection.count({ where: { parentId } }));
    return this.prisma.collection.update({
      where: { id },
      data: { parentId, order },
    });
  }

  async deleteCollection(id: string) {
    await this.ensureCollection(id);
    // Child groups move to the top level (parentId SetNull); member endpoints become uncategorized (collectionId SetNull)
    await this.prisma.collection.delete({ where: { id } });
    return { ok: true };
  }

  // Apply the collection order changed by dragging (sibling order within the same parent)
  async reorderCollections(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.collection.update({ where: { id }, data: { order: index } }),
      ),
    );
    return { ok: true };
  }

  // The set of all descendant ids of a group (for cycle-prevention checks)
  private async collectDescendantIds(id: string): Promise<Set<string>> {
    const all = await this.prisma.collection.findMany({
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<string, string[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      const arr = childrenMap.get(c.parentId) ?? [];
      arr.push(c.id);
      childrenMap.set(c.parentId, arr);
    }
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop() as string;
      for (const ch of childrenMap.get(cur) ?? []) {
        if (!out.has(ch)) {
          out.add(ch);
          stack.push(ch);
        }
      }
    }
    return out;
  }

  // ---- Endpoints ----

  getEndpoint(id: string) {
    return this.ensureEndpoint(id);
  }

  async createEndpoint(dto: CreateEndpointDto) {
    const count = dto.collectionId
      ? await this.prisma.apiEndpoint.count({
          where: { collectionId: dto.collectionId },
        })
      : 0;
    return this.prisma.apiEndpoint.create({
      data: { ...this.toEndpointData(dto), order: count },
    });
  }

  // Duplicate an endpoint: copy all fields into the same collection (append " (copy)" to the name)
  async duplicateEndpoint(id: string) {
    const src = await this.ensureEndpoint(id);
    const count = src.collectionId
      ? await this.prisma.apiEndpoint.count({
          where: { collectionId: src.collectionId },
        })
      : 0;
    return this.prisma.apiEndpoint.create({
      data: {
        collectionId: src.collectionId,
        name: `${src.name} (copy)`,
        order: count,
        method: src.method,
        baseUrl: src.baseUrl,
        path: src.path,
        headers: src.headers as Prisma.InputJsonValue,
        queryParams: src.queryParams as Prisma.InputJsonValue,
        bodyType: src.bodyType,
        bodyTemplate: src.bodyTemplate,
        authType: src.authType,
        authConfig: src.authConfig as Prisma.InputJsonValue,
      },
    });
  }

  // Apply the endpoint order changed by dragging (within the same collection)
  async reorderEndpoints(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.apiEndpoint.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return { ok: true };
  }

  async updateEndpoint(id: string, dto: UpdateEndpointDto) {
    await this.ensureEndpoint(id);
    return this.prisma.apiEndpoint.update({
      where: { id },
      data: this.toEndpointData(dto),
    });
  }

  async deleteEndpoint(id: string) {
    await this.ensureEndpoint(id);
    await this.prisma.apiEndpoint.delete({ where: { id } });
    return { ok: true };
  }

  // ---- helpers ----

  private toEndpointData(
    dto: CreateEndpointDto | UpdateEndpointDto,
  ): Prisma.ApiEndpointUncheckedCreateInput {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.collectionId !== undefined) data.collectionId = dto.collectionId;
    if (dto.method !== undefined) data.method = dto.method;
    if (dto.baseUrl !== undefined) data.baseUrl = dto.baseUrl;
    if (dto.path !== undefined) data.path = dto.path;
    if (dto.headers !== undefined)
      data.headers = dto.headers as unknown as Prisma.InputJsonValue;
    if (dto.queryParams !== undefined)
      data.queryParams = dto.queryParams as unknown as Prisma.InputJsonValue;
    if (dto.bodyType !== undefined) data.bodyType = dto.bodyType;
    if (dto.bodyTemplate !== undefined) data.bodyTemplate = dto.bodyTemplate;
    if (dto.authType !== undefined) data.authType = dto.authType;
    if (dto.authConfig !== undefined)
      data.authConfig = dto.authConfig as Prisma.InputJsonValue;
    return data as Prisma.ApiEndpointUncheckedCreateInput;
  }

  private async ensureCollection(id: string) {
    const found = await this.prisma.collection.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Collection ${id} not found`);
    return found;
  }

  private async ensureEndpoint(id: string) {
    const found = await this.prisma.apiEndpoint.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`Endpoint ${id} not found`);
    return found;
  }
}

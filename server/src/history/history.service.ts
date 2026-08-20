import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Extract the filename from Content-Disposition (both RFC5987 filename* and plain filename).
// Strip CR/LF/quotes and cut path separators to prevent header injection / path traversal.
function parseContentDispositionFilename(cd?: string | null): string | null {
  if (!cd) return null;
  let name: string | null = null;
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(cd);
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim());
    } catch {
      name = star[1].trim();
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
    if (plain) name = plain[1].trim();
  }
  if (!name) return null;
  const clean = name.replace(/[\r\n"]/g, '').replace(/^.*[\\/]/, '').trim();
  return clean || null;
}

// Content-Type → file extension (including the dot). Unknown types return '' (no extension).
const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/gzip': '.gz',
  'application/x-gzip': '.gz',
  'application/x-tar': '.tar',
  'application/x-7z-compressed': '.7z',
  'application/x-rar-compressed': '.rar',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    '.pptx',
  'application/octet-stream': '.bin',
  'application/wasm': '.wasm',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'application/json': '.json',
  'application/xml': '.xml',
  'text/xml': '.xml',
  'text/csv': '.csv',
  'text/html': '.html',
  'text/plain': '.txt',
  'text/css': '.css',
  'application/javascript': '.js',
};
function extFromContentType(ct?: string | null): string {
  if (!ct) return '';
  const base = ct.toLowerCase().split(';')[0].trim();
  return MIME_EXT[base] ?? '';
}

export interface HistoryQuery {
  method?: string;
  status?: string; // 2xx | 4xx | 5xx | exact code
  q?: string; // search URL/body text
  endpointId?: string;
  folderId?: string; // 'null' = uncategorized, otherwise a specific folder, unset = all
  take?: string;
  skip?: string;
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: HistoryQuery) {
    const where: Prisma.CallHistoryWhereInput = {};

    if (query.method) where.reqMethod = query.method.toUpperCase();
    if (query.endpointId) where.endpointId = query.endpointId;

    if (query.folderId !== undefined && query.folderId !== '') {
      where.folderId = query.folderId === 'null' ? null : query.folderId;
    }

    if (query.status) {
      const s = query.status;
      if (/^[2345]xx$/i.test(s)) {
        const base = Number(s[0]) * 100;
        where.resStatus = { gte: base, lt: base + 100 };
      } else if (/^\d{3}$/.test(s)) {
        where.resStatus = Number(s);
      }
    }

    if (query.q) {
      where.OR = [
        { reqUrl: { contains: query.q, mode: 'insensitive' } },
        { reqBody: { contains: query.q, mode: 'insensitive' } },
        { resBody: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const take = Math.min(Number(query.take) || 50, 200);
    const skip = Number(query.skip) || 0;

    const [items, total] = await Promise.all([
      this.prisma.callHistory.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          endpointId: true,
          folderId: true,
          reqMethod: true,
          reqUrl: true,
          resStatus: true,
          durationMs: true,
          success: true,
          error: true,
          executedAt: true,
        },
      }),
      this.prisma.callHistory.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  // Full rows (with request/response bodies + headers) for Excel export: specific ids, or every row
  // matching the same filters as list() (no pagination, capped for safety).
  async exportRows(query: HistoryQuery & { ids?: string[] }) {
    let where: Prisma.CallHistoryWhereInput;
    if (query.ids && query.ids.length) {
      where = { id: { in: query.ids } };
    } else {
      where = {};
      if (query.method) where.reqMethod = query.method.toUpperCase();
      if (query.endpointId) where.endpointId = query.endpointId;
      if (query.folderId !== undefined && query.folderId !== '') {
        where.folderId = query.folderId === 'null' ? null : query.folderId;
      }
      if (query.status) {
        const s = query.status;
        if (/^[2345]xx$/i.test(s)) {
          const base = Number(s[0]) * 100;
          where.resStatus = { gte: base, lt: base + 100 };
        } else if (/^\d{3}$/.test(s)) {
          where.resStatus = Number(s);
        }
      }
      if (query.q) {
        where.OR = [
          { reqUrl: { contains: query.q, mode: 'insensitive' } },
          { reqBody: { contains: query.q, mode: 'insensitive' } },
          { resBody: { contains: query.q, mode: 'insensitive' } },
        ];
      }
    }
    return this.prisma.callHistory.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: 10000,
      select: {
        executedAt: true,
        reqMethod: true,
        reqUrl: true,
        resStatus: true,
        success: true,
        error: true,
        durationMs: true,
        resSize: true,
        resContentType: true,
        resBodyEncoding: true,
        resTruncated: true,
        reqHeaders: true,
        reqBody: true,
        resHeaders: true,
        resBody: true,
        folder: { select: { name: true } },
      },
    });
  }

  async get(id: string) {
    // The raw binary bytes (resBodyBytes) are not included in the JSON response (large).
    // Fetched only via the download route (getBody). All other scalars + metadata are included.
    const item = await this.prisma.callHistory.findUnique({
      where: { id },
      select: {
        id: true,
        endpointId: true,
        scenarioRunId: true,
        folderId: true,
        reqMethod: true,
        reqUrl: true,
        reqHeaders: true,
        reqBody: true,
        resStatus: true,
        resHeaders: true,
        resBody: true,
        resBodyEncoding: true,
        resContentType: true,
        resSize: true,
        resTruncated: true,
        durationMs: true,
        success: true,
        error: true,
        executedAt: true,
        endpoint: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException(`History ${id} not found`);
    return item;
  }

  // Return the raw response body for download/inline viewing (both text and binary).
  // The filename honors the target API Content-Disposition first,
  // and if absent, synthesizes one by appending an extension from Content-Type.
  async getBody(id: string) {
    const h = await this.prisma.callHistory.findUnique({
      where: { id },
      select: {
        resBody: true,
        resBodyBytes: true,
        resBodyEncoding: true,
        resContentType: true,
        resHeaders: true,
      },
    });
    if (!h) throw new NotFoundException(`History ${id} not found`);

    const isBinary = h.resBodyEncoding === 'binary';
    const data = isBinary
      ? Buffer.from(h.resBodyBytes ?? Buffer.alloc(0))
      : Buffer.from(h.resBody ?? '', 'utf8');
    const contentType =
      h.resContentType ||
      (isBinary ? 'application/octet-stream' : 'text/plain; charset=utf-8');

    // The target API original filename (authoritative) → otherwise synthesized from Content-Type
    const cd = (h.resHeaders as Record<string, string>)?.['content-disposition'];
    const originName = parseContentDispositionFilename(cd);
    const filename =
      originName ?? `response-${id}${extFromContentType(contentType)}`;

    return { data, contentType, filename };
  }

  // ================= Folders =================

  listFolders() {
    return this.prisma.historyFolder.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { histories: true } } },
    });
  }

  async createFolder(name: string) {
    const count = await this.prisma.historyFolder.count();
    return this.prisma.historyFolder.create({
      data: { name: name?.trim() || 'New folder', order: count },
    });
  }

  renameFolder(id: string, name: string) {
    return this.prisma.historyFolder.update({
      where: { id },
      data: { name: name?.trim() || 'New folder' },
    });
  }

  // Delete a folder: its history entries become uncategorized (SetNull); the entries themselves are kept
  async deleteFolder(id: string) {
    await this.prisma.historyFolder.delete({ where: { id } });
    return { ok: true };
  }

  // ================= Move/delete history =================

  async move(ids: string[], folderId: string | null) {
    await this.prisma.callHistory.updateMany({
      where: { id: { in: ids } },
      data: { folderId: folderId ?? null },
    });
    return { ok: true };
  }

  async remove(ids: string[]) {
    const res = await this.prisma.callHistory.deleteMany({
      where: { id: { in: ids } },
    });
    return { ok: true, deleted: res.count };
  }
}

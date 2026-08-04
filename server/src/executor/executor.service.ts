import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VariablesService } from '../variables/variables.service';
import { ExecuteDto, KeyValueDto } from './dto';

const REQUEST_TIMEOUT_MS = 30000;

// Response body storage cap (bytes). Excess is truncated and marked as truncated.
// Operators can tune it via env for their environment (default is large, close to keeping everything).
const MAX_BODY_BYTES =
  Number(process.env.REQUEST_MAX_BODY_BYTES) || 25 * 1024 * 1024;

export type BodyEncoding = 'text' | 'binary' | 'none';

export interface ExecuteResult {
  historyId: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string | null;
  };
  response: {
    status: number | null;
    headers: Record<string, string>;
    body: string | null; // Only for text. Binary is null (fetched via the download route).
    durationMs: number;
    encoding?: BodyEncoding;
    contentType?: string | null;
    size?: number; // stored byte count
    truncated?: boolean;
  } | null;
  success: boolean;
  error: string | null;
  // Set when the request was blocked due to unresolved variables
  blocked?: boolean;
  unresolved?: string[];
  // Per-variable error messages for failed expressions { name: message }
  errors?: Record<string, string>;
}

interface ReadBodyResult {
  encoding: BodyEncoding;
  text: string | null;
  bytes: Buffer | null;
  contentType: string | null;
  size: number;
  truncated: boolean;
}

// Decide text/binary from Content-Type. If undecidable (null), fall back to content sniffing.
function isTextualContentType(ct: string): boolean | null {
  const base = ct.toLowerCase().split(';')[0].trim();
  if (!base) return null;
  if (base.startsWith('text/')) return true;
  if (/\+(json|xml)$/.test(base)) return true;
  const textApps = new Set([
    'application/json',
    'application/xml',
    'application/javascript',
    'application/ecmascript',
    'application/x-www-form-urlencoded',
    'application/graphql',
    'application/ld+json',
    'application/yaml',
    'application/x-yaml',
    'application/csv',
    'application/x-ndjson',
  ]);
  if (textApps.has(base)) return true;
  if (
    base.startsWith('image/') ||
    base.startsWith('audio/') ||
    base.startsWith('video/') ||
    base.startsWith('font/')
  )
    return false;
  const binApps = [
    'application/octet-stream',
    'application/pdf',
    'application/zip',
    'application/gzip',
    'application/x-gzip',
    'application/x-tar',
    'application/x-7z-compressed',
    'application/x-rar-compressed',
    'application/wasm',
    'application/protobuf',
    'application/x-protobuf',
    'application/msword',
    'application/vnd.',
    'application/x-msdownload',
  ];
  if (binApps.some((b) => base.startsWith(b))) return false;
  return null;
}

// Treat as binary if a NUL byte is present (only the first 8KB is checked).
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

@Injectable()
export class ExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vars: VariablesService,
  ) {}

  async execute(
    dto: ExecuteDto,
    extraContext?: Record<string, string>,
  ): Promise<ExecuteResult> {
    // 1) Variable substitution: replace {{var}} with active env variables + dynamic rule values.
    //    Rules are evaluated (sequence incremented) only when a placeholder is present.
    //    extraContext (scenario run context) overrides with the highest priority.
    //    Expression failures are collected into errors and those variables remain unresolved.
    const { dto: subbed, errors } = await this.applyVariables(dto, extraContext);
    dto = subbed;

    // 2) If any {{variable}} remains unresolved, block the request (avoid malformed calls).
    //    - undefined variables (typos, etc.)
    //    - variables whose value could not be produced due to an expression failure
    const unresolved = this.collectUnresolved(dto);
    if (unresolved.length > 0) {
      const detail = unresolved
        .map((n) =>
          errors[n] ? `{{${n}}} (expression error: ${errors[n]})` : `{{${n}}}`,
        )
        .join(', ');
      return {
        historyId: '',
        request: {
          method: (dto.method || 'GET').toUpperCase(),
          url: dto.url,
          headers: this.plainHeaders(dto),
          body: dto.body ?? null,
        },
        response: null,
        success: false,
        error: `The request was stopped because some variables are undefined or failed to evaluate: ${detail}`,
        blocked: true,
        unresolved,
        errors,
      };
    }

    let url = this.buildUrl(dto.url, dto.queryParams);
    // An API key placed in the query is handled after URL assembly
    const cfg = dto.authConfig ?? {};
    if (dto.authType === 'apikey' && cfg.in === 'query' && cfg.key) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}${encodeURIComponent(cfg.key)}=${encodeURIComponent(cfg.value ?? '')}`;
    }
    const method = (dto.method || 'GET').toUpperCase();
    const { fetchBody, preview: bodyPreview } = this.buildBody(method, dto);
    const headers = this.buildHeaders(dto);

    const started = Date.now();
    let status: number | null = null;
    let resHeaders: Record<string, string> = {};
    let bodyRes: ReadBodyResult = {
      encoding: 'none',
      text: null,
      bytes: null,
      contentType: null,
      size: 0,
      truncated: false,
    };
    let success = false;
    let error: string | null = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: fetchBody,
        signal: controller.signal,
      });
      status = res.status;
      resHeaders = this.headersToObject(res.headers);
      bodyRes = await this.readBody(res);
      success = res.ok; // whether 2xx
    } catch (e: any) {
      error =
        e?.name === 'AbortError'
          ? `Request timeout (${REQUEST_TIMEOUT_MS}ms exceeded)`
          : e?.message || String(e);
    } finally {
      clearTimeout(timer);
    }

    const durationMs = Date.now() - started;

    const history = await this.prisma.callHistory.create({
      data: {
        endpointId: dto.endpointId ?? null,
        scenarioRunId: dto.scenarioRunId ?? null,
        reqMethod: method,
        reqUrl: url,
        reqHeaders: headers,
        reqBody: bodyPreview,
        resStatus: status,
        resHeaders,
        resBody: bodyRes.text,
        resBodyBytes: bodyRes.bytes,
        resBodyEncoding: bodyRes.encoding,
        resContentType: bodyRes.contentType,
        resSize: bodyRes.size,
        resTruncated: bodyRes.truncated,
        durationMs,
        success,
        error,
      },
    });

    return {
      historyId: history.id,
      request: { method, url, headers, body: bodyPreview },
      response: error
        ? null
        : {
            status,
            headers: resHeaders,
            body: bodyRes.text, // null for binary → the UI uses the download route
            durationMs,
            encoding: bodyRes.encoding,
            contentType: bodyRes.contentType,
            size: bodyRes.size,
            truncated: bodyRes.truncated,
          },
      success,
      error,
    };
  }

  // Stream-read the response body up to the cap (memory protection) and classify it as text/binary.
  private async readBody(res: Response): Promise<ReadBodyResult> {
    const contentType = res.headers.get('content-type');
    const chunks: Buffer[] = [];
    let total = 0;
    let truncated = false;

    if (res.body) {
      // undici (Node 20) res.body is an async-iterable web ReadableStream
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        const b = Buffer.from(chunk);
        if (total + b.length > MAX_BODY_BYTES) {
          chunks.push(b.subarray(0, MAX_BODY_BYTES - total));
          total = MAX_BODY_BYTES;
          truncated = true;
          break; // ending the iterator cancels the stream internally
        }
        chunks.push(b);
        total += b.length;
      }
    }

    const buf = Buffer.concat(chunks);
    if (buf.length === 0) {
      return {
        encoding: 'none',
        text: null,
        bytes: null,
        contentType: contentType ?? null,
        size: 0,
        truncated,
      };
    }

    const textByCt = isTextualContentType(contentType ?? '');
    const isText = textByCt ?? !looksBinary(buf);

    if (isText) {
      return {
        encoding: 'text',
        text: buf.toString('utf8'),
        bytes: null,
        contentType: contentType ?? null,
        size: buf.length,
        truncated,
      };
    }
    return {
      encoding: 'binary',
      text: null,
      bytes: buf,
      contentType: contentType ?? null,
      size: buf.length,
      truncated,
    };
  }

  // ---- variable substitution ----

  // Collect the names of {{name}} placeholders left after substitution, without duplicates
  private collectUnresolved(dto: ExecuteDto): string[] {
    const texts: string[] = [
      dto.url ?? '',
      dto.body ?? '',
      ...(dto.headers ?? []).flatMap((h) => [h.key, h.value ?? '']),
      ...(dto.queryParams ?? []).flatMap((q) => [q.key, q.value ?? '']),
      ...Object.values(dto.authConfig ?? {}).map((v) => String(v ?? '')),
      ...(dto.multipart ?? []).flatMap((p) => [
        p.key,
        p.type === 'file' ? '' : (p.value ?? ''),
        p.filename ?? '',
      ]),
    ];
    const found = new Set<string>();
    const re = /\{\{\s*([\p{L}\p{N}_.\-]+)\s*\}\}/gu;
    for (const t of texts) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) found.add(m[1]);
    }
    return [...found];
  }

  // Header object for previewing a blocked (unsent) request
  private plainHeaders(dto: ExecuteDto): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const h of dto.headers ?? []) {
      if (h.enabled === false || !h.key) continue;
      headers[h.key] = h.value ?? '';
    }
    return headers;
  }

  private async applyVariables(
    dto: ExecuteDto,
    extraContext?: Record<string, string>,
  ): Promise<{ dto: ExecuteDto; errors: Record<string, string> }> {
    // Gather all text in the request to decide whether placeholders exist
    const texts: string[] = [
      dto.url ?? '',
      dto.body ?? '',
      ...(dto.headers ?? []).flatMap((h) => [h.key, h.value ?? '']),
      ...(dto.queryParams ?? []).flatMap((q) => [q.key, q.value ?? '']),
      ...Object.values(dto.authConfig ?? {}).map((v) => String(v ?? '')),
      ...(dto.multipart ?? []).flatMap((p) => [
        p.key,
        p.type === 'file' ? '' : (p.value ?? ''),
        p.filename ?? '',
      ]),
    ];
    const hasVars = texts.some((t) => this.vars.hasPlaceholder(t));

    // If placeholders exist, evaluate rules too (sequence increment); otherwise use env variables only
    let ctx: Record<string, string>;
    let errors: Record<string, string> = {};
    if (hasVars) {
      const resolved = await this.vars.resolveContext(true);
      ctx = resolved.ctx;
      errors = resolved.errors;
    } else {
      ctx = await this.vars.getActiveEnvVariables();
    }
    // The scenario run context (extracts) overrides with the highest priority
    if (extraContext) ctx = { ...ctx, ...extraContext };

    const sub = (t?: string | null) =>
      t == null ? t : this.vars.substituteText(t, ctx);

    let url = sub(dto.url) ?? '';
    // If the URL is relative (no baseUrl), prepend the active environment baseUrl
    if (url && !/^https?:\/\//i.test(url) && ctx.baseUrl) {
      const base = String(ctx.baseUrl).replace(/\/$/, '');
      url = base + (url.startsWith('/') ? '' : '/') + url;
    }

    return {
      dto: {
        ...dto,
        url,
        body: sub(dto.body) ?? undefined,
        headers: (dto.headers ?? []).map((h) => ({
          ...h,
          key: sub(h.key) ?? '',
          value: sub(h.value) ?? '',
        })),
        queryParams: (dto.queryParams ?? []).map((q) => ({
          ...q,
          key: sub(q.key) ?? '',
          value: sub(q.value) ?? '',
        })),
        multipart: (dto.multipart ?? []).map((p) => ({
          ...p,
          key: sub(p.key) ?? '',
          // Substitute only text part values and filenames. data (base64) is left as-is.
          value: p.type === 'file' ? p.value : (sub(p.value) ?? ''),
          filename: sub(p.filename) ?? p.filename,
        })),
        authConfig: this.substituteAuthConfig(dto.authConfig, sub),
      },
      errors,
    };
  }

  private substituteAuthConfig(
    cfg: Record<string, any> | undefined,
    sub: (t?: string | null) => string | null | undefined,
  ): Record<string, any> | undefined {
    if (!cfg) return cfg;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(cfg)) {
      out[k] = typeof v === 'string' ? sub(v) : v;
    }
    return out;
  }

  // ---- request building ----

  private buildUrl(rawUrl: string, params?: KeyValueDto[]): string {
    const enabled = (params ?? []).filter(
      (p) => p.enabled !== false && p.key,
    );
    if (enabled.length === 0) return rawUrl;

    const hasQuery = rawUrl.includes('?');
    const qs = enabled
      .map(
        (p) =>
          `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`,
      )
      .join('&');
    return rawUrl + (hasQuery ? '&' : '?') + qs;
  }

  private buildHeaders(dto: ExecuteDto): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const h of dto.headers ?? []) {
      if (h.enabled === false || !h.key) continue;
      headers[h.key] = h.value ?? '';
    }
    this.applyAuth(headers, dto);
    // If a body is present but content-type is unset, apply a default
    if (
      dto.bodyType === 'json' &&
      !this.hasHeader(headers, 'content-type')
    ) {
      headers['Content-Type'] = 'application/json';
    }
    if (
      dto.bodyType === 'form' &&
      !this.hasHeader(headers, 'content-type')
    ) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    // For multipart, fetch(FormData) sets the Content-Type (with boundary) automatically.
    // A user-provided content-type has no boundary and breaks parsing, so remove it.
    if (dto.bodyType === 'multipart') {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'content-type') delete headers[k];
      }
    }
    return headers;
  }

  private applyAuth(headers: Record<string, string>, dto: ExecuteDto) {
    const cfg = dto.authConfig ?? {};
    switch (dto.authType) {
      case 'bearer':
        if (cfg.token) headers['Authorization'] = `Bearer ${cfg.token}`;
        break;
      case 'basic': {
        const raw = `${cfg.username ?? ''}:${cfg.password ?? ''}`;
        headers['Authorization'] =
          'Basic ' + Buffer.from(raw).toString('base64');
        break;
      }
      case 'apikey':
        if (cfg.key && cfg.in === 'header') headers[cfg.key] = cfg.value ?? '';
        // apikey in query is not handled before buildUrl, so only header is handled here
        break;
      default:
        break;
    }
  }

  // Return both the body to send (string or FormData) and a summary text for history/preview.
  private buildBody(
    method: string,
    dto: ExecuteDto,
  ): { fetchBody: BodyInit | undefined; preview: string | null } {
    if (method === 'GET' || method === 'HEAD')
      return { fetchBody: undefined, preview: null };
    if (!dto.bodyType || dto.bodyType === 'none')
      return { fetchBody: undefined, preview: null };

    if (dto.bodyType === 'multipart') {
      // Assemble as FormData → fetch sets the Content-Type (with boundary) automatically.
      const fd = new FormData();
      const lines: string[] = [];
      for (const p of dto.multipart ?? []) {
        if (p.enabled === false || !p.key) continue;
        if (p.type === 'file') {
          const buf = p.data ? Buffer.from(p.data, 'base64') : Buffer.alloc(0);
          const type = p.contentType || 'application/octet-stream';
          fd.append(p.key, new Blob([buf], { type }), p.filename || 'file');
          lines.push(
            `${p.key}: [file] ${p.filename || 'file'} (${type}, ${buf.length} bytes)`,
          );
        } else {
          fd.append(p.key, p.value ?? '');
          lines.push(`${p.key}: ${p.value ?? ''}`);
        }
      }
      return { fetchBody: fd, preview: lines.join('\n') || '(empty multipart)' };
    }

    const s = dto.body ?? undefined;
    return { fetchBody: s, preview: s ?? null };
  }

  private hasHeader(headers: Record<string, string>, name: string): boolean {
    return Object.keys(headers).some((k) => k.toLowerCase() === name);
  }

  private headersToObject(h: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    h.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }
}

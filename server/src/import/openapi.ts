// Parse an OpenAPI 3.x / Swagger 2.0 spec into a list of endpoints.

interface ParsedEndpoint {
  name: string;
  tag: string | null; // first tag (used for grouping)
  method: string;
  baseUrl: string;
  path: string;
  headers: { key: string; value: string; enabled: boolean }[];
  queryParams: { key: string; value: string; enabled: boolean }[];
  bodyType: string;
  bodyTemplate: string | null;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function resolveRef(spec: any, ref: string): any {
  // "#/components/schemas/Foo" | "#/definitions/Foo"
  if (!ref || !ref.startsWith('#/')) return {};
  const parts = ref.slice(2).split('/');
  let cur = spec;
  for (const p of parts) {
    if (cur == null) return {};
    cur = cur[p];
  }
  return cur ?? {};
}

// Build sample JSON from a schema (object/array/primitive types, handling $ref/allOf).
function sampleFromSchema(spec: any, schema: any, depth = 0): any {
  if (!schema || depth > 6) return null;
  if (schema.$ref) return sampleFromSchema(spec, resolveRef(spec, schema.$ref), depth + 1);
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (Array.isArray(schema.allOf)) {
    const merged: any = {};
    for (const s of schema.allOf) Object.assign(merged, sampleFromSchema(spec, s, depth + 1) ?? {});
    return merged;
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length)
    return sampleFromSchema(spec, schema.oneOf[0], depth + 1);
  if (Array.isArray(schema.anyOf) && schema.anyOf.length)
    return sampleFromSchema(spec, schema.anyOf[0], depth + 1);

  const type = schema.type || (schema.properties ? 'object' : undefined);
  switch (type) {
    case 'object': {
      const obj: any = {};
      const props = schema.properties || {};
      for (const [k, v] of Object.entries(props)) {
        obj[k] = sampleFromSchema(spec, v, depth + 1);
      }
      return obj;
    }
    case 'array':
      return [sampleFromSchema(spec, schema.items || {}, depth + 1)];
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'date') return new Date().toISOString().slice(0, 10);
      return '';
    default:
      return null;
  }
}

function resolveBaseUrl(spec: any): string {
  // OpenAPI 3.x
  if (Array.isArray(spec.servers) && spec.servers[0]?.url) {
    return String(spec.servers[0].url).replace(/\/$/, '');
  }
  // Swagger 2.0
  if (spec.host) {
    const scheme = Array.isArray(spec.schemes) && spec.schemes[0] ? spec.schemes[0] : 'https';
    const basePath = spec.basePath || '';
    return `${scheme}://${spec.host}${basePath}`.replace(/\/$/, '');
  }
  return '';
}

// Extract a sample body from requestBody (3.x) or a body parameter (2.0).
function extractBody(
  spec: any,
  op: any,
): { bodyType: string; bodyTemplate: string | null } {
  // OpenAPI 3.x
  const content = op.requestBody?.content;
  if (content) {
    const json = content['application/json'] || content[Object.keys(content)[0]];
    if (json?.schema) {
      const sample = sampleFromSchema(spec, json.schema);
      return { bodyType: 'json', bodyTemplate: JSON.stringify(sample, null, 2) };
    }
  }
  // Swagger 2.0 body param
  const bodyParam = (op.parameters || []).find((p: any) => p.in === 'body');
  if (bodyParam?.schema) {
    const sample = sampleFromSchema(spec, bodyParam.schema);
    return { bodyType: 'json', bodyTemplate: JSON.stringify(sample, null, 2) };
  }
  return { bodyType: 'none', bodyTemplate: null };
}

export function parseOpenApi(spec: any): {
  title: string;
  endpoints: ParsedEndpoint[];
} {
  const baseUrl = resolveBaseUrl(spec);
  const title = spec.info?.title || 'Imported API';
  const endpoints: ParsedEndpoint[] = [];
  const paths = spec.paths || {};

  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!pathItem) continue;
    // path-level common parameters
    const commonParams = pathItem.parameters || [];
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;

      const params = [...commonParams, ...(op.parameters || [])].map((p) =>
        p.$ref ? resolveRef(spec, p.$ref) : p,
      );
      const headers = params
        .filter((p: any) => p.in === 'header')
        .map((p: any) => ({ key: p.name, value: '', enabled: true }));
      const queryParams = params
        .filter((p: any) => p.in === 'query')
        .map((p: any) => ({ key: p.name, value: '', enabled: false }));

      const { bodyType, bodyTemplate } = extractBody(spec, op);

      const tag =
        Array.isArray(op.tags) && op.tags.length ? String(op.tags[0]) : null;

      endpoints.push({
        name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        tag,
        method: method.toUpperCase(),
        baseUrl,
        path,
        headers,
        queryParams,
        bodyType,
        bodyTemplate,
      });
    }
  }

  return { title, endpoints };
}

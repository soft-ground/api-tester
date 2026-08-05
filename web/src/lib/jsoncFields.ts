import { stripJsonComments } from './jsonc';

// Recursive structured view of a JSON request body, kept fully compatible with the raw JSONC
// text (the single source of truth). required/optional and excluded state live as JSONC comments
// at every nesting level:
//
//   {
//     "Header": {
//       "apiName": "createVirtualAccount",   // required
//       "memo": "note"                        // optional
//       // "trace": "x"                       // optional   (excluded -> not sent)
//     },
//     "amount": "100"                         // required
//   }
//
// Objects are expanded into nested fields. Arrays are treated as a single leaf value (edited as
// raw JSON). required/optional badges and the include (exclude) toggle apply to PRIMITIVE leaf
// fields only, so an excluded field is always a single commented line -> lossless round-trip.

export type FieldMeta = 'required' | 'optional';

export type FieldValue =
  | { kind: 'object'; fields: BodyField[] }
  | { kind: 'leaf'; value: unknown }; // primitive or array

export interface BodyField {
  key: string;
  value: FieldValue;
  included: boolean; // false => serialized as a commented-out line (not sent)
  meta?: FieldMeta; // trailing // required | // optional (primitive leaves only)
}

export interface ParsedBody {
  ok: boolean; // false when the body is not a JSON object we can model
  fields: BodyField[];
}

export function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== 'object';
}

export function isArrayLeaf(f: BodyField): boolean {
  return (
    f.value.kind === 'leaf' &&
    f.value.value !== null &&
    typeof f.value.value === 'object'
  );
}

/* ----------------------------- parsing ----------------------------- */

interface Scan {
  s: string;
  i: number;
}

function skipWsBlock(p: Scan) {
  for (;;) {
    const c = p.s[p.i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      p.i++;
      continue;
    }
    if (c === '/' && p.s[p.i + 1] === '*') {
      p.i += 2;
      while (p.i < p.s.length && !(p.s[p.i] === '*' && p.s[p.i + 1] === '/')) p.i++;
      p.i += 2;
      continue;
    }
    break;
  }
}

function skipInlineWs(p: Scan) {
  while (p.s[p.i] === ' ' || p.s[p.i] === '\t') p.i++;
}

function readStringRaw(p: Scan): string {
  const start = p.i;
  p.i++; // opening quote
  while (p.i < p.s.length) {
    const c = p.s[p.i];
    if (c === '\\') {
      p.i += 2;
      continue;
    }
    if (c === '"') {
      p.i++;
      break;
    }
    p.i++;
  }
  return p.s.slice(start, p.i);
}

function readBalancedRaw(p: Scan): string {
  const start = p.i;
  let depth = 0;
  while (p.i < p.s.length) {
    const c = p.s[p.i];
    if (c === '"') {
      readStringRaw(p);
      continue;
    }
    if (c === '/' && p.s[p.i + 1] === '/') {
      while (p.i < p.s.length && p.s[p.i] !== '\n') p.i++;
      continue;
    }
    if (c === '/' && p.s[p.i + 1] === '*') {
      p.i += 2;
      while (p.i < p.s.length && !(p.s[p.i] === '*' && p.s[p.i + 1] === '/')) p.i++;
      p.i += 2;
      continue;
    }
    if (c === '{' || c === '[') {
      depth++;
      p.i++;
      continue;
    }
    if (c === '}' || c === ']') {
      depth--;
      p.i++;
      if (depth === 0) break;
      continue;
    }
    p.i++;
  }
  return p.s.slice(start, p.i);
}

function parseValue(p: Scan): FieldValue {
  skipWsBlock(p);
  const c = p.s[p.i];
  if (c === '{') return { kind: 'object', fields: parseObjectFields(p) };
  if (c === '[') {
    return { kind: 'leaf', value: JSON.parse(stripJsonComments(readBalancedRaw(p))) };
  }
  if (c === '"') return { kind: 'leaf', value: JSON.parse(readStringRaw(p)) };
  // bare literal: number / true / false / null
  const start = p.i;
  while (
    p.i < p.s.length &&
    !',}]\r\n\t '.includes(p.s[p.i]) &&
    !(p.s[p.i] === '/' && (p.s[p.i + 1] === '/' || p.s[p.i + 1] === '*'))
  ) {
    p.i++;
  }
  return { kind: 'leaf', value: JSON.parse(p.s.slice(start, p.i)) };
}

function readTrailingMeta(p: Scan): FieldMeta | undefined {
  skipInlineWs(p);
  if (p.s[p.i] === ',') p.i++;
  skipInlineWs(p);
  if (p.s[p.i] === '/' && p.s[p.i + 1] === '/') {
    let j = p.i + 2;
    while (j < p.s.length && p.s[j] !== '\n') j++;
    const body = p.s.slice(p.i + 2, j);
    p.i = j;
    const m = body.match(/\b(required|optional)\b/);
    return m ? (m[1] as FieldMeta) : undefined;
  }
  return undefined;
}

function tryParseExcludedProp(commentBody: string): BodyField | null {
  const sp: Scan = { s: commentBody, i: 0 };
  skipWsBlock(sp);
  if (sp.s[sp.i] !== '"') return null;
  try {
    const key = JSON.parse(readStringRaw(sp)) as string;
    skipWsBlock(sp);
    if (sp.s[sp.i] !== ':') return null;
    sp.i++;
    const value = parseValue(sp);
    const meta = readTrailingMeta(sp);
    return { key, value, included: false, meta };
  } catch {
    return null;
  }
}

function parseObjectFields(p: Scan): BodyField[] {
  p.i++; // consume '{'
  const fields: BodyField[] = [];
  for (;;) {
    skipWsBlock(p);
    const c = p.s[p.i];
    if (c === undefined) break;
    if (c === ',') {
      p.i++;
      continue;
    }
    if (c === '}') {
      p.i++;
      break;
    }
    if (c === '/' && p.s[p.i + 1] === '/') {
      let j = p.i + 2;
      while (j < p.s.length && p.s[j] !== '\n') j++;
      const body = p.s.slice(p.i + 2, j);
      p.i = j;
      const ex = tryParseExcludedProp(body);
      if (ex) fields.push(ex);
      continue;
    }
    if (c === '"') {
      const key = JSON.parse(readStringRaw(p)) as string;
      skipWsBlock(p);
      if (p.s[p.i] !== ':') throw new Error('expected ":"');
      p.i++;
      const value = parseValue(p);
      const meta = readTrailingMeta(p);
      fields.push({ key, value, included: true, meta });
      continue;
    }
    throw new Error('unexpected token');
  }
  return fields;
}

export function parseBody(jsonc: string): ParsedBody {
  const p: Scan = { s: jsonc ?? '', i: 0 };
  skipWsBlock(p);
  if (p.s[p.i] !== '{') {
    return p.i >= p.s.length
      ? { ok: true, fields: [] }
      : { ok: false, fields: [] };
  }
  try {
    return { ok: true, fields: parseObjectFields(p) };
  } catch {
    return { ok: false, fields: [] };
  }
}

/* --------------------------- serializing --------------------------- */

function leafText(value: unknown, level: number): string {
  const pad = '  '.repeat(level);
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((ln, idx) => (idx === 0 ? ln : pad + ln))
    .join('\n');
}

function serializeObject(fields: BodyField[], level: number): string {
  if (fields.length === 0) return '{}';
  const itemPad = '  '.repeat(level + 1);
  const closePad = '  '.repeat(level);
  const lines = fields.map((f, i) => {
    const laterIncluded = fields.slice(i + 1).some((x) => x.included);
    const comma = laterIncluded ? ',' : '';
    const valueText =
      f.value.kind === 'object'
        ? serializeObject(f.value.fields, level + 1)
        : leafText(f.value.value, level + 1);
    const metaSuffix =
      f.meta && f.value.kind === 'leaf' && isPrimitive(f.value.value)
        ? `   // ${f.meta}`
        : '';
    const head = `${JSON.stringify(f.key)}: ${valueText}${comma}${metaSuffix}`;
    return f.included ? `${itemPad}${head}` : `${itemPad}// ${head}`;
  });
  return `{\n${lines.join('\n')}\n${closePad}}`;
}

export function serializeBody(fields: BodyField[]): string {
  return serializeObject(fields, 0);
}

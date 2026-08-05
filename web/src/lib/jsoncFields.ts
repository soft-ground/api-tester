import { stripJsonComments } from './jsonc';

// Recursive structured view of a JSON request body, kept fully compatible with the raw JSONC
// text (the single source of truth). required/optional and excluded state live as JSONC comments
// at every nesting level:
//
//   {
//     "Header": {
//       "apiName": "x",   // required
//       "memo": "note"    // optional
//     },
//     // "extra": {        <- a whole object/field can be excluded (commented out)
//     //   "a": 1
//     // },
//     "items": ["a", "b"]  <- arrays are edited element by element
//   }
//
// Objects expand recursively; arrays hold ordered items (each a value). required/optional badges
// apply to primitive leaves; the include (exclude) toggle applies to any field and comments out
// the whole — possibly multi-line — block, which is reconstructed losslessly on the next parse.

export type FieldMeta = 'required' | 'optional';

export type FieldValue =
  | { kind: 'object'; fields: BodyField[] }
  | { kind: 'array'; items: FieldValue[] }
  | { kind: 'leaf'; value: unknown }; // primitive (string/number/boolean/null)

export interface BodyField {
  key: string;
  value: FieldValue;
  included: boolean; // false => serialized as a commented-out block (not sent)
  meta?: FieldMeta; // trailing // required | // optional (primitive leaves only)
}

export interface ParsedBody {
  ok: boolean; // false when the body is not a JSON object we can model
  fields: BodyField[];
}

export function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== 'object';
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

// Read a `//` comment line, returning its content with the leading `// ` stripped, and advance
// past the trailing newline. Used both to skip comments and to reconstruct commented-out blocks.
function readCommentLine(p: Scan): string {
  p.i += 2; // skip //
  if (p.s[p.i] === ' ') p.i++; // the canonical "// " spacer
  const start = p.i;
  while (p.i < p.s.length && p.s[p.i] !== '\n') p.i++;
  const text = p.s.slice(start, p.i);
  if (p.s[p.i] === '\n') p.i++;
  return text;
}

function parseValue(p: Scan): FieldValue {
  skipWsBlock(p);
  const c = p.s[p.i];
  if (c === '{') return { kind: 'object', fields: parseObjectFields(p) };
  if (c === '[') return { kind: 'array', items: parseArrayItems(p) };
  if (c === '"') return { kind: 'leaf', value: JSON.parse(readStringRaw(p)) };
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
    const body = readCommentLine(p);
    const m = body.match(/\b(required|optional)\b/);
    return m ? (m[1] as FieldMeta) : undefined;
  }
  return undefined;
}

// Reconstruct fields from a block of un-commented text (one or more properties, possibly nested
// and multi-line). Top-level fields of the block are marked excluded.
function parseExcludedBlock(text: string): BodyField[] {
  try {
    const p: Scan = { s: `{${text}\n}`, i: 0 };
    return parseObjectFields(p).map((f) => ({ ...f, included: false }));
  } catch {
    return [];
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
      // Gather a run of consecutive commented lines (a commented-out field may span
      // multiple lines), then reconstruct the excluded field(s) from it.
      const blockLines: string[] = [readCommentLine(p)];
      for (;;) {
        const save = p.i;
        skipInlineWs(p);
        if (p.s[p.i] === '/' && p.s[p.i + 1] === '/') {
          blockLines.push(readCommentLine(p));
        } else {
          p.i = save;
          break;
        }
      }
      fields.push(...parseExcludedBlock(blockLines.join('\n')));
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

function parseArrayItems(p: Scan): FieldValue[] {
  p.i++; // consume '['
  const items: FieldValue[] = [];
  for (;;) {
    skipWsBlock(p);
    const c = p.s[p.i];
    if (c === undefined) break;
    if (c === ',') {
      p.i++;
      continue;
    }
    if (c === ']') {
      p.i++;
      break;
    }
    if (c === '/' && p.s[p.i + 1] === '/') {
      readCommentLine(p);
      continue;
    }
    items.push(parseValue(p));
    skipInlineWs(p);
    if (p.s[p.i] === '/' && p.s[p.i + 1] === '/') readCommentLine(p);
  }
  return items;
}

export function parseBody(jsonc: string): ParsedBody {
  const p: Scan = { s: jsonc ?? '', i: 0 };
  skipWsBlock(p);
  if (p.s[p.i] !== '{') {
    return p.i >= p.s.length ? { ok: true, fields: [] } : { ok: false, fields: [] };
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

function serializeValue(v: FieldValue, level: number): string {
  if (v.kind === 'object') return serializeObject(v.fields, level);
  if (v.kind === 'array') return serializeArray(v.items, level);
  return leafText(v.value, level);
}

function serializeArray(items: FieldValue[], level: number): string {
  if (items.length === 0) return '[]';
  const itemPad = '  '.repeat(level + 1);
  const closePad = '  '.repeat(level);
  const lines = items.map((v, i) => {
    const comma = i < items.length - 1 ? ',' : '';
    return `${itemPad}${serializeValue(v, level + 1)}${comma}`;
  });
  return `[\n${lines.join('\n')}\n${closePad}]`;
}

function serializeObject(fields: BodyField[], level: number): string {
  if (fields.length === 0) return '{}';
  const itemPad = '  '.repeat(level + 1);
  const closePad = '  '.repeat(level);
  const lines = fields.map((f, i) => {
    const comma = fields.slice(i + 1).some((x) => x.included) ? ',' : '';
    const valueText = serializeValue(f.value, level + 1);
    const metaSuffix =
      f.meta && f.value.kind === 'leaf' && isPrimitive(f.value.value)
        ? `   // ${f.meta}`
        : '';
    const rendered = `${JSON.stringify(f.key)}: ${valueText}${comma}${metaSuffix}`;
    if (f.included) return `${itemPad}${rendered}`;
    // Excluded: comment out every line of the (possibly multi-line) block.
    return rendered
      .split('\n')
      .map((ln) => `${itemPad}// ${ln}`)
      .join('\n');
  });
  return `{\n${lines.join('\n')}\n${closePad}}`;
}

export function serializeBody(fields: BodyField[]): string {
  return serializeObject(fields, 0);
}

// Best-effort validity check used by callers/tests: strip comments and JSON.parse.
export function isSendable(jsonc: string): boolean {
  try {
    JSON.parse(stripJsonComments(jsonc || '{}'));
    return true;
  } catch {
    return false;
  }
}

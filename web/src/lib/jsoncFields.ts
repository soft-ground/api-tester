import { stripJsonComments } from './jsonc';

// Structured view of a JSON request body, kept fully compatible with the raw JSONC text
// (the single source of truth). "Required/optional" and "excluded" live as JSONC comments:
//
//   {
//     "amount": "100",      // required
//     "memo": "note"        // optional
//     // "purpose": "PAY",  // optional   (excluded -> commented out, not sent)
//   }
//
// v1 scope: top-level object properties. required/optional badges and the include toggle
// apply to PRIMITIVE-valued fields (single line). Object/array values are shown as-is and
// edited as raw JSON; manage their inclusion in the Raw view.

export type FieldMeta = 'required' | 'optional';

export interface BodyField {
  key: string;
  value: unknown; // parsed JS value
  included: boolean; // false => serialized as a commented-out line (not sent)
  meta?: FieldMeta; // trailing // required | // optional (primitives only)
}

export interface ParsedBody {
  ok: boolean; // false when the body is not a JSON object we can model structurally
  fields: BodyField[];
}

export function isPrimitive(v: unknown): boolean {
  return v === null || typeof v !== 'object';
}

function metaMap(raw: string): Record<string, FieldMeta> {
  const map: Record<string, FieldMeta> = {};
  for (const line of raw.split('\n')) {
    // A live property line: "key": ... // required|optional
    const m = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:.*\/\/\s*(required|optional)\b/);
    if (m) map[JSON.parse(`"${m[1]}"`)] = m[2] as FieldMeta;
  }
  return map;
}

function parseExcluded(raw: string): BodyField[] {
  const fields: BodyField[] = [];
  for (const line of raw.split('\n')) {
    // A commented-out property line: // "key": value[,] [// required|optional]
    const m = line.match(/^\s*\/\/\s*"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/);
    if (!m) continue;
    const key = JSON.parse(`"${m[1]}"`);
    let rest = m[2];

    let meta: FieldMeta | undefined;
    const mm = rest.match(/\/\/\s*(required|optional)\b/);
    if (mm) {
      meta = mm[1] as FieldMeta;
      rest = rest.slice(0, mm.index).trimEnd();
    }
    rest = rest.replace(/,\s*$/, '').trim();

    let value: unknown = rest;
    try {
      value = JSON.parse(rest);
    } catch {
      /* keep raw text if it is not valid JSON on its own */
    }
    fields.push({ key, value, included: false, meta });
  }
  return fields;
}

export function parseBody(jsonc: string): ParsedBody {
  let obj: unknown;
  try {
    obj = JSON.parse(stripJsonComments(jsonc || '{}'));
  } catch {
    return { ok: false, fields: [] };
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, fields: [] };
  }

  const metas = metaMap(jsonc);
  const fields: BodyField[] = Object.entries(obj as Record<string, unknown>).map(
    ([key, value]) => ({
      key,
      value,
      included: true,
      meta: isPrimitive(value) ? metas[key] : undefined,
    }),
  );
  // Excluded (commented-out) fields are appended in the order they appear.
  fields.push(...parseExcluded(jsonc));
  return { ok: true, fields };
}

export function serializeBody(fields: BodyField[]): string {
  if (fields.length === 0) return '{}';

  const lines = fields.map((f, i) => {
    const laterIncluded = fields.slice(i + 1).some((x) => x.included);
    const comma = laterIncluded ? ',' : '';

    // Re-indent continuation lines of a multi-line value by one level (2 spaces).
    const valueText = JSON.stringify(f.value, null, 2)
      .split('\n')
      .map((ln, idx) => (idx === 0 ? ln : '  ' + ln))
      .join('\n');

    const head = `  ${JSON.stringify(f.key)}: ${valueText}${comma}`;

    if (!f.included) {
      const metaSuffix = f.meta ? `   // ${f.meta}` : '';
      return `  // ${JSON.stringify(f.key)}: ${valueText}${comma}${metaSuffix}`;
    }
    return f.meta && isPrimitive(f.value) ? `${head}   // ${f.meta}` : head;
  });

  return `{\n${lines.join('\n')}\n}`;
}

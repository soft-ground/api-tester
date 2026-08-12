// Map an arbitrary JSON value to one or more spreadsheet tables (sheets).
//
// JSON is a tree and a spreadsheet is a grid, so the mapping follows a few predictable rules:
// - Every array-of-objects found anywhere in the tree becomes its own table sheet, named after its
//   key. Each row is flattened so a nested object inside an element turns into dot-path columns
//   (`results[].data.bankCode` -> a `data.bankCode` column); columns are the union across rows. This
//   handles both a top-level `data: [...]` and wrapped payloads like `{ code, data: { items: [...] } }`.
// - All the remaining scalar / nested-object fields go to a "Summary" sheet as key/value rows, with
//   nested objects flattened using dot paths (`data.total`).
// - Anything still nested inside a cell (an object, or an array that is not an array-of-objects) is
//   preserved as a JSON string, so nothing is lost even at irregular depth.

export interface SheetSpec {
  name: string;
  rows: unknown[][]; // row 0 is the header for table sheets; summary sheets are headerless key/value
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArrayOfObjects(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
}

// A single cell value: primitives pass through (so Excel keeps their type); objects/other arrays and
// null/undefined are stringified / blanked.
function cell(v: unknown): unknown {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v; // string | number | boolean
}

// Flatten one row: a nested object becomes dot-path entries (data.bankCode), while arrays and
// scalars stay as a single cell value. This lifts the useful fields of `results[].data` into columns
// instead of cramming them into one JSON cell.
function flattenRow(
  obj: Record<string, unknown>,
  prefix: string,
  out: Map<string, unknown>,
): void {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) flattenRow(v, path, out);
    else out.set(path, cell(v));
  }
}

function tableFromObjects(arr: Record<string, unknown>[]): unknown[][] {
  const flat = arr.map((el) => {
    const m = new Map<string, unknown>();
    flattenRow(el, '', m);
    return m;
  });
  const cols: string[] = [];
  for (const m of flat) for (const k of m.keys()) if (!cols.includes(k)) cols.push(k);
  const rows: unknown[][] = [cols];
  for (const m of flat) rows.push(cols.map((c) => (m.has(c) ? m.get(c) : '')));
  return rows;
}

// Walk object properties (any depth). Arrays-of-objects are collected as their own sheets; scalars
// and nested objects become dot-path summary rows; other arrays are kept as a JSON string.
function walk(
  obj: Record<string, unknown>,
  prefix: string,
  summary: unknown[][],
  arrays: { key: string; arr: Record<string, unknown>[] }[],
): void {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isArrayOfObjects(v)) arrays.push({ key: k, arr: v });
    else if (Array.isArray(v)) summary.push([path, JSON.stringify(v)]);
    else if (isPlainObject(v)) walk(v, path, summary, arrays);
    else summary.push([path, cell(v)]);
  }
}

// Excel sheet names: <= 31 chars, none of []:*?/\, non-empty, and unique within the workbook.
function sanitizeName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, '_').trim().slice(0, 31) || 'Sheet';
  let n = base;
  let i = 2;
  while (used.has(n.toLowerCase())) {
    const suffix = `_${i++}`;
    n = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(n.toLowerCase());
  return n;
}

export function jsonToSheets(data: unknown): SheetSpec[] {
  const used = new Set<string>();
  const sheets: SheetSpec[] = [];

  if (isArrayOfObjects(data)) {
    sheets.push({ name: sanitizeName('data', used), rows: tableFromObjects(data) });
    return sheets;
  }
  if (Array.isArray(data)) {
    // primitive / mixed root array -> a single "value" column
    const rows: unknown[][] = [['value'], ...data.map((el) => [cell(el)])];
    sheets.push({ name: sanitizeName('data', used), rows });
    return sheets;
  }
  if (isPlainObject(data)) {
    const summary: unknown[][] = [];
    const arrays: { key: string; arr: Record<string, unknown>[] }[] = [];
    walk(data, '', summary, arrays);
    if (summary.length) sheets.push({ name: sanitizeName('Summary', used), rows: summary });
    for (const { key, arr } of arrays) {
      sheets.push({ name: sanitizeName(key, used), rows: tableFromObjects(arr) });
    }
    if (sheets.length === 0) sheets.push({ name: sanitizeName('Summary', used), rows: [] });
    return sheets;
  }

  // primitive (or null) root
  sheets.push({ name: sanitizeName('Value', used), rows: [[cell(data)]] });
  return sheets;
}

// Lightweight JSONPath resolver: supports $.a.b, a.b, a.b[0].c, $[0].x (no external deps).
export function getByPath(obj: unknown, path: string): unknown {
  if (!path || path === '$') return obj;
  const norm = path
    .replace(/^\$/, '')
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/^\./, '');
  const parts = norm.split('.').filter(Boolean);
  let cur: any = obj;
  for (const key of parts) {
    if (cur == null) return undefined;
    cur = cur[key];
  }
  return cur;
}

export interface AssertDef {
  target?: string; // 'status' | 'body'
  path?: string; // JSONPath when target is 'body'
  op: string; // eq | ne | contains | exists | gt | lt
  value?: string;
}

export interface AssertResult extends AssertDef {
  actual: unknown;
  passed: boolean;
}

// Evaluate an assertion. 'status' targets the response status code; 'body' targets a JSON path value.
export function evalAssert(
  a: AssertDef,
  status: number | null,
  parsedBody: unknown,
): AssertResult {
  let actual: unknown;
  if (a.target === 'status') {
    actual = status;
  } else {
    actual = getByPath(parsedBody, a.path ?? '');
  }

  let passed = false;
  const exp = a.value;
  switch (a.op) {
    case 'exists':
      passed = actual !== undefined && actual !== null;
      break;
    case 'eq':
      passed = String(actual) === String(exp);
      break;
    case 'ne':
      passed = String(actual) !== String(exp);
      break;
    case 'contains':
      passed = String(actual ?? '').includes(String(exp ?? ''));
      break;
    case 'gt':
      passed = Number(actual) > Number(exp);
      break;
    case 'lt':
      passed = Number(actual) < Number(exp);
      break;
    default:
      passed = false;
  }
  return { ...a, actual, passed };
}

export function safeJsonParse(raw: string | null | undefined): unknown {
  if (raw == null || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

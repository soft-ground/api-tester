import { randomUUID } from 'crypto';
import { Parser } from 'expr-eval';

// Simple date formatter supporting yyyy MM dd HH mm ss SSS tokens.
export function formatDate(date: Date, fmt: string): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const map: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    dd: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
  };
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss|SSS/g, (t) => map[t] ?? t);
}

// Helper functions available inside expressions.
export function buildHelpers(): Record<string, unknown> {
  return {
    now: (fmt?: string) =>
      fmt ? formatDate(new Date(), fmt) : new Date().toISOString(),
    timestamp: () => Date.now(),
    pad: (v: unknown, len: number, ch = '0') =>
      String(v).padStart(Number(len), String(ch)),
    upper: (s: unknown) => String(s).toUpperCase(),
    lower: (s: unknown) => String(s).toLowerCase(),
    len: (s: unknown) => String(s).length,
    concat: (...parts: unknown[]) => parts.map((p) => String(p)).join(''),
    uuid: () => randomUUID(),
    randomInt: (min: number, max: number) =>
      Math.floor(Math.random() * (Number(max) - Number(min) + 1)) +
      Number(min),
  };
}

const parser = new Parser();

// Safe expression evaluation (no eval). Injects variables/helpers into the scope.
export function evalExpression(
  expr: string,
  scope: Record<string, unknown>,
): string {
  const helpers = buildHelpers();
  const merged = { ...scope, ...helpers };
  const value = parser.parse(expr).evaluate(merged as any);
  return value == null ? '' : String(value);
}

// The identifiers an expression references (variable names, excluding literals). Helper function
// names may be included; callers filter to the names they care about. Returns [] on a parse error.
export function expressionVariables(expr: string): string[] {
  try {
    return parser.parse(expr).variables();
  } catch {
    return [];
  }
}

// Produce a single rule value. For 'sequence', state is incremented only when persist=true.
export interface RuleLike {
  name: string;
  type: string;
  config: any;
  state: any;
}

export function resolveSimpleRule(
  rule: RuleLike,
): { value: string; nextState?: any } {
  const cfg = rule.config ?? {};
  switch (rule.type) {
    case 'fixed':
      return { value: String(cfg.value ?? '') };

    case 'sequence': {
      const start = Number(cfg.start ?? 1);
      const step = Number(cfg.step ?? 1);
      const current =
        rule.state && rule.state.current != null
          ? Number(rule.state.current)
          : start;
      const padLen = cfg.pad ? Number(cfg.pad) : 0;
      const prefix = cfg.prefix ?? '';
      const body = padLen
        ? String(current).padStart(padLen, '0')
        : String(current);
      return {
        value: `${prefix}${body}`,
        nextState: { current: current + step },
      };
    }

    case 'timestamp': {
      const format = cfg.format;
      if (format === 'epoch') return { value: String(Date.now()) };
      if (format === 'epochSec')
        return { value: String(Math.floor(Date.now() / 1000)) };
      if (format && format !== 'iso')
        return { value: formatDate(new Date(), format) };
      return { value: new Date().toISOString() };
    }

    case 'uuid':
      return { value: randomUUID() };

    case 'random': {
      if (cfg.type === 'hex') {
        const len = Number(cfg.length ?? 8);
        let s = '';
        while (s.length < len) s += Math.random().toString(16).slice(2);
        return { value: s.slice(0, len) };
      }
      const min = Number(cfg.min ?? 0);
      const max = Number(cfg.max ?? 100);
      return {
        value: String(Math.floor(Math.random() * (max - min + 1)) + min),
      };
    }

    default:
      return { value: '' };
  }
}

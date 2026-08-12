import { describe, it, expect } from 'vitest';
import {
  formatDate,
  evalExpression,
  expressionVariables,
  resolveSimpleRule,
} from '../src/variables/engine';

describe('formatDate', () => {
  it('substitutes tokens with local time components', () => {
    // built from local components → TZ-independent
    const d = new Date(2024, 0, 5, 9, 3, 7, 42);
    expect(formatDate(d, 'yyyy-MM-dd HH:mm:ss.SSS')).toBe(
      '2024-01-05 09:03:07.042',
    );
  });
  it('leaves unknown characters as-is', () => {
    expect(formatDate(new Date(2024, 11, 31), 'yyyy/MM literal')).toBe(
      '2024/12 literal',
    );
  });
});

describe('evalExpression', () => {
  it('arithmetic / precedence', () => {
    expect(evalExpression('1 + 2 * 3', {})).toBe('7');
  });
  it('injects scope variables', () => {
    expect(evalExpression('x + 1', { x: 5 })).toBe('6');
  });
  it('helpers: concat/upper/lower/pad/len', () => {
    expect(evalExpression('concat("ORD", "123")', {})).toBe('ORD123');
    expect(evalExpression('upper("abc")', {})).toBe('ABC');
    expect(evalExpression('lower("ABC")', {})).toBe('abc');
    expect(evalExpression('pad(5, 4)', {})).toBe('0005');
    expect(evalExpression('len("hello")', {})).toBe('5');
  });
  it('uuid helper → 36 chars', () => {
    expect(evalExpression('uuid()', {})).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
  it('lists referenced identifiers so per-use expressions can advance their deps', () => {
    const vars = expressionVariables('concat(currentDate, currentTime, pad(seq, 6))');
    expect(vars).toContain('currentDate');
    expect(vars).toContain('currentTime');
    expect(vars).toContain('seq');
  });
  it('returns [] on a parse error instead of throwing', () => {
    expect(expressionVariables('concat(')).toEqual([]);
  });

  it('invalid expression throws', () => {
    expect(() => evalExpression('1 +', {})).toThrow();
  });
});

describe('resolveSimpleRule', () => {
  const rule = (type: string, config: any = {}, state: any = {}) =>
    resolveSimpleRule({ name: 'r', type, config, state });

  it('fixed', () => {
    expect(rule('fixed', { value: 'hi' }).value).toBe('hi');
  });

  it('sequence: start value / next state', () => {
    const r = rule('sequence', { start: 1, step: 1 }, {});
    expect(r.value).toBe('1');
    expect(r.nextState).toEqual({ current: 2 });
  });
  it('sequence: continues from current state + step', () => {
    const r = rule('sequence', { start: 1, step: 2 }, { current: 5 });
    expect(r.value).toBe('5');
    expect(r.nextState).toEqual({ current: 7 });
  });
  it('sequence: pad + prefix', () => {
    const r = rule('sequence', { start: 5, pad: 4, prefix: 'ORD' }, {});
    expect(r.value).toBe('ORD0005');
  });

  it('timestamp: epoch/epochSec/iso', () => {
    expect(rule('timestamp', { format: 'epoch' }).value).toMatch(/^\d+$/);
    expect(rule('timestamp', { format: 'epochSec' }).value).toMatch(/^\d{10}$/);
    expect(rule('timestamp', { format: 'iso' }).value).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });

  it('uuid', () => {
    expect(rule('uuid').value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('random: hex length / min-max range', () => {
    expect(rule('random', { type: 'hex', length: 8 }).value).toMatch(
      /^[0-9a-f]{8}$/,
    );
    const n = Number(rule('random', { min: 10, max: 12 }).value);
    expect(n).toBeGreaterThanOrEqual(10);
    expect(n).toBeLessThanOrEqual(12);
  });
});

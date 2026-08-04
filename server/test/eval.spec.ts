import { describe, it, expect } from 'vitest';
import { getByPath, evalAssert, safeJsonParse } from '../src/scenarios/eval';

describe('getByPath', () => {
  const obj = { a: { b: { c: 1 } }, items: [{ id: 10 }, { id: 20 }] };

  it('$ is the root', () => {
    expect(getByPath(obj, '$')).toBe(obj);
    expect(getByPath(obj, '')).toBe(obj);
  });
  it('dot access (with or without $)', () => {
    expect(getByPath(obj, '$.a.b.c')).toBe(1);
    expect(getByPath(obj, 'a.b.c')).toBe(1);
  });
  it('array index', () => {
    expect(getByPath(obj, '$.items[1].id')).toBe(20);
    expect(getByPath([{ x: 'first' }], '$[0].x')).toBe('first');
  });
  it('missing path / null in the middle → undefined', () => {
    expect(getByPath(obj, '$.a.zzz')).toBeUndefined();
    expect(getByPath({ a: null }, '$.a.b')).toBeUndefined();
  });
});

describe('evalAssert', () => {
  it('status target', () => {
    expect(evalAssert({ target: 'status', op: 'eq', value: '200' }, 200, null).passed).toBe(true);
    expect(evalAssert({ target: 'status', op: 'ne', value: '200' }, 404, null).passed).toBe(true);
  });
  it('body target + JSONPath', () => {
    const body = { data: { token: 'abc', count: 5 } };
    expect(evalAssert({ target: 'body', path: '$.data.token', op: 'eq', value: 'abc' }, 200, body).passed).toBe(true);
    expect(evalAssert({ target: 'body', path: '$.data.token', op: 'contains', value: 'b' }, 200, body).passed).toBe(true);
  });
  it('op: exists / gt / lt', () => {
    const body = { n: 5 };
    expect(evalAssert({ target: 'body', path: '$.n', op: 'exists' }, 200, body).passed).toBe(true);
    expect(evalAssert({ target: 'body', path: '$.missing', op: 'exists' }, 200, body).passed).toBe(false);
    expect(evalAssert({ target: 'body', path: '$.n', op: 'gt', value: '3' }, 200, body).passed).toBe(true);
    expect(evalAssert({ target: 'body', path: '$.n', op: 'lt', value: '3' }, 200, body).passed).toBe(false);
  });
  it('includes actual on failure', () => {
    const r = evalAssert({ target: 'status', op: 'eq', value: '200' }, 404, null);
    expect(r.passed).toBe(false);
    expect(r.actual).toBe(404);
  });
});

describe('safeJsonParse', () => {
  it('valid JSON', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });
  it('invalid/empty input → null', () => {
    expect(safeJsonParse('not json')).toBeNull();
    expect(safeJsonParse('')).toBeNull();
    expect(safeJsonParse(null)).toBeNull();
    expect(safeJsonParse(undefined)).toBeNull();
  });
});

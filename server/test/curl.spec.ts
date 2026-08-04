import { describe, it, expect } from 'vitest';
import { parseCurl } from '../src/import/curl';

describe('parseCurl', () => {
  it('method / URL split / headers / body / Bearer promotion', () => {
    const r = parseCurl(
      `curl -X POST 'https://api.example.com/orders?limit=10' -H 'Content-Type: application/json' -H 'Authorization: Bearer TOK123' -d '{"a":1}'`,
    );
    expect(r.method).toBe('POST');
    expect(r.baseUrl).toBe('https://api.example.com');
    expect(r.path).toBe('/orders');
    expect(r.queryParams).toEqual([{ key: 'limit', value: '10', enabled: true }]);
    // Authorization is promoted to auth, so headers keeps only content-type
    expect(r.headers).toEqual([
      { key: 'Content-Type', value: 'application/json', enabled: true },
    ]);
    expect(r.authType).toBe('bearer');
    expect(r.authConfig.token).toBe('TOK123');
    expect(r.bodyType).toBe('json');
    expect(r.bodyTemplate).toBe('{"a":1}');
  });

  it('basic auth (-u user:pass)', () => {
    const r = parseCurl(`curl -u alice:secret https://x.test/api`);
    expect(r.authType).toBe('basic');
    expect(r.authConfig.username).toBe('alice');
    expect(r.authConfig.password).toBe('secret');
  });

  it('method default: POST when a body is present, otherwise GET', () => {
    expect(parseCurl(`curl https://x.test/a`).method).toBe('GET');
    expect(parseCurl(`curl https://x.test/a -d 'x=1'`).method).toBe('POST');
  });

  it('--url flag and ignored flags (-s, -L)', () => {
    const r = parseCurl(`curl -s -L --url https://x.test/path`);
    expect(r.method).toBe('GET');
    expect(r.baseUrl).toBe('https://x.test');
    expect(r.path).toBe('/path');
  });

  it('multiple --data-* aliases', () => {
    expect(parseCurl(`curl https://x.test --data-raw 'hello'`).bodyTemplate).toBe('hello');
  });
});

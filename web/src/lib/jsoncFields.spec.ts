import { describe, it, expect } from 'vitest';
import { parseBody, serializeBody, BodyField } from './jsoncFields';
import { stripJsonComments } from './jsonc';

const sample = [
  '{',
  '  "Header": {',
  '    "apiName": "createVirtualAccount",',
  '    "apiKey": "{{apiKey}}"',
  '  },',
  '  "mainAccountNo": "{{acct}}",   // required',
  '  "depositorName": "name",',
  '  "expectedAmount": "100000",   // optional',
  '  "memo": "note"   // optional',
  '}',
].join('\n');

describe('parseBody', () => {
  it('models top-level fields with meta and nested object', () => {
    const { ok, fields } = parseBody(sample);
    expect(ok).toBe(true);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(byKey.mainAccountNo.meta).toBe('required');
    expect(byKey.expectedAmount.meta).toBe('optional');
    expect(byKey.memo.meta).toBe('optional');
    // nested object value preserved, no meta on object fields
    expect(byKey.Header.value).toEqual({
      apiName: 'createVirtualAccount',
      apiKey: '{{apiKey}}',
    });
    expect(byKey.Header.meta).toBeUndefined();
    // {{var}} preserved in string values
    expect(byKey.mainAccountNo.value).toBe('{{acct}}');
  });

  it('returns ok:false for a non-object body', () => {
    expect(parseBody('[1,2,3]').ok).toBe(false);
    expect(parseBody('not json').ok).toBe(false);
  });
});

describe('round-trip', () => {
  it('serialize -> parse is stable (idempotent structure)', () => {
    const first = parseBody(sample).fields;
    const text = serializeBody(first);
    const second = parseBody(text).fields;
    expect(second.map((f) => [f.key, f.included, f.meta])).toEqual(
      first.map((f) => [f.key, f.included, f.meta]),
    );
    // and serializing again yields identical text
    expect(serializeBody(second)).toBe(text);
  });

  it('serialized output is valid JSON once comments are stripped', () => {
    const text = serializeBody(parseBody(sample).fields);
    expect(() => JSON.parse(stripJsonComments(text))).not.toThrow();
  });
});

describe('include toggle (exclude an optional field)', () => {
  it('excluded field is commented out and dropped from the sent JSON, but survives re-parse', () => {
    const fields = parseBody(sample).fields.map((f) =>
      f.key === 'memo' ? { ...f, included: false } : f,
    );
    const text = serializeBody(fields);
    // not sent
    const sent = JSON.parse(stripJsonComments(text));
    expect('memo' in sent).toBe(false);
    expect(sent.mainAccountNo).toBe('{{acct}}');
    // but still present in the structured view (as excluded), with value + meta intact
    const memo = parseBody(text).fields.find((f) => f.key === 'memo');
    expect(memo).toBeDefined();
    expect(memo!.included).toBe(false);
    expect(memo!.value).toBe('note');
    expect(memo!.meta).toBe('optional');
  });

  it('re-including an excluded field puts it back in the sent JSON', () => {
    const excluded: BodyField = {
      key: 'purpose',
      value: 'PAYMENT',
      included: false,
      meta: 'optional',
    };
    const fields = [...parseBody(sample).fields, excluded];
    const reincluded = fields.map((f) =>
      f.key === 'purpose' ? { ...f, included: true } : f,
    );
    const sent = JSON.parse(stripJsonComments(serializeBody(reincluded)));
    expect(sent.purpose).toBe('PAYMENT');
  });
});

describe('value fidelity', () => {
  it('keeps http:// and glob-like strings intact through a round-trip', () => {
    const src = '{\n  "url": "http://x/a",\n  "glob": "src/**/*.ts"\n}';
    const text = serializeBody(parseBody(src).fields);
    expect(JSON.parse(stripJsonComments(text))).toEqual({
      url: 'http://x/a',
      glob: 'src/**/*.ts',
    });
  });

  it('handles non-string primitives', () => {
    const src = '{\n  "n": 42,   // required\n  "b": true,\n  "z": null\n}';
    const f = parseBody(src).fields;
    const byKey = Object.fromEntries(f.map((x) => [x.key, x]));
    expect(byKey.n.value).toBe(42);
    expect(byKey.n.meta).toBe('required');
    expect(byKey.b.value).toBe(true);
    expect(byKey.z.value).toBe(null);
    expect(JSON.parse(stripJsonComments(serializeBody(f)))).toEqual({
      n: 42,
      b: true,
      z: null,
    });
  });
});

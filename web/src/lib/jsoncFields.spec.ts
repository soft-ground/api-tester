import { describe, it, expect } from 'vitest';
import {
  BodyField,
  parseBody,
  serializeBody,
  isPrimitive,
  isArrayLeaf,
} from './jsoncFields';
import { stripJsonComments } from './jsonc';

const sample = [
  '{',
  '  "Header": {',
  '    "apiName": "createVirtualAccount",   // required',
  '    "apiKey": "{{apiKey}}",   // required',
  '    "memo": "note"   // optional',
  '  },',
  '  "virtualAccountId": "{{acct}}"   // required',
  '}',
].join('\n');

function field(fields: BodyField[], key: string) {
  return fields.find((f) => f.key === key)!;
}

describe('parseBody (recursive)', () => {
  it('parses nested object fields with per-level meta', () => {
    const { ok, fields } = parseBody(sample);
    expect(ok).toBe(true);

    const header = field(fields, 'Header');
    expect(header.value.kind).toBe('object');

    const hf = (header.value as any).fields as BodyField[];
    expect(field(hf, 'apiName').meta).toBe('required');
    expect(field(hf, 'apiKey').meta).toBe('required');
    expect(field(hf, 'memo').meta).toBe('optional');
    // nested {{var}} preserved
    expect((field(hf, 'apiKey').value as any).value).toBe('{{apiKey}}');

    const va = field(fields, 'virtualAccountId');
    expect(va.meta).toBe('required');
    expect((va.value as any).value).toBe('{{acct}}');
  });

  it('returns ok:false for a non-object body', () => {
    expect(parseBody('[1,2,3]').ok).toBe(false);
    expect(parseBody('nope').ok).toBe(false);
  });

  it('parses an empty body as no fields', () => {
    expect(parseBody('').fields).toEqual([]);
    expect(parseBody('{}').fields).toEqual([]);
  });
});

describe('round-trip (recursive)', () => {
  it('serialize -> parse -> serialize is stable', () => {
    const first = parseBody(sample).fields;
    const text1 = serializeBody(first);
    const text2 = serializeBody(parseBody(text1).fields);
    expect(text2).toBe(text1);
  });

  it('serialized output is valid JSON once comments are stripped', () => {
    const text = serializeBody(parseBody(sample).fields);
    expect(JSON.parse(stripJsonComments(text))).toEqual({
      Header: {
        apiName: 'createVirtualAccount',
        apiKey: '{{apiKey}}',
        memo: 'note',
      },
      virtualAccountId: '{{acct}}',
    });
  });
});

describe('nested exclude', () => {
  it('excludes a nested optional field; it is dropped from the sent JSON but survives re-parse', () => {
    const fields = parseBody(sample).fields;
    const header = field(fields, 'Header');
    const hf = (header.value as any).fields as BodyField[];
    const nextHf = hf.map((f) =>
      f.key === 'memo' ? { ...f, included: false } : f,
    );
    const nextFields = fields.map((f) =>
      f.key === 'Header' ? { ...f, value: { kind: 'object', fields: nextHf } } : f,
    ) as BodyField[];

    const text = serializeBody(nextFields);
    const sent = JSON.parse(stripJsonComments(text));
    expect('memo' in sent.Header).toBe(false);
    expect(sent.Header.apiName).toBe('createVirtualAccount');

    // re-parse: memo still present as an excluded field with its value/meta
    const memo = field(
      (field(parseBody(text).fields, 'Header').value as any).fields,
      'memo',
    );
    expect(memo.included).toBe(false);
    expect((memo.value as any).value).toBe('note');
    expect(memo.meta).toBe('optional');
  });
});

describe('value shapes', () => {
  it('keeps arrays as a leaf and non-string primitives typed', () => {
    const src = '{\n  "tags": ["a", "b"],\n  "n": 42,\n  "ok": true\n}';
    const fields = parseBody(src).fields;
    expect(isArrayLeaf(field(fields, 'tags'))).toBe(true);
    expect((field(fields, 'n').value as any).value).toBe(42);
    expect(isPrimitive((field(fields, 'n').value as any).value)).toBe(true);
    expect(JSON.parse(stripJsonComments(serializeBody(fields)))).toEqual({
      tags: ['a', 'b'],
      n: 42,
      ok: true,
    });
  });

  it('preserves http:// and glob strings', () => {
    const src = '{\n  "u": "http://x/a",\n  "g": "src/**/*.ts"\n}';
    expect(JSON.parse(stripJsonComments(serializeBody(parseBody(src).fields)))).toEqual(
      { u: 'http://x/a', g: 'src/**/*.ts' },
    );
  });
});

import { describe, it, expect } from 'vitest';
import { BodyField, FieldValue, parseBody, serializeBody } from './jsoncFields';
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

const f = (fields: BodyField[], key: string) => fields.find((x) => x.key === key)!;
const objFields = (fv: FieldValue) => (fv as { kind: 'object'; fields: BodyField[] }).fields;
const arrItems = (fv: FieldValue) => (fv as { kind: 'array'; items: FieldValue[] }).items;
const leaf = (fv: FieldValue) => (fv as { kind: 'leaf'; value: unknown }).value;
const sent = (text: string) => JSON.parse(stripJsonComments(text));

describe('parse + round-trip', () => {
  it('parses nested fields with per-level meta and is stable', () => {
    const fields = parseBody(sample).fields;
    const hf = objFields(f(fields, 'Header').value);
    expect(f(hf, 'apiName').meta).toBe('required');
    expect(f(hf, 'memo').meta).toBe('optional');
    expect(leaf(f(hf, 'apiKey').value)).toBe('{{apiKey}}');

    const text1 = serializeBody(fields);
    const text2 = serializeBody(parseBody(text1).fields);
    expect(text2).toBe(text1);
    expect(sent(text1)).toEqual({
      Header: {
        apiName: 'createVirtualAccount',
        apiKey: '{{apiKey}}',
        memo: 'note',
      },
      virtualAccountId: '{{acct}}',
    });
  });

  it('ok:false for non-object bodies, empty for blank', () => {
    expect(parseBody('[1,2]').ok).toBe(false);
    expect(parseBody('nope').ok).toBe(false);
    expect(parseBody('').fields).toEqual([]);
  });
});

describe('exclude a whole object (multi-line) round-trips', () => {
  it('comments out the object, drops it from the sent JSON, and re-parses as excluded', () => {
    const fields = parseBody(sample).fields.map((x) =>
      x.key === 'Header' ? { ...x, included: false } : x,
    );
    const text = serializeBody(fields);
    // dropped from the request
    expect('Header' in sent(text)).toBe(false);
    expect(sent(text)).toEqual({ virtualAccountId: '{{acct}}' });
    // re-parses as an excluded object whose children (and their meta) survived
    const re = parseBody(text).fields;
    const header = f(re, 'Header');
    expect(header.included).toBe(false);
    expect(header.value.kind).toBe('object');
    const hf = objFields(header.value);
    expect(f(hf, 'apiName').meta).toBe('required');
    expect(leaf(f(hf, 'apiKey').value)).toBe('{{apiKey}}');
  });
});

describe('arrays are structural', () => {
  const src = [
    '{',
    '  "students": [',
    '    {',
    '      "id": "1",   // required',
    '      "nick": "a"   // optional',
    '    },',
    '    "raw-item"',
    '  ],',
    '  "count": 2',
    '}',
  ].join('\n');

  it('parses array items (objects keep nested meta) and non-string primitives', () => {
    const fields = parseBody(src).fields;
    const students = f(fields, 'students');
    expect(students.value.kind).toBe('array');
    const items = arrItems(students.value);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('object');
    expect(f(objFields(items[0]), 'id').meta).toBe('required');
    expect(f(objFields(items[0]), 'nick').meta).toBe('optional');
    expect(leaf(items[1])).toBe('raw-item');
    expect(leaf(f(fields, 'count').value)).toBe(2);
  });

  it('round-trips arrays losslessly (including nested annotations)', () => {
    const fields = parseBody(src).fields;
    const text = serializeBody(fields);
    expect(serializeBody(parseBody(text).fields)).toBe(text);
    expect(sent(text)).toEqual({
      students: [{ id: '1', nick: 'a' }, 'raw-item'],
      count: 2,
    });
  });

  it('excluding a whole array removes it from the sent JSON but keeps it in the model', () => {
    const fields = parseBody(src).fields.map((x) =>
      x.key === 'students' ? { ...x, included: false } : x,
    );
    const text = serializeBody(fields);
    expect('students' in sent(text)).toBe(false);
    const re = f(parseBody(text).fields, 'students');
    expect(re.included).toBe(false);
    expect(re.value.kind).toBe('array');
    expect(arrItems(re.value)).toHaveLength(2);
  });
});

describe('trailing comments beyond required/optional', () => {
  it('keeps free-text notes next to the meta token and preserves them when meta changes', () => {
    const src = [
      '{',
      '  "a": "1",   // required account holder',
      '  "b": "2",   // just a note',
      '  "c": "3"   // optional (nullable)',
      '}',
    ].join('\n');
    const fields = parseBody(src).fields;
    expect(f(fields, 'a').meta).toBe('required');
    expect(f(fields, 'a').comment).toBe('account holder');
    expect(f(fields, 'b').meta).toBeUndefined();
    expect(f(fields, 'b').comment).toBe('just a note');
    expect(f(fields, 'c').meta).toBe('optional');
    expect(f(fields, 'c').comment).toBe('(nullable)');

    const text = serializeBody(fields);
    expect(serializeBody(parseBody(text).fields)).toBe(text);

    // toggling the badge on a free-comment field must not discard the note
    const toggled = fields.map((x) => (x.key === 'b' ? { ...x, meta: 'required' as const } : x));
    const re = f(parseBody(serializeBody(toggled)).fields, 'b');
    expect(re.meta).toBe('required');
    expect(re.comment).toBe('just a note');
  });

  it('only treats required/optional as meta when it is the first token', () => {
    const src = [
      '{',
      '  "a": "1",   // see spec, required for prod',
      '  "b": "2",   // optionalish note',
      '  "c": "3"   // required',
      '}',
    ].join('\n');
    const fields = parseBody(src).fields;
    // keyword mid-sentence -> stays a plain comment
    expect(f(fields, 'a').meta).toBeUndefined();
    expect(f(fields, 'a').comment).toBe('see spec, required for prod');
    // keyword is only a prefix of a longer word -> not meta
    expect(f(fields, 'b').meta).toBeUndefined();
    expect(f(fields, 'b').comment).toBe('optionalish note');
    // bare leading keyword -> meta, no free text
    expect(f(fields, 'c').meta).toBe('required');
    expect(f(fields, 'c').comment).toBeUndefined();
    // round-trips unchanged
    const text = serializeBody(fields);
    expect(serializeBody(parseBody(text).fields)).toBe(text);
  });
});

describe('meta on object and array fields', () => {
  it('serializes required/optional after the closing brace/bracket and round-trips', () => {
    const fields: BodyField[] = [
      {
        key: 'obj',
        included: true,
        meta: 'required',
        value: { kind: 'object', fields: [{ key: 'x', included: true, value: { kind: 'leaf', value: '1' } }] },
      },
      {
        key: 'arr',
        included: true,
        meta: 'optional',
        comment: 'list of ids',
        value: { kind: 'array', items: [{ kind: 'leaf', value: '1' }] },
      },
    ];
    const text = serializeBody(fields);
    const re = parseBody(text).fields;
    expect(f(re, 'obj').meta).toBe('required');
    expect(f(re, 'arr').meta).toBe('optional');
    expect(f(re, 'arr').comment).toBe('list of ids');
    expect(serializeBody(re)).toBe(text);
    expect(sent(text)).toEqual({ obj: { x: '1' }, arr: ['1'] });
  });
});

describe('leaf value types', () => {
  it('round-trips unquoted number / boolean / null literals', () => {
    const src = '{\n  "n": 42,\n  "b": true,\n  "z": null,\n  "s": "text"\n}';
    const fields = parseBody(src).fields;
    expect(leaf(f(fields, 'n').value)).toBe(42);
    expect(leaf(f(fields, 'b').value)).toBe(true);
    expect(leaf(f(fields, 'z').value)).toBe(null);
    expect(sent(serializeBody(fields))).toEqual({ n: 42, b: true, z: null, s: 'text' });
  });
});

describe('value fidelity', () => {
  it('preserves http:// and glob strings, and {{var}} placeholders', () => {
    const src = '{\n  "u": "http://x/a",\n  "g": "src/**/*.ts",\n  "v": "{{k}}"\n}';
    expect(sent(serializeBody(parseBody(src).fields))).toEqual({
      u: 'http://x/a',
      g: 'src/**/*.ts',
      v: '{{k}}',
    });
  });
});

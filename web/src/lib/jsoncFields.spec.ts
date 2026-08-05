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

import { describe, it, expect } from 'vitest';
import { stripJsonComments } from '../src/executor/jsonc';

describe('stripJsonComments', () => {
  it('removes a trailing line comment', () => {
    const out = stripJsonComments('{"a": 1} // hello');
    expect(out).not.toContain('hello');
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it('removes an inline block comment', () => {
    const out = stripJsonComments('{"a": /* note */ 1}');
    expect(JSON.parse(out)).toEqual({ a: 1 });
  });

  it('keeps // inside a string value (e.g. a URL)', () => {
    const src = '{"url": "http://example.com/x"}';
    const out = stripJsonComments(src);
    expect(JSON.parse(out)).toEqual({ url: 'http://example.com/x' });
  });

  it('keeps /* inside a string value', () => {
    const src = '{"glob": "src/**/*.ts"}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ glob: 'src/**/*.ts' });
  });

  it('strips per-field annotations and yields valid JSON', () => {
    const src = [
      '{',
      '  "amount": "100",   // required',
      '  "memo": "note"     // optional',
      '}',
    ].join('\n');
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      amount: '100',
      memo: 'note',
    });
  });

  it('supports commenting out an optional field with a whole line', () => {
    const src = [
      '{',
      '  "required1": "x",',
      '  // "optional1": "y",',
      '  "required2": "z"',
      '}',
    ].join('\n');
    expect(JSON.parse(stripJsonComments(src))).toEqual({
      required1: 'x',
      required2: 'z',
    });
  });

  it('does not treat an escaped quote as the end of a string', () => {
    const src = '{"q": "he said \\"hi\\" //x"}';
    expect(JSON.parse(stripJsonComments(src))).toEqual({ q: 'he said "hi" //x' });
  });

  it('leaves {{var}} placeholders in real values intact', () => {
    const src = '{\n  "id": "{{userKey}}", // required\n  "n": "1"\n}';
    const out = stripJsonComments(src);
    expect(out).toContain('{{userKey}}');
    expect(out).not.toContain('required');
  });

  it('is a no-op when there are no comments', () => {
    const src = '{"a":1,"b":[1,2,3]}';
    expect(stripJsonComments(src)).toBe(src);
  });
});

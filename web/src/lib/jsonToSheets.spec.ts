import { describe, it, expect } from 'vitest';
import { jsonToSheets } from './jsonToSheets';

describe('jsonToSheets', () => {
  it('maps a scalar + array-of-objects response (the bank-list example)', () => {
    const data = {
      result: 'success',
      data: [
        { bankCode: '001', bankName: '한국은행' },
        { bankCode: '002', bankName: '산업은행' },
        { bankCode: '003', bankName: '기업은행' },
      ],
    };
    const sheets = jsonToSheets(data);
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'data']);
    // scalar -> headerless key/value
    expect(sheets[0].rows).toEqual([['result', 'success']]);
    // array-of-objects -> header + one row per element
    expect(sheets[1].rows).toEqual([
      ['bankCode', 'bankName'],
      ['001', '한국은행'],
      ['002', '산업은행'],
      ['003', '기업은행'],
    ]);
  });

  it('maps a root array to a single table sheet', () => {
    const sheets = jsonToSheets([{ id: 1 }, { id: 2 }]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('data');
    expect(sheets[0].rows).toEqual([['id'], [1], [2]]);
  });

  it('flattens nested objects into dot paths in the summary', () => {
    const sheets = jsonToSheets({ user: { id: 7, addr: { city: 'Seoul' } }, ok: true });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Summary');
    expect(sheets[0].rows).toEqual([
      ['user.id', 7],
      ['user.addr.city', 'Seoul'],
      ['ok', true],
    ]);
  });

  it('unions ragged keys and blanks missing cells; keeps null as blank', () => {
    const sheets = jsonToSheets([
      { a: 1, b: 2 },
      { a: 3, c: 4 },
      { a: null },
    ]);
    expect(sheets[0].rows).toEqual([
      ['a', 'b', 'c'],
      [1, 2, ''],
      [3, '', 4],
      ['', '', ''],
    ]);
  });

  it('flattens a nested object in a row into dot-path columns; arrays stay JSON strings', () => {
    const sheets = jsonToSheets([{ id: 1, tags: ['x', 'y'], meta: { k: 'v' } }]);
    expect(sheets[0].rows).toEqual([
      ['id', 'tags', 'meta.k'],
      [1, '["x","y"]', 'v'],
    ]);
  });

  it('flattens results[].data into columns (batch-create response)', () => {
    const data = {
      totalCount: 3,
      failCount: 0,
      continueOnError: false,
      reference: null,
      registeredDate: '20260810',
      results: [
        { index: 0, success: true, data: { bankCode: '001', accountName: '상품1' } },
        { index: 1, success: true, data: { bankCode: '001', accountName: '상품2' } },
      ],
    };
    const sheets = jsonToSheets(data);
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'results']);
    expect(sheets[0].rows).toEqual([
      ['totalCount', 3],
      ['failCount', 0],
      ['continueOnError', false],
      ['reference', ''],
      ['registeredDate', '20260810'],
    ]);
    expect(sheets[1].rows).toEqual([
      ['index', 'success', 'data.bankCode', 'data.accountName'],
      [0, true, '001', '상품1'],
      [1, true, '001', '상품2'],
    ]);
  });

  it('promotes an array-of-objects nested inside an object to its own sheet', () => {
    const sheets = jsonToSheets({ code: 200, data: { total: 2, items: [{ id: 1 }, { id: 2 }] } });
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'items']);
    expect(sheets[0].rows).toEqual([
      ['code', 200],
      ['data.total', 2],
    ]);
    expect(sheets[1].rows).toEqual([['id'], [1], [2]]);
  });

  it('keeps a primitive array as a JSON-string cell in the summary', () => {
    const sheets = jsonToSheets({ ok: true, tags: ['a', 'b'] });
    expect(sheets.map((s) => s.name)).toEqual(['Summary']);
    expect(sheets[0].rows).toEqual([
      ['ok', true],
      ['tags', '["a","b"]'],
    ]);
  });

  it('maps a root primitive array to a single value column', () => {
    const sheets = jsonToSheets(['a', 'b']);
    expect(sheets[0].name).toBe('data');
    expect(sheets[0].rows).toEqual([['value'], ['a'], ['b']]);
  });

  it('deduplicates and sanitizes sheet names', () => {
    const sheets = jsonToSheets({ 'a/b': [{ x: 1 }], 'a:b': [{ y: 2 }] });
    expect(sheets.map((s) => s.name)).toEqual(['a_b', 'a_b_2']);
  });

  it('produces a sheet even for an empty object', () => {
    const sheets = jsonToSheets({});
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toEqual([]);
  });
});

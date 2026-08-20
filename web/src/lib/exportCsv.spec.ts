import { describe, it, expect } from 'vitest';
import { aoaToCsv, csvFilename } from './exportCsv';

describe('aoaToCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(aoaToCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('quotes cells containing a comma, quote, or newline (doubling inner quotes)', () => {
    const csv = aoaToCsv([
      ['plain', 'has,comma', 'has"quote', 'has\nnewline'],
    ]);
    expect(csv).toBe('plain,"has,comma","has""quote","has\nnewline"');
  });

  it('renders null/undefined as empty and numbers as-is', () => {
    expect(aoaToCsv([[null, undefined, 0, 201]])).toBe(',,0,201');
  });
});

describe('csvFilename', () => {
  it('uses the prefix and a .csv extension', () => {
    expect(csvFilename('history')).toMatch(/^history-\d{8}-\d{6}\.csv$/);
  });
});

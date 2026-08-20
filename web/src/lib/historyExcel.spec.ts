import { describe, it, expect } from 'vitest';
import { historyRowsToAoa, type HistoryColLabels } from './historyExcel';
import type { HistoryExportRow } from '../api/client';

const L: HistoryColLabels = {
  date: 'Date',
  time: 'Time',
  method: 'Method',
  url: 'URL',
  status: 'Status',
  result: 'Result',
  duration: 'Duration',
  size: 'Size',
  contentType: 'Content-Type',
  reqHeaders: 'Request Headers',
  reqBody: 'Request Body',
  resHeaders: 'Response Headers',
  resBody: 'Response Body',
  folder: 'Folder',
  ok: 'OK',
};

const base: HistoryExportRow = {
  executedAt: new Date(2026, 7, 14, 9, 3, 7).toISOString(), // local -> round-trips via UTC
  reqMethod: 'POST',
  reqUrl: 'https://api.example.com/accounts',
  resStatus: 201,
  success: true,
  error: null,
  durationMs: 160,
  resSize: 254,
  resContentType: 'application/json',
  resBodyEncoding: 'text',
  resTruncated: false,
  reqHeaders: { 'Content-Type': 'application/json' },
  reqBody: '{"name":"kim"}',
  resHeaders: { 'Content-Type': 'application/json' },
  resBody: '{"id":1}',
  folder: { name: 'Bank' },
};

describe('historyRowsToAoa', () => {
  it('header row is in the fixed order', () => {
    const [header] = historyRowsToAoa([], L);
    expect(header).toEqual([
      'Date', 'Time', 'Method', 'URL', 'Status', 'Result', 'Duration', 'Size',
      'Content-Type', 'Request Headers', 'Request Body', 'Response Headers',
      'Response Body', 'Folder',
    ]);
  });

  it('maps a successful row (local date/time, headers as JSON, folder name)', () => {
    const [, row] = historyRowsToAoa([base], L);
    expect(row).toEqual([
      '2026-08-14', '09:03:07', 'POST', 'https://api.example.com/accounts', 201, 'OK',
      160, 254, 'application/json',
      '{"Content-Type":"application/json"}', '{"name":"kim"}',
      '{"Content-Type":"application/json"}', '{"id":1}', 'Bank',
    ]);
  });

  it('shows the error message as the result and ERR as the status for a failed call', () => {
    const [, row] = historyRowsToAoa(
      [{ ...base, success: false, error: 'timeout', resStatus: null }],
      L,
    );
    expect(row[4]).toBe('ERR'); // status column
    expect(row[5]).toBe('timeout'); // result column
  });

  it('summarizes a binary response body instead of dumping bytes', () => {
    const [, row] = historyRowsToAoa(
      [{ ...base, resBodyEncoding: 'binary', resBody: null, resSize: 2048 }],
      L,
    );
    expect(row[12]).toBe('(binary 2048 bytes)'); // response body column
  });

  it('trims a cell that exceeds the Excel character limit', () => {
    const big = 'x'.repeat(40000);
    const [, row] = historyRowsToAoa([{ ...base, reqBody: big }], L);
    const reqBody = row[10] as string;
    expect(reqBody.length).toBeLessThan(big.length);
    expect(reqBody.endsWith('…(truncated)')).toBe(true);
  });
});

import type { HistoryExportRow } from '../api/client';

// Excel caps a cell at 32,767 characters; stay below it and mark anything trimmed.
const CELL_MAX = 32000;

function cell(v: unknown): string | number {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return v;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > CELL_MAX ? s.slice(0, CELL_MAX) + '…(truncated)' : s;
}

const p2 = (n: number) => String(n).padStart(2, '0');

// Localized column labels (passed in from the UI so the sheet follows the current language).
export interface HistoryColLabels {
  date: string;
  time: string;
  method: string;
  url: string;
  status: string;
  result: string;
  duration: string;
  size: string;
  contentType: string;
  reqHeaders: string;
  reqBody: string;
  resHeaders: string;
  resBody: string;
  folder: string;
  ok: string; // value shown in the Result column for a successful call
}

// Build the array-of-arrays (header + one row per history entry) for the export sheet.
export function historyRowsToAoa(
  rows: HistoryExportRow[],
  L: HistoryColLabels,
): (string | number)[][] {
  const header = [
    L.date,
    L.time,
    L.method,
    L.url,
    L.status,
    L.result,
    L.duration,
    L.size,
    L.contentType,
    L.reqHeaders,
    L.reqBody,
    L.resHeaders,
    L.resBody,
    L.folder,
  ];
  const body = rows.map((r) => {
    const d = new Date(r.executedAt);
    const date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    const time = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    const status = r.error ? 'ERR' : (r.resStatus ?? '');
    const result = r.success ? L.ok : (r.error ?? '');
    const resBody =
      r.resBodyEncoding === 'binary'
        ? `(binary${r.resSize != null ? ` ${r.resSize} bytes` : ''})`
        : cell(r.resBody);
    return [
      date,
      time,
      r.reqMethod,
      cell(r.reqUrl),
      status,
      cell(result),
      r.durationMs ?? '',
      r.resSize ?? '',
      cell(r.resContentType),
      cell(r.reqHeaders),
      cell(r.reqBody),
      cell(r.resHeaders),
      resBody,
      r.folder?.name ?? '',
    ];
  });
  return [header, ...body];
}

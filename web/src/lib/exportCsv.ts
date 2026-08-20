// RFC 4180 CSV helpers. Kept dependency-free (unlike the .xlsx path): a CSV is just
// text, so any spreadsheet / script / DB can consume it. CSV is the more common export
// format for developer and data tooling internationally, offered alongside Excel.

// Quote a cell only when needed (contains a comma, quote, or newline); double inner quotes.
function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Serialize an array-of-arrays (header row + data rows) into a CSV string (CRLF rows).
export function aoaToCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

// Trigger a browser download of CSV text. A UTF-8 BOM is prepended so spreadsheet apps
// (notably Excel on Windows) detect UTF-8 and do not mangle non-ASCII text (e.g. Korean).
export function downloadCsv(csv: string, filename: string): void {
  const BOM = String.fromCharCode(0xfeff);
  const blob = new Blob([BOM, csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// prefix-YYYYMMDD-HHmmss.csv
export function csvFilename(prefix = 'export'): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}-${stamp}.csv`;
}

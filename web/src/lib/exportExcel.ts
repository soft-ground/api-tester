import { jsonToSheets } from './jsonToSheets';

// Build a multi-sheet .xlsx workbook from a JSON value and trigger a browser download.
// SheetJS is imported lazily so it stays out of the initial bundle until the first export.
export async function exportJsonToXlsx(data: unknown, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of jsonToSheets(data)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, filename);
}

// response-YYYYMMDD-HHmmss.xlsx
export function excelFilename(prefix = 'response'): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${prefix}-${stamp}.xlsx`;
}

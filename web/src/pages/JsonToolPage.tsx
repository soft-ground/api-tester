import { useEffect, useMemo, useRef, useState } from 'react';
import { jsonToSheets, SheetSpec } from '../lib/jsonToSheets';
import { excelFilename, exportJsonToXlsx } from '../lib/exportExcel';
import { aoaToCsv, csvFilename, downloadCsv } from '../lib/exportCsv';
import { useT } from '../i18n';

// Standalone utility: paste arbitrary JSON, preview it as table(s), and save as CSV or Excel.
// Reuses the same jsonToSheets/exportJsonToXlsx pipeline the response viewer uses, so nested
// payloads (wrapped arrays, dot-path flattening) are handled identically. Purely client-side.

const PREVIEW_ROWS = 50; // cap rows rendered in the preview; exports always include everything

const SAMPLE = `[
  { "id": 1, "name": "Alice", "email": "alice@example.com", "active": true },
  { "id": 2, "name": "Bob", "email": "bob@example.com", "active": false }
]`;

function cellText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

// jsonToSheets emits synthetic key/value sheets named exactly "Summary" / "Value" (headerless),
// while array-derived sheets carry a header row. Distinguish them for correct preview rendering.
function isKeyValue(sheet: SheetSpec): boolean {
  return sheet.name === 'Summary' || sheet.name === 'Value';
}

function SheetTable({
  sheet,
  t,
}: {
  sheet: SheetSpec;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const kv = isKeyValue(sheet);
  const rows = sheet.rows;
  if (!rows.length) return <div className="placeholder-box">{t('tools.empty')}</div>;
  const header = kv ? null : (rows[0] as unknown[]);
  const body = kv ? rows : rows.slice(1);
  const shown = body.slice(0, PREVIEW_ROWS);
  const more = body.length - shown.length;
  return (
    <div className="jt-table-wrap">
      <table className="jt-table">
        {header && (
          <thead>
            <tr>
              {header.map((c, i) => (
                <th key={i}>{cellText(c)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {shown.map((r, ri) => (
            <tr key={ri}>
              {(r as unknown[]).map((c, ci) => (
                <td key={ci} className={kv && ci === 0 ? 'jt-key' : undefined}>
                  {cellText(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="jt-rowinfo">
        {t('tools.rows', { n: body.length })}
        {more > 0 && ` · ${t('tools.moreRows', { n: more })}`}
      </div>
    </div>
  );
}

export default function JsonToolPage() {
  const t = useT();
  const [text, setText] = useState('');
  const [activeSheet, setActiveSheet] = useState(0);

  const gridRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number>(() => {
    const s = Number(localStorage.getItem('jtLeftWidth'));
    return s >= 260 && s <= 1000 ? s : 420;
  });
  useEffect(() => localStorage.setItem('jtLeftWidth', String(leftWidth)), [leftWidth]);

  // Drag the divider to resize the paste/preview split. Width is measured from the grid's left edge.
  const startSplitResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const max = Math.max(260, rect.width - 300);
    const onMove = (ev: MouseEvent) =>
      setLeftWidth(Math.min(Math.max(260, ev.clientX - rect.left), max));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Parse the pasted text once per change; expose ok/data/error for the UI.
  const parsed = useMemo<{ ok: boolean | null; data: unknown; error: string }>(() => {
    const s = text.trim();
    if (!s) return { ok: null, data: undefined, error: '' };
    try {
      return { ok: true, data: JSON.parse(s), error: '' };
    } catch (e) {
      return { ok: false, data: undefined, error: (e as Error).message };
    }
  }, [text]);

  const sheets = useMemo<SheetSpec[]>(() => {
    if (parsed.ok !== true) return [];
    try {
      return jsonToSheets(parsed.data);
    } catch {
      return [];
    }
  }, [parsed]);

  const active = Math.min(activeSheet, Math.max(0, sheets.length - 1));
  const sheet = sheets[active];
  const canExport = parsed.ok === true && sheets.length > 0;

  const doCsv = () => {
    if (!sheet) return;
    downloadCsv(aoaToCsv(sheet.rows as unknown[][]), csvFilename('json'));
  };
  const doExcel = async () => {
    if (parsed.ok !== true) return;
    await exportJsonToXlsx(parsed.data, excelFilename('json'));
  };

  return (
    <div className="page json-tool">
      <div className="page-header">
        <h1>{t('tools.title')}</h1>
      </div>
      <p className="page-desc">{t('tools.desc')}</p>

      <div
        className="jt-grid"
        ref={gridRef}
        style={{ ['--jt-left']: `${leftWidth}px` } as React.CSSProperties}
      >
        <div className="jt-input">
          <div className="jt-input-head">
            <label>{t('tools.inputLabel')}</label>
            <div className="jt-input-actions">
              <button className="btn btn-ghost" onClick={() => setText(SAMPLE)}>
                {t('tools.sample')}
              </button>
              <button className="btn btn-ghost" onClick={() => setText('')} disabled={!text}>
                {t('tools.clear')}
              </button>
            </div>
          </div>
          <textarea
            className="jt-textarea"
            value={text}
            spellCheck={false}
            placeholder={t('tools.placeholder')}
            onChange={(e) => {
              setText(e.target.value);
              setActiveSheet(0);
            }}
          />
          {parsed.ok === false && (
            <div className="error-text jt-error">
              {t('tools.parseError', { msg: parsed.error })}
            </div>
          )}
        </div>

        <div
          className="jt-resize"
          onMouseDown={startSplitResize}
          title={t('tools.resizeSplit')}
          role="separator"
          aria-orientation="vertical"
        />

        <div className="jt-preview">
          <div className="jt-preview-head">
            <div className="jt-actions">
              {/* Export labels stay English regardless of UI language (product convention). */}
              <button className="btn" onClick={doCsv} disabled={!canExport}>
                Save CSV
              </button>
              <button className="btn" onClick={doExcel} disabled={!canExport}>
                Save Excel
              </button>
            </div>
          </div>

          {!canExport ? (
            <div className="placeholder-box">{t('tools.empty')}</div>
          ) : (
            <>
              {sheets.length > 1 && (
                <>
                  <div className="jt-csv-hint">{t('tools.csvTargetHint')}</div>
                  <div className="jt-tabs">
                    {sheets.map((s, i) => (
                      <button
                        key={`${s.name}-${i}`}
                        className={i === active ? 'tab active' : 'tab'}
                        onClick={() => setActiveSheet(i)}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {sheet && <SheetTable sheet={sheet} t={t} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

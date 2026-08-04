import { useEffect, useState } from 'react';
import {
  Assert,
  Collection,
  DataDrivenResults,
  DataRow,
  Extract,
  IterationResult,
  StepOverrides,
  getEndpoint,
  isDataDriven,
  ScenarioDetail,
  ScenarioRun,
  ScenarioStep,
  ScenarioSummary,
  StepResult,
  addStep,
  createScenario,
  deleteScenario,
  deleteStep,
  getScenario,
  listCollections,
  listRuns,
  listScenarios,
  reorderSteps,
  runScenario,
  updateScenario,
  updateStep,
} from '../api/client';
import { useDialog } from '../components/DialogProvider';
import { useT } from '../i18n';

function move<T>(arr: T[], from: number, to: number): T[] {
  const n = [...arr];
  const [x] = n.splice(from, 1);
  n.splice(to, 0, x);
  return n;
}

interface FlatEndpoint {
  id: string;
  label: string;
}

export default function ScenariosPage() {
  const t = useT();
  const { confirm, prompt } = useDialog();
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScenarioDetail | null>(null);
  const [endpoints, setEndpoints] = useState<FlatEndpoint[]>([]);
  const [pickEp, setPickEp] = useState('');
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<ScenarioRun | null>(null);
  const [pastRuns, setPastRuns] = useState<ScenarioRun[]>([]);
  const [dragStep, setDragStep] = useState<number | null>(null);
  const [listWidth, setListWidth] = useState<number>(
    () => Number(localStorage.getItem('scnListWidth')) || 280,
  );

  useEffect(() => {
    localStorage.setItem('scnListWidth', String(listWidth));
  }, [listWidth]);

  // Drag to resize the left scenario-list panel width
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: MouseEvent) =>
      setListWidth(Math.min(600, Math.max(220, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const refreshList = async () => setScenarios(await listScenarios());

  useEffect(() => {
    refreshList();
    listCollections().then((cols: Collection[]) => {
      const flat: FlatEndpoint[] = [];
      cols.forEach((c) =>
        c.endpoints.forEach((e) =>
          flat.push({ id: e.id, label: `${c.name} / ${e.method} ${e.name}` }),
        ),
      );
      setEndpoints(flat);
    });
  }, []);

  const loadDetail = async (id: string) => {
    setDetail(await getScenario(id));
    setLastRun(null);
    setPastRuns(await listRuns(id));
  };

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]);

  const onCreate = async () => {
    const name = await prompt({ message: t('scn.namePrompt') });
    if (!name) return;
    const sc = await createScenario(name);
    await refreshList();
    setSelectedId(sc.id);
  };

  const onDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({ message: t('scn.deleteConfirm'), tone: 'warn' })))
      return;
    await deleteScenario(id);
    if (selectedId === id) setSelectedId(null);
    refreshList();
  };

  const onAddStep = async () => {
    if (!selectedId || !pickEp) return;
    await addStep(selectedId, pickEp);
    setPickEp('');
    loadDetail(selectedId);
  };

  const onDeleteStep = async (stepId: string) => {
    await deleteStep(stepId);
    if (selectedId) loadDetail(selectedId);
  };

  const onStepChange = async (
    stepId: string,
    payload: { extracts?: Extract[]; asserts?: Assert[]; overrides?: StepOverrides },
  ) => {
    await updateStep(stepId, payload);
    // update local detail (without refetching)
    setDetail((d) =>
      d
        ? {
            ...d,
            steps: d.steps.map((s) =>
              s.id === stepId ? { ...s, ...payload } : s,
            ),
          }
        : d,
    );
  };

  const onDropStep = async (to: number) => {
    if (!detail || dragStep === null || dragStep === to) return setDragStep(null);
    const next = move(detail.steps, dragStep, to);
    setDetail({ ...detail, steps: next });
    setDragStep(null);
    await reorderSteps(detail.id, next.map((s) => s.id));
  };

  const onRun = async () => {
    if (!selectedId) return;
    setRunning(true);
    setLastRun(null);
    try {
      const run = await runScenario(selectedId);
      setLastRun(run);
      setPastRuns(await listRuns(selectedId));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="scn-layout">
      <div className="tree-panel" style={{ width: listWidth }}>
        <div className="tree-header">
          <span>{t('scn.title')}</span>
          <button className="btn-ghost" onClick={onCreate}>
            {t('scn.add')}
          </button>
        </div>
        {scenarios.length === 0 && (
          <div className="tree-empty">{t('scn.createFirst')}</div>
        )}
        {scenarios.map((sc) => (
          <div
            key={sc.id}
            className={selectedId === sc.id ? 'scn-row active' : 'scn-row'}
            onClick={() => setSelectedId(sc.id)}
          >
            <span className="scn-name">{sc.name}</span>
            <span className="scn-meta">
              {t('scn.stepCount', { count: sc._count?.steps ?? 0 })}
            </span>
            <button className="mini" onClick={(e) => onDelete(sc.id, e)}>
              ✕
            </button>
          </div>
        ))}
      </div>

      <div
        className="resizer"
        onMouseDown={startResize}
        title={t('common.dragResize')}
      />

      <div className="scn-editor-panel">
        {!detail ? (
          <div className="builder-empty">
            {t('scn.empty')}
          </div>
        ) : (
          <div className="scn-editor">
            <div className="scn-editor-head">
              <h2>{detail.name}</h2>
              <button
                className="btn btn-send"
                onClick={onRun}
                disabled={running || detail.steps.length === 0}
              >
                {running ? t('common.running') : t('scn.run')}
              </button>
            </div>

            <div className="scn-steps">
              {detail.steps.map((step, i) => (
                <StepCard
                  key={step.id}
                  index={i}
                  step={step}
                  onChange={onStepChange}
                  onDelete={() => onDeleteStep(step.id)}
                  onDragStart={() => setDragStep(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropStep(i)}
                  result={
                    lastRun && Array.isArray(lastRun.results)
                      ? lastRun.results.find((r) => r.stepId === step.id)
                      : undefined
                  }
                />
              ))}
              {detail.steps.length === 0 && (
                <div className="tree-empty">{t('scn.addStepEmpty')}</div>
              )}
            </div>

            <div className="scn-add-step">
              <select value={pickEp} onChange={(e) => setPickEp(e.target.value)}>
                <option value="">{t('scn.pickEndpoint')}</option>
                {endpoints.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
              <button className="btn" onClick={onAddStep} disabled={!pickEp}>
                {t('scn.addStep')}
              </button>
            </div>

            <DataEditor
              key={detail.id}
              rows={detail.data ?? []}
              onSave={async (rows) => {
                await updateScenario(detail.id, { data: rows });
                loadDetail(detail.id);
              }}
            />

            {lastRun &&
              (isDataDriven(lastRun.results) ? (
                <IterationResults results={lastRun.results} />
              ) : (
                <RunSummary run={lastRun} />
              ))}

            {pastRuns.length > 0 && (
              <div className="scn-past-runs">
                <h4>{t('scn.runHistory')}</h4>
                {pastRuns.map((r) => (
                  <div
                    key={r.id}
                    className="past-run"
                    onClick={() => setLastRun(r)}
                  >
                    <span className={`run-badge run-${r.status}`}>
                      {r.status === 'passed'
                        ? t('scn.statusPassed')
                        : r.status === 'failed'
                          ? t('scn.statusFailed')
                          : t('scn.statusRunning')}
                    </span>
                    <span className="past-run-time">
                      {new Date(r.startedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ Step card ============ */
function StepCard({
  index,
  step,
  onChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  result,
}: {
  index: number;
  step: ScenarioStep;
  onChange: (
    id: string,
    p: { extracts?: Extract[]; asserts?: Assert[]; overrides?: StepOverrides },
  ) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  result?: StepResult;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const resultBadge = result ? (
    result.ok ? (
      <span className="step-res pass">{t('scn.stepPass')}</span>
    ) : (
      <span className="step-res fail">
        {t('scn.stepFail')}
        {result.status ? ` ${result.status}` : ''}
      </span>
    )
  ) : null;

  return (
    <div
      className="step-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="step-head" onClick={() => setOpen(!open)}>
        <span className="grip" title={t('common.dragReorder')}>⠿</span>
        <span className="step-num">{index + 1}</span>
        <span className={`m-badge m-${step.endpoint.method}`}>
          {step.endpoint.method}
        </span>
        <span className="step-ep-name">{step.endpoint.name}</span>
        <span className="step-tags">
          {step.extracts.length > 0 && (
            <span className="step-tag">
              {t('scn.tagExtract', { count: step.extracts.length })}
            </span>
          )}
          {step.asserts.length > 0 && (
            <span className="step-tag">
              {t('scn.tagAssert', { count: step.asserts.length })}
            </span>
          )}
        </span>
        {resultBadge}
        <button
          className="mini"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </div>

      {open && (
        <div className="step-body">
          <OverrideBodyEditor step={step} onChange={onChange} />
          <ExtractsEditor
            extracts={step.extracts}
            onChange={(extracts) => onChange(step.id, { extracts })}
          />
          <AssertsEditor
            asserts={step.asserts}
            onChange={(asserts) => onChange(step.id, { asserts })}
          />
        </div>
      )}

      {result && open && (
        <div className="step-result-detail">
          {result.error && <div className="error-text">{result.error}</div>}
          {Object.keys(result.extracted).length > 0 && (
            <div className="res-extracted">
              {t('scn.extractedLabel')}{' '}
              {Object.entries(result.extracted).map(([k, v]) => (
                <code key={k}>
                  {k}={v}
                </code>
              ))}
            </div>
          )}
          {result.asserts.map((a, i) => (
            <div key={i} className={a.passed ? 'assert-ok' : 'assert-fail'}>
              {a.passed ? '✓' : '✗'} {a.target === 'status' ? 'status' : a.path}{' '}
              {a.op} {a.value ?? ''} ({t('scn.actual')}: {String(a.actual)})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Request body (JSON) override used only for this step
function OverrideBodyEditor({
  step,
  onChange,
}: {
  step: ScenarioStep;
  onChange: (
    id: string,
    p: { extracts?: Extract[]; asserts?: Assert[]; overrides?: StepOverrides },
  ) => void;
}) {
  const t = useT();
  const active = typeof step.overrides?.body === 'string';

  const toggle = async (on: boolean) => {
    if (on) {
      // prefill the endpoint default body
      const ep = await getEndpoint(step.endpoint.id);
      onChange(step.id, { overrides: { body: ep.bodyTemplate ?? '' } });
    } else {
      onChange(step.id, { overrides: {} });
    }
  };

  return (
    <div className="editor-block">
      <div className="editor-block-title override-title">
        <span>{t('scn.bodyOverride')}</span>
        <label className="radio">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => toggle(e.target.checked)}
          />
          {t('scn.useOwnBody')}
        </label>
      </div>
      {active && (
        <>
          <textarea
            className="body-textarea override-body"
            value={step.overrides?.body ?? ''}
            onChange={(e) =>
              onChange(step.id, { overrides: { body: e.target.value } })
            }
          />
          <p className="section-hint">
            <code>{t('scn.overrideHint.code')}</code>
            {t('scn.overrideHint.text')}
          </p>
        </>
      )}
    </div>
  );
}

function ExtractsEditor({
  extracts,
  onChange,
}: {
  extracts: Extract[];
  onChange: (e: Extract[]) => void;
}) {
  const t = useT();
  const upd = (i: number, p: Partial<Extract>) =>
    onChange(extracts.map((e, idx) => (idx === i ? { ...e, ...p } : e)));
  return (
    <div className="editor-block">
      <div className="editor-block-title">{t('scn.extractTitle')}</div>
      {extracts.map((ex, i) => (
        <div className="kv-row" key={i}>
          <input
            className="kv-key"
            placeholder={t('scn.varNamePh')}
            value={ex.name}
            onChange={(e) => upd(i, { name: e.target.value })}
          />
          <input
            className="kv-value"
            placeholder={t('scn.respPathPh')}
            value={ex.path}
            onChange={(e) => upd(i, { path: e.target.value })}
          />
          <button
            className="kv-del"
            onClick={() => onChange(extracts.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn-ghost kv-add"
        onClick={() => onChange([...extracts, { name: '', path: '' }])}
      >
        {t('scn.addExtract')}
      </button>
    </div>
  );
}

const OPS: Assert['op'][] = ['eq', 'ne', 'contains', 'exists', 'gt', 'lt'];

function AssertsEditor({
  asserts,
  onChange,
}: {
  asserts: Assert[];
  onChange: (a: Assert[]) => void;
}) {
  const t = useT();
  const upd = (i: number, p: Partial<Assert>) =>
    onChange(asserts.map((a, idx) => (idx === i ? { ...a, ...p } : a)));
  return (
    <div className="editor-block">
      <div className="editor-block-title">{t('scn.assertTitle')}</div>
      {asserts.map((a, i) => (
        <div className="assert-row" key={i}>
          <select
            value={a.target}
            onChange={(e) => upd(i, { target: e.target.value as Assert['target'] })}
          >
            <option value="status">status</option>
            <option value="body">body</option>
          </select>
          {a.target === 'body' && (
            <input
              className="kv-value"
              placeholder="$.path"
              value={a.path ?? ''}
              onChange={(e) => upd(i, { path: e.target.value })}
            />
          )}
          <select value={a.op} onChange={(e) => upd(i, { op: e.target.value as Assert['op'] })}>
            {OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          {a.op !== 'exists' && (
            <input
              className="assert-val"
              placeholder={t('scn.expectedPh')}
              value={a.value ?? ''}
              onChange={(e) => upd(i, { value: e.target.value })}
            />
          )}
          <button
            className="kv-del"
            onClick={() => onChange(asserts.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn-ghost kv-add"
        onClick={() => onChange([...asserts, { target: 'status', op: 'eq', value: '200' }])}
      >
        {t('scn.addAssert')}
      </button>
    </div>
  );
}

function RunSummary({ run }: { run: ScenarioRun }) {
  const t = useT();
  const results = Array.isArray(run.results) ? run.results : [];
  const passed = results.filter((r) => r.ok).length;
  return (
    <div className="run-summary">
      <div className="run-summary-head">
        <span className={`run-badge run-${run.status}`}>
          {run.status === 'passed' ? t('scn.runPassed') : t('scn.runFailed')}
        </span>
        <span className="run-summary-count">
          {t('scn.stepsPassed', { passed, total: results.length })}
        </span>
      </div>
      <p className="section-hint">{t('scn.runHint')}</p>
    </div>
  );
}

// Simple CSV parser (supports quoted fields)
function parseCsv(text: string): DataRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        out.push(cur);
        cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const r: DataRow = {};
    headers.forEach((h, i) => {
      r[h] = cells[i] ?? '';
    });
    return r;
  });
}

// Parse text (CSV or a JSON array of objects) into an array of rows
function parseData(text: string): {
  rows: DataRow[] | null;
  error: string | null;
  columns: string[];
} {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: null, columns: [] };
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      const j = JSON.parse(trimmed);
      const arr = Array.isArray(j) ? j : [j];
      const rows: DataRow[] = arr.map((o: Record<string, unknown>) => {
        const r: DataRow = {};
        for (const [k, v] of Object.entries(o ?? {}))
          r[k] = v == null ? '' : String(v);
        return r;
      });
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return { rows, error: null, columns };
    } catch (e: any) {
      return { rows: null, error: e?.message || 'JSON parse error', columns: [] };
    }
  }
  try {
    const rows = parseCsv(trimmed);
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { rows, error: null, columns };
  } catch (e: any) {
    return { rows: null, error: e?.message || 'CSV parse error', columns: [] };
  }
}

// Edit the data for data-driven iteration (saved on the scenario)
function DataEditor({
  rows,
  onSave,
}: {
  rows: DataRow[];
  onSave: (rows: DataRow[]) => void | Promise<void>;
}) {
  const t = useT();
  const savedText = rows.length ? JSON.stringify(rows, null, 2) : '';
  const [open, setOpen] = useState(rows.length > 0);
  const [text, setText] = useState(savedText);
  const parsed = parseData(text);

  return (
    <div className="scn-data">
      <button className="scn-data-toggle" onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} {t('scn.dataTitle')}
        {rows.length > 0 && (
          <span className="scn-data-badge">
            {t('scn.dataRows', { count: rows.length })}
          </span>
        )}
      </button>
      {open && (
        <div className="scn-data-body">
          <p className="section-hint">{t('scn.dataHint')}</p>
          <textarea
            className="scn-data-input"
            value={text}
            placeholder={t('scn.dataPlaceholder')}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="scn-data-foot">
            {parsed.error ? (
              <span className="scn-data-error">⚠ {parsed.error}</span>
            ) : (
              <span className="scn-data-info">
                {t('scn.dataParsed', {
                  rows: parsed.rows?.length ?? 0,
                  cols: parsed.columns.join(', ') || '—',
                })}
              </span>
            )}
            <button
              className="btn"
              disabled={!!parsed.error}
              onClick={() => parsed.rows && onSave(parsed.rows)}
            >
              {t('scn.dataSave')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Data-driven run results — per-iteration pass/fail + expandable step details
function IterationResults({ results }: { results: DataDrivenResults }) {
  const t = useT();
  return (
    <div className="run-summary">
      <div className="run-summary-head">
        <span className={`run-badge run-${results.failed === 0 ? 'passed' : 'failed'}`}>
          {results.failed === 0 ? t('scn.runPassed') : t('scn.runFailed')}
        </span>
        <span className="run-summary-count">
          {t('scn.iterSummary', {
            total: results.total,
            passed: results.passed,
            failed: results.failed,
          })}
        </span>
      </div>
      <div className="iter-list">
        {results.iterations.map((it) => (
          <IterationRow key={it.index} it={it} />
        ))}
      </div>
    </div>
  );
}

function IterationRow({ it }: { it: IterationResult }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rowText = Object.entries(it.row)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  return (
    <div className={it.ok ? 'iter-row ok' : 'iter-row fail'}>
      <button className="iter-head" onClick={() => setOpen(!open)}>
        <span className="iter-badge">{it.ok ? '✓' : '✗'}</span>
        <span className="iter-idx">#{it.index + 1}</span>
        <span className="iter-rowdata">{rowText || '—'}</span>
        <span className="iter-toggle">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="iter-detail">
          {it.results.map((st, i) => (
            <div key={i} className={st.ok ? 'iter-step ok' : 'iter-step fail'}>
              <span className={`m-badge m-${st.method}`}>{st.method}</span>
              <span className="iter-step-name">{st.endpointName}</span>
              <span className="iter-step-status">{st.status ?? 'ERR'}</span>
              {st.error && <span className="iter-step-err">{st.error}</span>}
              {st.asserts.map((a, j) => (
                <span
                  key={j}
                  className={a.passed ? 'assert-ok' : 'assert-fail'}
                >
                  {a.passed ? '✓' : '✗'}{' '}
                  {a.target === 'status' ? 'status' : a.path} {a.op}{' '}
                  {a.value ?? ''} ({t('scn.actual')}: {String(a.actual)})
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

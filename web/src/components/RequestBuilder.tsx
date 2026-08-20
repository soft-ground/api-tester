import { useEffect, useRef, useState } from 'react';
import {
  ApiEndpoint,
  AuthType,
  BodyType,
  ExecuteResult,
  MultipartPart,
  VarName,
  createEndpoint,
  execute,
  getAvailableNames,
  updateEndpoint,
} from '../api/client';
import BodyFieldsEditor from './BodyFieldsEditor';
import KeyValueEditor from './KeyValueEditor';
import ResponseViewer from './ResponseViewer';
import VarField from './VarField';
import Modal from './Modal';
import { useDialog } from './DialogProvider';
import { usePickVariable } from '../hooks/usePickVariable';
import { useT } from '../i18n';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// Temporarily store unsaved edits per endpoint (kept across navigation)
const DRAFT_PREFIX = 'reqDraft:';
function loadDraft(id: string): ApiEndpoint | null {
  try {
    const s = localStorage.getItem(DRAFT_PREFIX + id);
    return s ? (JSON.parse(s) as ApiEndpoint) : null;
  } catch {
    return null;
  }
}
function saveDraft(ep: ApiEndpoint) {
  try {
    localStorage.setItem(DRAFT_PREFIX + ep.id, JSON.stringify(ep));
  } catch {
    /* ignore quota-exceeded, etc. */
  }
}
function clearDraft(id: string) {
  localStorage.removeItem(DRAFT_PREFIX + id);
}

// multipart parts are stored as JSON in bodyTemplate. Parsing helper.
function parseMultipart(raw?: string | null): MultipartPart[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? (a as MultipartPart[]) : [];
  } catch {
    return [];
  }
}
// Thrown only when the browser cannot read an attached file (its FileReader errored — e.g. the file
// was modified, moved, or removed after it was attached). A distinct type so the send handler can
// report this specific, known cause without guessing about any other failure.
class FileReadError extends Error {
  fileName: string;
  constructor(fileName: string) {
    super(`Could not read file: ${fileName}`);
    this.name = 'FileReadError';
    this.fileName = fileName;
    Object.setPrototypeOf(this, FileReadError.prototype);
  }
}

// Convert a file to base64 (stripping the data URI prefix)
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new FileReadError(file.name));
    r.readAsDataURL(file);
  });
}

// For deciding dirty state: a snapshot of only the fields the user edits.
// (server-managed meta fields like updatedAt must be excluded so that, after saving,
// the dirty flag clears correctly.)
function editableSnapshot(e: ApiEndpoint): string {
  return JSON.stringify([
    e.name,
    e.method,
    e.baseUrl,
    e.path,
    e.headers,
    e.queryParams,
    e.bodyType,
    e.bodyTemplate ?? null,
    e.authType,
    e.authConfig,
  ]);
}

// Keep the last request/response result per endpoint too (restores prior state across navigation)
const RESULT_PREFIX = 'reqResult:';
function loadResult(id: string): ExecuteResult | null {
  try {
    const s = localStorage.getItem(RESULT_PREFIX + id);
    return s ? (JSON.parse(s) as ExecuteResult) : null;
  } catch {
    return null;
  }
}
function saveResult(id: string, res: ExecuteResult) {
  try {
    localStorage.setItem(RESULT_PREFIX + id, JSON.stringify(res));
  } catch {
    /* ignore quota-exceeded, etc. */
  }
}
function clearResult(id: string) {
  localStorage.removeItem(RESULT_PREFIX + id);
}

// An unsaved scratch endpoint for the "quick request". Its id is used only as a draft/result key
// and is not a real DB endpoint, so it is not passed as endpointId on execution (no FK).
export const SCRATCH_ID = '__scratch__';
export const SCRATCH_ENDPOINT: ApiEndpoint = {
  id: SCRATCH_ID,
  collectionId: null,
  name: '',
  method: 'GET',
  baseUrl: '',
  path: '',
  headers: [],
  queryParams: [],
  bodyType: 'none',
  bodyTemplate: null,
  authType: 'none',
  authConfig: {},
};

interface Props {
  endpoint: ApiEndpoint;
  onSaved: (ep: ApiEndpoint) => void;
  // Scratch (quick request) mode: saving creates a new endpoint (save-as); execution has no endpointId.
  scratch?: boolean;
}

type ReqTab = 'params' | 'headers' | 'body' | 'auth';

export default function RequestBuilder({ endpoint, onSaved, scratch }: Props) {
  const t = useT();
  const { prompt, confirm } = useDialog();
  const [ep, setEp] = useState<ApiEndpoint>(endpoint);
  // Always reference the latest ep (to read the latest value after IME commit on save)
  const epRef = useRef(ep);
  epRef.current = ep;
  const [tab, setTab] = useState<ReqTab>('params');
  const [result, setResult] = useState<ExecuteResult | null>(() =>
    loadResult(endpoint.id),
  );
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [names, setNames] = useState<VarName[]>([]);
  const [blocked, setBlocked] = useState<ExecuteResult | null>(null);
  const [showVars, setShowVars] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // multipart file objects (part id → File). Transient state, not kept across save/navigation (re-attach).
  const [mpFiles, setMpFiles] = useState<Record<string, File>>({});

  // Save a response value → active environment variable (refresh the autocomplete list afterward)
  const { pick: pickVariable, copy: copyValue, toast } =
    usePickVariable(setNames);

  // On selecting a different endpoint, load the form: the unsaved draft if present, otherwise the saved copy
  useEffect(() => {
    const draft = loadDraft(endpoint.id);
    setEp(draft ?? endpoint);
    setResult(loadResult(endpoint.id));
    setTab('params');
    setMpFiles({}); // attachments are cleared when switching endpoints (re-attach needed)
  }, [endpoint.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep edits as a draft (so they survive navigation/refresh)
  useEffect(() => {
    saveDraft(ep);
  }, [ep]);

  // Whether the saved copy differs from the current edits (dirty state). Compares only edited fields.
  const dirty = editableSnapshot(ep) !== editableSnapshot(endpoint);

  // Reload only the saved API definition (discard in-progress edits). Keeps the request/response result.
  const revert = () => {
    clearDraft(endpoint.id);
    setEp(endpoint);
  };

  // Clear only the request/response result area (also removes the stored one). Unrelated to the API definition.
  const onClearResult = () => {
    clearResult(endpoint.id);
    setResult(null);
  };

  // Load variable names for autocomplete (refreshed each time the request builder opens)
  useEffect(() => {
    getAvailableNames().then(setNames).catch(() => setNames([]));
  }, [endpoint.id]);

  const patch = (p: Partial<ApiEndpoint>) => setEp({ ...ep, ...p });
  const fullUrl = `${ep.baseUrl || ''}${ep.path || ''}`;

  // Convert the current request into a curl command string and copy it to the clipboard
  const copyAsCurl = () => {
    const q = ep.queryParams
      .filter((p) => p.enabled && p.key)
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    const url = fullUrl + (q ? (fullUrl.includes('?') ? '&' : '?') + q : '');
    const parts = [`curl -X ${ep.method} '${url}'`];
    ep.headers
      .filter((h) => h.enabled && h.key)
      .forEach((h) => parts.push(`  -H '${h.key}: ${h.value}'`));
    if (ep.authType === 'bearer' && ep.authConfig.token)
      parts.push(`  -H 'Authorization: Bearer ${ep.authConfig.token}'`);
    if (ep.authType === 'basic' && ep.authConfig.username)
      parts.push(
        `  -u '${ep.authConfig.username}:${ep.authConfig.password ?? ''}'`,
      );
    if (
      ep.bodyType !== 'none' &&
      ep.bodyType !== 'multipart' &&
      ep.bodyTemplate
    )
      parts.push(`  -d '${ep.bodyTemplate}'`);
    navigator.clipboard.writeText(parts.join(' \\\n'));
    setNote(t('req.curlCopied'));
    setTimeout(() => setNote(null), 2000);
  };

  const toggleLock = async () => {
    const next = !ep.locked;
    setEp((c) => ({ ...c, locked: next }));
    try {
      await updateEndpoint(ep.id, { locked: next });
      // Refresh the tree indicator + baseline lock without touching the body draft
      // (editableSnapshot excludes `locked`, so body-dirty is unaffected).
      onSaved({ ...endpoint, locked: next });
    } catch {
      setEp((c) => ({ ...c, locked: !next })); // revert on failure
    }
  };

  const send = async () => {
    // Locked endpoints ask for confirmation before running (guards create/modify/delete calls).
    if (!scratch && ep.locked) {
      const ok = await confirm({
        message: t('req.lockConfirm', {
          method: ep.method,
          url: fullUrl || ep.path || '(URL)',
        }),
        tone: 'warn',
      });
      if (!ok) return;
    }
    setSending(true);
    setResult(null);
    try {
      // for multipart, assemble the part structure (+ attached file base64) and send
      let multipart: MultipartPart[] | undefined;
      let body: string | undefined = ep.bodyTemplate ?? '';
      if (ep.bodyType === 'multipart') {
        const parts = parseMultipart(ep.bodyTemplate).filter(
          (p) => p.enabled !== false && p.key,
        );
        multipart = await Promise.all(
          parts.map(async (p) => {
            if (p.type === 'file') {
              const f = mpFiles[p.id];
              return {
                id: p.id,
                key: p.key,
                type: 'file' as const,
                filename: f?.name ?? p.filename,
                contentType: f?.type ?? p.contentType,
                data: f ? await fileToBase64(f) : '',
              };
            }
            return {
              id: p.id,
              key: p.key,
              type: 'text' as const,
              value: p.value ?? '',
            };
          }),
        );
        body = undefined;
      }
      const res = await execute({
        endpointId: scratch ? undefined : ep.id,
        method: ep.method,
        url: fullUrl,
        headers: ep.headers,
        queryParams: ep.queryParams,
        bodyType: ep.bodyType,
        body,
        multipart,
        authType: ep.authType,
        authConfig: ep.authConfig,
      });
      setResult(res);
      saveResult(ep.id, res); // keep so the prior result is restored across navigation
      if (res.blocked) setBlocked(res); // unresolved variables → modal warning
    } catch (e: any) {
      // Only override the message for a cause we are certain about (a file we could not read);
      // otherwise keep the error's own message or the generic fallback.
      const error =
        e instanceof FileReadError
          ? t('req.fileReadFailed', { name: e.fileName })
          : e?.message || t('resp.failed');
      const errRes: ExecuteResult = {
        historyId: '',
        request: { method: ep.method, url: fullUrl, headers: {} },
        response: null,
        success: false,
        error,
      };
      setResult(errRes);
      saveResult(ep.id, errRes);
    } finally {
      setSending(false);
    }
  };

  const save = async () => {
    // If a Korean IME composition is in progress, commit before saving: blurring the active input
    // fires compositionend → onChange so the last character is reflected in state.
    // Wait one frame, then read the latest state (epRef) to avoid dropping the last character.
    (document.activeElement as HTMLElement | null)?.blur();
    // setTimeout(0): runs reliably even in a background tab, so the last character
    // (onChange) flushed by blur is written to state before reading the latest value.
    await new Promise((r) => setTimeout(r, 0));
    const cur = epRef.current;
    setSaving(true);
    try {
      const saved = await updateEndpoint(cur.id, {
        name: cur.name,
        method: cur.method,
        baseUrl: cur.baseUrl,
        path: cur.path,
        headers: cur.headers,
        queryParams: cur.queryParams,
        bodyType: cur.bodyType,
        bodyTemplate: cur.bodyTemplate,
        authType: cur.authType,
        authConfig: cur.authConfig,
      });
      clearDraft(cur.id); // save complete → clear the unsaved draft
      onSaved(saved);
      setNote(t('req.saved')); // save-success toast
      setTimeout(() => setNote(null), 1800);
    } finally {
      setSaving(false);
    }
  };

  // Save the scratch (quick request) as a new endpoint (save-as). Ask for a name and create it uncategorized.
  const saveAs = async () => {
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 0));
    const cur = epRef.current;
    const name = await prompt({
      message: t('req.saveAsPrompt'),
      defaultValue: cur.name || t('req.newRequest'),
    });
    if (!name) return;
    setSaving(true);
    try {
      const created = await createEndpoint({
        name,
        collectionId: null, // create it uncategorized (can be moved into a collection later)
        method: cur.method,
        baseUrl: cur.baseUrl,
        path: cur.path,
        headers: cur.headers,
        queryParams: cur.queryParams,
        bodyType: cur.bodyType,
        bodyTemplate: cur.bodyTemplate,
        authType: cur.authType,
        authConfig: cur.authConfig,
      });
      clearDraft(SCRATCH_ID); // clear the scratch draft (resets to empty)
      onSaved(created); // switch to the saved endpoint
      setNote(t('req.saved'));
      setTimeout(() => setNote(null), 1800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="req-builder">
      <div className="req-name-row">
        <input
          className="req-name"
          value={ep.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
        {!scratch && (
          <button
            type="button"
            className={`lock-btn${ep.locked ? ' locked' : ''}`}
            onClick={toggleLock}
            title={ep.locked ? t('req.lockOn') : t('req.lockOff')}
            aria-label={ep.locked ? t('req.lockOn') : t('req.lockOff')}
          >
            {ep.locked ? '🔒' : '🔓'}
          </button>
        )}
        {scratch ? (
          <span className="scratch-badge">{t('req.scratch')}</span>
        ) : (
          dirty && <span className="unsaved-badge">● {t('req.unsaved')}</span>
        )}
        <button
          className="btn-ghost"
          onClick={copyAsCurl}
          title={t('req.copyCurlTitle')}
        >
          {t('req.copyCurl')}
        </button>
        {!scratch && (
          <button
            className="btn-ghost"
            onClick={revert}
            disabled={!dirty}
            title={t('req.revertTitle')}
          >
            {t('req.revert')}
          </button>
        )}
        <button
          className="btn"
          onClick={scratch ? saveAs : save}
          disabled={saving}
        >
          {saving
            ? t('common.saving')
            : scratch
              ? t('req.saveToCollection')
              : t('common.save')}
        </button>
      </div>

      <div className="req-url-row">
        <select
          className={`method-select m-${ep.method}`}
          value={ep.method}
          onChange={(e) => patch({ method: e.target.value })}
        >
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <VarField
          className="base-url"
          placeholder={t('req.urlPh')}
          value={ep.baseUrl}
          names={names}
          onChange={(v) => patch({ baseUrl: v })}
        />
        <VarField
          className="path-input"
          placeholder="/path"
          value={ep.path}
          names={names}
          onChange={(v) => patch({ path: v })}
        />
        <button
          type="button"
          className="btn-ghost url-copy"
          onClick={() => copyValue(`${ep.baseUrl ?? ''}${ep.path ?? ''}`)}
          title={t('req.copyUrl')}
          aria-label={t('req.copyUrl')}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
        <button className="btn btn-send" onClick={send} disabled={sending}>
          {sending ? t('common.sending') : t('common.send')}
        </button>
      </div>

      <div className="vars-hint-row">
        <button className="btn-ghost" onClick={() => setShowVars(!showVars)}>
          {showVars ? '▾' : '▸'}{' '}
          {t('req.varsAvailable', { count: names.length })}
        </button>
        <span className="vars-hint-tip">{t('req.varsHint')}</span>
        {showVars && (
          <div className="vars-chips">
            {names.length === 0 && (
              <span className="kv-empty">{t('req.noVars')}</span>
            )}
            {names.map((n) => (
              <span
                key={n.name}
                className="var-chip"
                title={t('req.varClickCopy', { source: n.source })}
                onClick={() => navigator.clipboard.writeText(`{{${n.name}}}`)}
              >
                {`{{${n.name}}}`}
                <em>{n.source}</em>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="req-tabs">
        {(['params', 'headers', 'body', 'auth'] as ReqTab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t === 'params'
              ? `Query (${ep.queryParams.filter((q) => q.enabled).length})`
              : t === 'headers'
                ? `Headers (${ep.headers.filter((h) => h.enabled).length})`
                : t === 'body'
                  ? 'Body'
                  : `Auth${ep.authType !== 'none' ? ' •' : ''}`}
          </button>
        ))}
      </div>

      <div className="req-tab-body">
        {tab === 'params' && (
          <KeyValueEditor
            rows={ep.queryParams}
            names={names}
            onChange={(rows) => patch({ queryParams: rows })}
          />
        )}
        {tab === 'headers' && (
          <KeyValueEditor
            rows={ep.headers}
            names={names}
            onChange={(rows) => patch({ headers: rows })}
          />
        )}
        {tab === 'body' && (
          <BodyEditor
            bodyType={ep.bodyType}
            body={ep.bodyTemplate ?? ''}
            names={names}
            onType={(bt) => patch({ bodyType: bt })}
            onBody={(b) => patch({ bodyTemplate: b })}
            files={mpFiles}
            setFile={(id, f) =>
              setMpFiles((prev) => {
                const next = { ...prev };
                if (f) next[id] = f;
                else delete next[id];
                return next;
              })
            }
          />
        )}
        {tab === 'auth' && (
          <AuthEditor
            authType={ep.authType}
            authConfig={ep.authConfig}
            names={names}
            onType={(at) => patch({ authType: at })}
            onConfig={(cfg) => patch({ authConfig: cfg })}
          />
        )}
      </div>

      <div className="resp-section">
        {result && !sending && (
          <div className="resp-section-head">
            <button
              className="btn-ghost"
              onClick={onClearResult}
              title={t('req.clearResultTitle')}
            >
              {t('req.clearResult')}
            </button>
          </div>
        )}
        <ResponseViewer
          result={result}
          loading={sending}
          onPickVariable={pickVariable}
          onCopyValue={copyValue}
        />
      </div>

      {toast && <div className="toast">{toast}</div>}
      {note && <div className="toast">{note}</div>}

      {blocked && (
        <Modal
          title={t('req.blockedTitle')}
          tone="warn"
          onClose={() => setBlocked(null)}
        >
          <p>{t('req.blockedMsg')}</p>
          <ul className="unresolved-list">
            {blocked.unresolved?.map((n) => (
              <li key={n}>
                <code>{`{{${n}}}`}</code>
                {blocked.errors?.[n] && (
                  <span className="unresolved-reason">
                    {' '}
                    {t('req.exprErrLabel')}
                    {blocked.errors[n]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

function BodyEditor({
  bodyType,
  body,
  names,
  onType,
  onBody,
  files,
  setFile,
}: {
  bodyType: BodyType;
  body: string;
  names: VarName[];
  onType: (b: BodyType) => void;
  onBody: (b: string) => void;
  files: Record<string, File>;
  setFile: (id: string, f: File | null) => void;
}) {
  const t = useT();
  const [jsonView, setJsonView] = useState<'raw' | 'fields'>('raw');
  // Body input height: adjustable by dragging and saved to localStorage (kept across endpoints)
  const [height, setHeight] = useState<number>(
    () => Number(localStorage.getItem('bodyHeight')) || 200,
  );
  useEffect(() => {
    localStorage.setItem('bodyHeight', String(height));
  }, [height]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      setHeight(Math.min(700, Math.max(80, startH + ev.clientY - startY)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div className="body-editor">
      <div className="body-type-row">
        {(['none', 'json', 'form', 'raw', 'multipart'] as BodyType[]).map(
          (bt) => (
            <label key={bt} className="radio">
              <input
                type="radio"
                checked={bodyType === bt}
                onChange={() => onType(bt)}
              />
              {bt}
            </label>
          ),
        )}
      </div>
      {bodyType === 'multipart' ? (
        <MultipartEditor
          value={body}
          onChange={onBody}
          names={names}
          files={files}
          setFile={setFile}
        />
      ) : (
        bodyType !== 'none' && (
          <>
            {bodyType === 'json' && (
              <div className="json-view-toggle">
                <button
                  type="button"
                  className={jsonView === 'raw' ? 'seg active' : 'seg'}
                  onClick={() => setJsonView('raw')}
                >
                  {t('req.viewRaw')}
                </button>
                <button
                  type="button"
                  className={jsonView === 'fields' ? 'seg active' : 'seg'}
                  onClick={() => setJsonView('fields')}
                >
                  {t('req.viewFields')}
                </button>
              </div>
            )}
            {bodyType === 'json' && jsonView === 'fields' ? (
              <BodyFieldsEditor value={body} onChange={onBody} names={names} />
            ) : (
              <div className="body-wrap">
                <VarField
                  multiline
                  className="body-textarea"
                  style={{ height }}
                  placeholder={
                    bodyType === 'json' ? t('req.bodyJsonPh') : t('req.bodyRawPh')
                  }
                  value={body}
                  names={names}
                  onChange={onBody}
                />
                <div
                  className="body-resize"
                  onMouseDown={startResize}
                  title={t('req.dragHeight')}
                >
                  <span className="body-resize-grip" />
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

// multipart/form-data part editor. The part structure is stored as JSON in bodyTemplate.
function MultipartEditor({
  value,
  onChange,
  names,
  files,
  setFile,
}: {
  value: string;
  onChange: (v: string) => void;
  names: VarName[];
  files: Record<string, File>;
  setFile: (id: string, f: File | null) => void;
}) {
  const t = useT();
  const parts = parseMultipart(value);
  const commit = (next: MultipartPart[]) => onChange(JSON.stringify(next));
  const add = () =>
    commit([
      ...parts,
      { id: crypto.randomUUID(), key: '', type: 'text', value: '', enabled: true },
    ]);
  const upd = (id: string, patch: Partial<MultipartPart>) =>
    commit(parts.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const del = (id: string) => {
    setFile(id, null);
    commit(parts.filter((p) => p.id !== id));
  };

  return (
    <div className="mp-editor">
      {parts.map((p) => (
        <div className="mp-row" key={p.id}>
          <input
            type="checkbox"
            checked={p.enabled !== false}
            onChange={(e) => upd(p.id, { enabled: e.target.checked })}
          />
          <input
            className="mp-key"
            placeholder="key"
            value={p.key}
            onChange={(e) => upd(p.id, { key: e.target.value })}
          />
          <select
            className="mp-type"
            value={p.type}
            onChange={(e) =>
              upd(p.id, { type: e.target.value as 'text' | 'file' })
            }
          >
            <option value="text">text</option>
            <option value="file">file</option>
          </select>
          {p.type === 'file' ? (
            <label className="mp-file">
              <input
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(p.id, f);
                    upd(p.id, { filename: f.name, contentType: f.type });
                  }
                }}
              />
              <span className="mp-file-btn">
                {files[p.id]?.name ?? p.filename ?? t('req.mpChooseFile')}
              </span>
              {!files[p.id] && p.filename && (
                <span className="mp-reattach">{t('req.mpReattach')}</span>
              )}
            </label>
          ) : (
            <VarField
              className="mp-value"
              placeholder="value"
              value={p.value ?? ''}
              names={names}
              onChange={(v) => upd(p.id, { value: v })}
            />
          )}
          <button className="mini" onClick={() => del(p.id)} title={t('common.delete')}>
            ✕
          </button>
        </div>
      ))}
      <button className="btn-ghost mp-add" onClick={add}>
        {t('req.mpAddPart')}
      </button>
      <p className="section-hint">{t('req.mpHint')}</p>
    </div>
  );
}

function AuthEditor({
  authType,
  authConfig,
  names,
  onType,
  onConfig,
}: {
  authType: AuthType;
  authConfig: ApiEndpoint['authConfig'];
  names: VarName[];
  onType: (a: AuthType) => void;
  onConfig: (c: ApiEndpoint['authConfig']) => void;
}) {
  const t = useT();
  const set = (patch: Partial<ApiEndpoint['authConfig']>) =>
    onConfig({ ...authConfig, ...patch });

  return (
    <div className="auth-editor">
      <div className="auth-type-row">
        {(['none', 'bearer', 'basic', 'apikey'] as AuthType[]).map((a) => (
          <label key={a} className="radio">
            <input
              type="radio"
              checked={authType === a}
              onChange={() => onType(a)}
            />
            {a}
          </label>
        ))}
      </div>

      {authType === 'bearer' && (
        <VarField
          className="auth-input"
          placeholder={t('req.tokenPh')}
          value={authConfig.token ?? ''}
          names={names}
          onChange={(v) => set({ token: v })}
        />
      )}
      {authType === 'basic' && (
        <div className="auth-grid">
          <input
            className="auth-input"
            placeholder="username"
            value={authConfig.username ?? ''}
            onChange={(e) => set({ username: e.target.value })}
          />
          <input
            className="auth-input"
            placeholder="password"
            value={authConfig.password ?? ''}
            onChange={(e) => set({ password: e.target.value })}
          />
        </div>
      )}
      {authType === 'apikey' && (
        <div className="auth-grid">
          <input
            className="auth-input"
            placeholder={t('req.apikeyKeyPh')}
            value={authConfig.key ?? ''}
            onChange={(e) => set({ key: e.target.value })}
          />
          <VarField
            className="auth-input"
            placeholder={t('req.apikeyValuePh')}
            value={authConfig.value ?? ''}
            names={names}
            onChange={(v) => set({ value: v })}
          />
          <select
            className="auth-input"
            value={authConfig.in ?? 'header'}
            onChange={(e) => set({ in: e.target.value as 'header' | 'query' })}
          >
            <option value="header">{t('req.addToHeader')}</option>
            <option value="query">{t('req.addToQuery')}</option>
          </select>
        </div>
      )}
    </div>
  );
}

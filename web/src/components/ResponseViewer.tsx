import { useState } from 'react';
import { ExecuteResult, historyBodyUrl } from '../api/client';
import JsonView from './JsonView';
import JsonPicker from './JsonPicker';
import { useT } from '../i18n';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  result: ExecuteResult | null;
  loading: boolean;
  // If provided, response JSON values can be saved as variables from the click popover.
  onPickVariable?: (name: string, value: string) => void;
  // The value popover copy action (clipboard + toast). Falls back to plain clipboard copy.
  onCopyValue?: (value: string) => void;
  // Whether the request-body panel is expanded by default (default: collapsed)
  requestBodyDefaultOpen?: boolean;
}

function tryParseJson(raw: string | null): { ok: boolean; data?: unknown } {
  if (raw == null || raw === '') return { ok: false };
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function statusClass(status: number | null): string {
  if (status == null) return 'st-none';
  if (status < 300) return 'st-2xx';
  if (status < 400) return 'st-3xx';
  if (status < 500) return 'st-4xx';
  return 'st-5xx';
}

// Shows the request the server actually sent (with variables already substituted).
function SentRequest({
  request,
  defaultOpen,
}: {
  request: ExecuteResult['request'];
  defaultOpen: boolean;
}) {
  const t = useT();
  const [bodyOpen, setBodyOpen] = useState(defaultOpen);
  const headerEntries = Object.entries(request.headers ?? {});
  return (
    <div className="sent-req">
      <div className="sent-req-label">{t('resp.request')}</div>
      <div className="sent-req-body">
        <div className="sent-req-url">
          <span className={`m-badge m-${request.method}`}>
            {request.method}
          </span>
          <span className="sent-url-text">{request.url}</span>
        </div>
        {headerEntries.length > 0 && (
          <table className="kv-table sent-headers">
            <tbody>
              {headerEntries.map(([k, v]) => (
                <tr key={k}>
                  <td className="h-key">{k}</td>
                  <td className="h-val">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {request.body ? (
          <div className="sent-body-block">
            <div className="sent-body-head">
              <button
                className="sent-body-toggle"
                onClick={() => setBodyOpen(!bodyOpen)}
              >
                {bodyOpen ? '▾' : '▸'} {t('resp.body')}
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  request.body && navigator.clipboard.writeText(request.body)
                }
                title={t('resp.copyReqBodyTitle')}
              >
                {t('common.copy')}
              </button>
            </div>
            {bodyOpen && <JsonView raw={request.body} pretty />}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Binary response block. Preview is not auto-rendered; it is opened by the user
// (opt-in, to avoid auto-exposing inappropriate content). Preview uses only safe elements
// that cannot run scripts (img/video/audio); svg, pdf, html, etc. are download-only.
function BinaryBody({
  r,
  historyId,
}: {
  r: NonNullable<ExecuteResult['response']>;
  historyId: string;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  const ct = (r.contentType ?? '').toLowerCase().split(';')[0].trim();
  const kind: 'image' | 'video' | 'audio' | null =
    ct === 'image/svg+xml'
      ? null
      : ct.startsWith('image/')
        ? 'image'
        : ct.startsWith('video/')
          ? 'video'
          : ct.startsWith('audio/')
            ? 'audio'
            : null;
  const url = historyId ? historyBodyUrl(historyId) : null;

  return (
    <div className="resp-body">
      {r.truncated && (
        <div className="resp-truncated">{t('resp.truncated')}</div>
      )}
      <div className="binary-body">
        <div className="binary-meta">
          <span className="binary-badge">{t('resp.binaryTitle')}</span>
          <span className="binary-type">
            {r.contentType || 'application/octet-stream'}
          </span>
          <span className="binary-size">{formatBytes(r.size ?? 0)}</span>
          {url && kind && (
            <button className="btn-ghost" onClick={() => setShow((s) => !s)}>
              {show ? t('resp.hidePreview') : t('resp.showPreview')}
            </button>
          )}
          {url && (
            <a className="btn-ghost" href={url} download>
              {t('resp.download')}
            </a>
          )}
        </div>
        {url && kind && show && (
          <div className="binary-preview-wrap">
            {kind === 'image' && (
              <img className="binary-preview" src={url} alt="" />
            )}
            {kind === 'video' && (
              <video className="binary-preview" src={url} controls />
            )}
            {kind === 'audio' && <audio src={url} controls />}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResponseViewer({
  result,
  loading,
  onPickVariable,
  onCopyValue,
  requestBodyDefaultOpen = false,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  const [pretty, setPretty] = useState(true);

  if (loading) {
    return <div className="resp-empty">{t('resp.sending')}</div>;
  }
  if (!result) {
    return <div className="resp-empty">{t('resp.empty')}</div>;
  }

  if (result.error) {
    return (
      <div className="resp">
        {result.request && <SentRequest request={result.request} defaultOpen={requestBodyDefaultOpen} />}
        <div className="resp-meta">
          <span className="status-badge st-err">{t('resp.failed')}</span>
        </div>
        <pre className="code-block error-text">{result.error}</pre>
      </div>
    );
  }

  const r = result.response!;
  const headerEntries = Object.entries(r.headers ?? {});
  const parsed = tryParseJson(r.body);

  return (
    <div className="resp">
      {result.request && <SentRequest request={result.request} defaultOpen={requestBodyDefaultOpen} />}
      <div className="resp-meta">
        <span className={`status-badge ${statusClass(r.status)}`}>
          {r.status}
        </span>
        <span className="resp-time">{r.durationMs} ms</span>
        <span className="resp-size">
          {formatBytes(r.size ?? (r.body ? new Blob([r.body]).size : 0))}
        </span>
        <div className="resp-tabs">
          <button
            className={tab === 'body' ? 'tab active' : 'tab'}
            onClick={() => setTab('body')}
          >
            Body
          </button>
          <button
            className={tab === 'headers' ? 'tab active' : 'tab'}
            onClick={() => setTab('headers')}
          >
            Headers ({headerEntries.length})
          </button>
        </div>
      </div>

      {tab === 'body' && r.encoding === 'binary' && (
        <BinaryBody key={result.historyId} r={r} historyId={result.historyId} />
      )}

      {tab === 'body' && r.encoding !== 'binary' && (
        <div className="resp-body">
          {r.truncated && (
            <div className="resp-truncated">{t('resp.truncated')}</div>
          )}
          <div className="resp-body-toolbar">
            <label className="pretty-toggle">
              <input
                type="checkbox"
                checked={pretty}
                onChange={(e) => setPretty(e.target.checked)}
              />
              Pretty
            </label>
            <button
              className="btn-ghost"
              onClick={() =>
                r.body && navigator.clipboard.writeText(r.body)
              }
            >
              {t('common.copy')}
            </button>
            {onPickVariable && parsed.ok && (
              <span className="pick-hint">{t('resp.pickHint')}</span>
            )}
          </div>
          {onPickVariable && parsed.ok ? (
            <JsonPicker
              data={parsed.data}
              onPick={onPickVariable}
              onCopy={onCopyValue ?? ((v) => navigator.clipboard.writeText(v))}
            />
          ) : (
            <JsonView raw={r.body} pretty={pretty} />
          )}
        </div>
      )}

      {tab === 'headers' && (
        <div className="resp-headers">
          <table>
            <tbody>
              {headerEntries.map(([k, v]) => (
                <tr key={k}>
                  <td className="h-key">{k}</td>
                  <td className="h-val">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

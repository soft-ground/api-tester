import { useRef, useState } from 'react';
import { importCurl, importOpenapi } from '../api/client';
import { useT } from '../i18n';

interface Props {
  onClose: () => void;
  onDone: (msg: string, collectionId?: string) => void;
}

type Mode = 'openapi' | 'curl';
type Source = 'url' | 'file' | 'json';

export default function ImportModal({ onClose, onDone }: Props) {
  const t = useT();
  const [mode, setMode] = useState<Mode>('openapi');
  const [source, setSource] = useState<Source>('url');
  const [url, setUrl] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileText, setFileText] = useState('');
  const [curlText, setCurlText] = useState('');
  const [colName, setColName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!f) return;
    setFileName(f.name);
    setFileText(await f.text());
    setErr(null);
  };

  const runOpenapi = async () => {
    setErr(null);
    setBusy(true);
    try {
      const payload: any = { collectionName: colName || undefined };
      if (source === 'url') {
        if (!url.trim()) throw new Error(t('import.errUrl'));
        payload.url = url.trim();
      } else if (source === 'file') {
        if (!fileText.trim()) throw new Error(t('import.errFile'));
        payload.spec = JSON.parse(fileText);
      } else {
        if (!jsonText.trim()) throw new Error(t('import.errJson'));
        payload.spec = JSON.parse(jsonText);
      }
      const r = await importOpenapi(payload);
      const where = r.grouped
        ? t('import.whereGrouped', { count: r.collections.length })
        : t('import.whereCollection', { name: r.collections[0]?.name ?? '' });
      onDone(
        t('import.doneOpenapi', {
          where,
          added: r.added,
          skipped: r.skipped,
          total: r.total,
        }),
      );
    } catch (e: any) {
      setErr(
        e?.response?.data?.message ||
          (e instanceof SyntaxError
            ? t('import.jsonSyntax', { msg: e.message })
            : e?.message) ||
          t('import.fail'),
      );
    } finally {
      setBusy(false);
    }
  };

  const runCurl = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!curlText.trim()) throw new Error(t('import.errCurl'));
      const r = await importCurl({
        curl: curlText,
        collectionName: colName || undefined,
      });
      onDone(t('import.doneCurl', { name: r.endpoint.name }), r.collectionId);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || t('import.fail'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal import-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{t('import.title')}</h3>
          <button className="mini" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="import-tabs">
          <button
            className={mode === 'openapi' ? 'tab active' : 'tab'}
            onClick={() => setMode('openapi')}
          >
            OpenAPI / Swagger
          </button>
          <button
            className={mode === 'curl' ? 'tab active' : 'tab'}
            onClick={() => setMode('curl')}
          >
            curl
          </button>
        </div>

        <div className="modal-body">
          {mode === 'openapi' ? (
            <>
              <div className="body-type-row">
                <label className="radio">
                  <input
                    type="radio"
                    checked={source === 'url'}
                    onChange={() => setSource('url')}
                  />
                  {t('import.sourceUrl')}
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    checked={source === 'file'}
                    onChange={() => setSource('file')}
                  />
                  {t('import.sourceFile')}
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    checked={source === 'json'}
                    onChange={() => setSource('json')}
                  />
                  {t('import.sourceJson')}
                </label>
              </div>
              {source === 'url' && (
                <input
                  className="import-input"
                  placeholder={t('import.phUrl')}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              )}
              {source === 'file' && (
                <div className="import-file">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: 'none' }}
                    onChange={onPickFile}
                  />
                  <button
                    className="btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    {t('import.pickFile')}
                  </button>
                  <span className="import-file-name">
                    {fileName || t('import.noFile')}
                  </span>
                </div>
              )}
              {source === 'json' && (
                <textarea
                  className="import-textarea"
                  placeholder={t('import.phJson')}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                />
              )}
              <p className="section-hint">{t('import.hintOpenapi')}</p>
            </>
          ) : (
            <>
              <textarea
                className="import-textarea"
                placeholder={"curl -X POST 'https://api.example.com/orders' \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"itemId\":\"A\"}'"}
                value={curlText}
                onChange={(e) => setCurlText(e.target.value)}
              />
              <p className="section-hint">{t('import.hintCurl')}</p>
            </>
          )}

          <input
            className="import-input"
            placeholder={
              mode === 'openapi'
                ? t('import.colNameOpenapi')
                : t('import.colNameCurl')
            }
            value={colName}
            onChange={(e) => setColName(e.target.value)}
          />

          {err && <div className="import-err">{err}</div>}
        </div>

        <div className="modal-foot">
          <button
            className="btn btn-send"
            disabled={busy}
            onClick={mode === 'openapi' ? runOpenapi : runCurl}
          >
            {busy ? t('import.going') : t('import.go')}
          </button>
          <button className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

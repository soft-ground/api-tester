import { useEffect, useState } from 'react';
import {
  ExecuteResult,
  HistoryDetail,
  HistoryFolder,
  HistoryItem,
  createHistoryFolder,
  deleteHistory,
  deleteHistoryFolder,
  execute,
  getHistory,
  listHistory,
  listHistoryFolders,
  moveHistory,
  renameHistoryFolder,
} from '../api/client';
import ResponseViewer from '../components/ResponseViewer';
import { useDialog } from '../components/DialogProvider';
import { usePickVariable } from '../hooks/usePickVariable';
import { useT } from '../i18n';

const METHODS = ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUSES = ['', '2xx', '3xx', '4xx', '5xx'];

type View = 'flat' | 'folder';

function statusClass(status: number | null): string {
  if (status == null) return 'st-none';
  if (status < 300) return 'st-2xx';
  if (status < 400) return 'st-3xx';
  if (status < 500) return 'st-4xx';
  return 'st-5xx';
}

export default function HistoryPage() {
  const t = useT();
  const { confirm, prompt } = useDialog();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<HistoryDetail | null>(null);
  const [rerunResult, setRerunResult] = useState<ExecuteResult | null>(null);
  const { pick, copy, toast } = usePickVariable();

  const [view, setView] = useState<View>(
    () => (localStorage.getItem('historyView') as View) || 'flat',
  );
  const [folders, setFolders] = useState<HistoryFolder[]>([]);
  const [folderSel, setFolderSel] = useState<string>(''); // '' all | 'null' uncategorized | id
  const [listWidth, setListWidth] = useState<number>(
    () => Number(localStorage.getItem('historyListWidth')) || 340,
  );

  useEffect(() => {
    localStorage.setItem('historyView', view);
  }, [view]);
  useEffect(() => {
    localStorage.setItem('historyListWidth', String(listWidth));
  }, [listWidth]);

  // Drag to resize the left list-panel width
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: MouseEvent) =>
      setListWidth(Math.min(700, Math.max(240, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const refreshFolders = async () => setFolders(await listHistoryFolders());
  useEffect(() => {
    refreshFolders();
  }, []);

  const load = async () => {
    const params: Record<string, string> = {};
    if (method) params.method = method;
    if (status) params.status = status;
    if (q) params.q = q;
    if (view === 'folder' && folderSel !== '') params.folderId = folderSel;
    const res = await listHistory(params);
    setItems(res.items);
    setTotal(res.total);
  };

  useEffect(() => {
    load();
  }, [method, status, view, folderSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDetail = async (id: string) => {
    setRerunResult(null);
    setSelected(await getHistory(id));
  };

  const onMove = async (id: string, folderId: string) => {
    await moveHistory([id], folderId || null);
    await Promise.all([load(), refreshFolders()]);
  };

  const onDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({ message: t('hist.deleteConfirm'), tone: 'warn' })))
      return;
    await deleteHistory([id]);
    if (selected?.id === id) setSelected(null);
    await Promise.all([load(), refreshFolders()]);
  };

  const addFolder = async () => {
    const name = await prompt({ message: t('hist.folderNamePrompt') });
    if (!name) return;
    await createHistoryFolder(name);
    refreshFolders();
  };
  const renameFolder = async (f: HistoryFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = await prompt({
      message: t('hist.folderRenamePrompt'),
      defaultValue: f.name,
    });
    if (!name) return;
    await renameHistoryFolder(f.id, name);
    refreshFolders();
  };
  const removeFolder = async (f: HistoryFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !(await confirm({
        message: t('hist.deleteFolder', { name: f.name }),
        tone: 'warn',
      }))
    )
      return;
    await deleteHistoryFolder(f.id);
    if (folderSel === f.id) setFolderSel('');
    await Promise.all([refreshFolders(), load()]);
  };

  const rerun = async () => {
    if (!selected) return;
    const headers = Object.entries(selected.reqHeaders ?? {}).map(
      ([key, value]) => ({ key, value: String(value), enabled: true }),
    );
    const res = await execute({
      endpointId: selected.endpointId ?? undefined,
      method: selected.reqMethod,
      url: selected.reqUrl,
      headers,
      body: selected.reqBody ?? '',
      bodyType: selected.reqBody ? 'raw' : 'none',
    });
    setRerunResult(res);
    load();
  };

  return (
    <div className="history-layout">
      <div className="history-list-panel" style={{ width: listWidth }}>
        <div className="filter-bar">
          <div className="view-toggle">
            <button
              className={view === 'flat' ? 'vt active' : 'vt'}
              onClick={() => setView('flat')}
            >
              {t('hist.viewFlat')}
            </button>
            <button
              className={view === 'folder' ? 'vt active' : 'vt'}
              onClick={() => setView('folder')}
            >
              {t('hist.viewFolder')}
            </button>
          </div>
          <span className="filter-total">{t('hist.total', { count: total })}</span>
        </div>

        <div className="filter-bar filter-bar2">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m || 'Method'}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'Status'}
              </option>
            ))}
          </select>
          <input
            className="filter-q"
            placeholder={t('hist.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>

        {view === 'folder' && (
          <div className="folder-bar">
            <button
              className={folderSel === '' ? 'folder-chip active' : 'folder-chip'}
              onClick={() => setFolderSel('')}
            >
              {t('hist.all')}
            </button>
            <button
              className={
                folderSel === 'null' ? 'folder-chip active' : 'folder-chip'
              }
              onClick={() => setFolderSel('null')}
            >
              {t('hist.uncategorized')}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={
                  folderSel === f.id ? 'folder-chip active' : 'folder-chip'
                }
                onClick={() => setFolderSel(f.id)}
                onDoubleClick={(e) => renameFolder(f, e)}
                title={t('hist.dblRename')}
              >
                {f.name}
                <span className="fc-count">{f._count?.histories ?? 0}</span>
                <span className="fc-del" onClick={(e) => removeFolder(f, e)}>
                  ✕
                </span>
              </button>
            ))}
            <button className="folder-chip add" onClick={addFolder}>
              {t('hist.addFolder')}
            </button>
          </div>
        )}

        <div className="history-items">
          {items.length === 0 && (
            <div className="tree-empty">{t('hist.empty')}</div>
          )}
          {items.map((it) => (
            <div
              key={it.id}
              className={
                selected?.id === it.id ? 'history-item active' : 'history-item'
              }
              onClick={() => openDetail(it.id)}
            >
              <span className={`m-badge m-${it.reqMethod}`}>{it.reqMethod}</span>
              <span
                className={`status-dot ${it.error ? 'st-err' : statusClass(it.resStatus)}`}
              >
                {it.error ? 'ERR' : it.resStatus}
              </span>
              <span className="hi-url" title={it.reqUrl}>
                {it.reqUrl}
              </span>
              <span className="hi-meta">
                {it.durationMs != null ? `${it.durationMs}ms` : ''} ·{' '}
                {new Date(it.executedAt).toLocaleString()}
              </span>
              <span className="hi-actions" onClick={(e) => e.stopPropagation()}>
                <select
                  className="hi-move"
                  value={it.folderId ?? ''}
                  onChange={(e) => onMove(it.id, e.target.value)}
                  title={t('hist.moveToFolder')}
                >
                  <option value="">{t('hist.uncategorized')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  className="mini hi-del"
                  onClick={(e) => onDeleteItem(it.id, e)}
                  title={t('hist.deleteEntry')}
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="resizer"
        onMouseDown={startResize}
        title={t('common.dragResize')}
      />

      <div className="history-detail-panel">
        {!selected ? (
          <div className="builder-empty">{t('hist.detailEmpty')}</div>
        ) : (
          (() => {
            const detailResult: ExecuteResult = {
              historyId: selected.id,
              request: {
                method: selected.reqMethod,
                url: selected.reqUrl,
                headers: (selected.reqHeaders as Record<string, string>) ?? {},
                body: selected.reqBody,
              },
              response: selected.error
                ? null
                : {
                    status: selected.resStatus,
                    headers:
                      (selected.resHeaders as Record<string, string>) ?? {},
                    body: selected.resBody,
                    durationMs: selected.durationMs ?? 0,
                    encoding: selected.resBodyEncoding,
                    contentType: selected.resContentType,
                    size: selected.resSize ?? undefined,
                    truncated: selected.resTruncated,
                  },
              success: selected.success,
              error: selected.error,
            };
            return (
              <div className="history-detail">
                <div className="hd-header">
                  <span className={`m-badge m-${selected.reqMethod}`}>
                    {selected.reqMethod}
                  </span>
                  <span className="hd-url">{selected.reqUrl}</span>
                  <button className="btn btn-send" onClick={rerun}>
                    {t('hist.rerun')}
                  </button>
                </div>

                <ResponseViewer
                  result={detailResult}
                  loading={false}
                  onPickVariable={pick}
                  onCopyValue={copy}
                  requestBodyDefaultOpen
                />

                {rerunResult && (
                  <div className="rerun-box">
                    <h4>{t('hist.rerunResult')}</h4>
                    <ResponseViewer
                      result={rerunResult}
                      loading={false}
                      onPickVariable={pick}
                      onCopyValue={copy}
                      requestBodyDefaultOpen
                    />
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const lastIdxRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<string>(''); // folder-chip key currently under a drag
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

  // Keep the checked set consistent with what is currently listed (drop ids filtered away).
  useEffect(() => {
    setCheckedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((i) => i.id));
      const next = new Set<string>();
      prev.forEach((id) => visible.has(id) && next.add(id));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const openDetail = async (id: string) => {
    setRerunResult(null);
    setSelected(await getHistory(id));
  };

  // Checkbox click: plain toggles one row; Shift extends from the last-clicked row.
  // Read the modifier and anchor synchronously — they must not be referenced from inside the
  // async setState updater (the synthetic event is not reliable there).
  const onCheck = (i: number, ev: React.MouseEvent) => {
    ev.stopPropagation();
    const shift = ev.shiftKey;
    const anchor = lastIdxRef.current;
    const id = items[i].id;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const shouldCheck = !prev.has(id);
      if (shift && anchor !== null) {
        const [a, b] = [anchor, i].sort((x, y) => x - y);
        for (let k = a; k <= b; k++) {
          if (shouldCheck) next.add(items[k].id);
          else next.delete(items[k].id);
        }
      } else if (shouldCheck) next.add(id);
      else next.delete(id);
      return next;
    });
    lastIdxRef.current = i;
  };

  const toggleAll = (check: boolean) => {
    setCheckedIds(check ? new Set(items.map((i) => i.id)) : new Set());
    lastIdxRef.current = null;
  };

  const moveSelected = async (val: string) => {
    if (!val || checkedIds.size === 0) return;
    await moveHistory([...checkedIds], val === '__none' ? null : val);
    toggleAll(false);
    await Promise.all([load(), refreshFolders()]);
  };

  const deleteSelected = async () => {
    if (checkedIds.size === 0) return;
    if (
      !(await confirm({
        message: t('hist.deleteSelectedConfirm', { count: checkedIds.size }),
        tone: 'warn',
      }))
    )
      return;
    const ids = [...checkedIds];
    await deleteHistory(ids);
    if (selected && checkedIds.has(selected.id)) setSelected(null);
    toggleAll(false);
    await Promise.all([load(), refreshFolders()]);
  };

  // Drag a single history row onto a folder chip to move it there.
  const dropToFolder = async (folderId: string | null, id: string) => {
    setDragOver('');
    if (!id) return;
    await moveHistory([id], folderId);
    await Promise.all([load(), refreshFolders()]);
  };

  // Drop onto the "+ folder" chip: prompt for a name, create the folder, then move the entry into it.
  const dropToNewFolder = async (id: string) => {
    setDragOver('');
    if (!id) return;
    const name = await prompt({ message: t('hist.folderNamePrompt') });
    if (!name) return;
    const folder = await createHistoryFolder(name);
    await moveHistory([id], folder.id);
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
                (folderSel === 'null' ? 'folder-chip active' : 'folder-chip') +
                (dragOver === 'null' ? ' drop-over' : '')
              }
              onClick={() => setFolderSel('null')}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver('null');
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropToFolder(null, e.dataTransfer.getData('text/plain'));
              }}
            >
              {t('hist.uncategorized')}
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                className={
                  (folderSel === f.id ? 'folder-chip active' : 'folder-chip') +
                  (dragOver === f.id ? ' drop-over' : '')
                }
                onClick={() => setFolderSel(f.id)}
                onDoubleClick={(e) => renameFolder(f, e)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOver(f.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropToFolder(f.id, e.dataTransfer.getData('text/plain'));
                }}
                title={t('hist.dblRename')}
              >
                {f.name}
                <span className="fc-count">{f._count?.histories ?? 0}</span>
                <span className="fc-del" onClick={(e) => removeFolder(f, e)}>
                  ✕
                </span>
              </button>
            ))}
            <button
              className={
                'folder-chip add' + (dragOver === '__new' ? ' drop-over' : '')
              }
              onClick={addFolder}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOver('__new');
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropToNewFolder(e.dataTransfer.getData('text/plain'));
              }}
            >
              {t('hist.addFolder')}
            </button>
          </div>
        )}

        {items.length > 0 && (
          <div className="hist-toolbar">
            <label className="hist-selall">
              <input
                type="checkbox"
                checked={checkedIds.size === items.length}
                ref={(cb) => {
                  if (cb)
                    cb.indeterminate =
                      checkedIds.size > 0 && checkedIds.size < items.length;
                }}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              {checkedIds.size > 0
                ? t('hist.selectedCount', { count: checkedIds.size })
                : t('hist.selectAll')}
            </label>
            {checkedIds.size > 0 && (
              <div className="hist-selactions">
                <select
                  className="hi-move"
                  value=""
                  onChange={(e) => moveSelected(e.target.value)}
                  title={t('hist.moveSelected')}
                >
                  <option value="" disabled>
                    {t('hist.moveSelected')}
                  </option>
                  <option value="__none">{t('hist.uncategorized')}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button className="btn-ghost" onClick={deleteSelected}>
                  {t('hist.deleteSelected')}
                </button>
                <button className="btn-ghost" onClick={() => toggleAll(false)}>
                  {t('hist.clearSel')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="history-items">
          {items.length === 0 && (
            <div className="tree-empty">{t('hist.empty')}</div>
          )}
          {items.map((it, i) => (
            <div
              key={it.id}
              className={
                selected?.id === it.id ? 'history-item active' : 'history-item'
              }
              onClick={() => openDetail(it.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', it.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => setDragOver('')}
            >
              <input
                type="checkbox"
                className="hi-check"
                checked={checkedIds.has(it.id)}
                onChange={() => {}}
                onClick={(e) => onCheck(i, e)}
              />
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

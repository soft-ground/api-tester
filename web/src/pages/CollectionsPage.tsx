import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ApiEndpoint,
  Collection,
  createCollection,
  createEndpoint,
  deleteCollection,
  deleteEndpoint,
  duplicateEndpoint,
  exportBackup,
  getEndpoint,
  importBackup,
  listCollections,
  moveCollection,
  reorderCollections,
  reorderEndpoints,
  updateCollection,
  updateEndpoint,
} from '../api/client';
import RequestBuilder, { SCRATCH_ENDPOINT } from '../components/RequestBuilder';
import Modal from '../components/Modal';
import ImportModal from '../components/ImportModal';
import { useDialog } from '../components/DialogProvider';
import { useT } from '../i18n';

// Move an array item from one position to another
function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function CollectionsPage() {
  const t = useT();
  const { confirm, prompt } = useDialog();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => localStorage.getItem('selectedEndpointId') || null,
  );
  const [endpoint, setEndpoint] = useState<ApiEndpoint | null>(null);
  // Quick request (scratch) mode: edit an unsaved temporary request. Kept across navigation.
  const [scratch, setScratch] = useState(
    () => localStorage.getItem('scratchMode') === '1',
  );
  // Management action overflow menu (+ collection, import, backup)
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // Drag state (shared by groups/endpoints) + drop-position indicator
  const [drag, setDrag] = useState<{
    kind: 'col' | 'ep';
    id: string;
    colId?: string | null; // the endpoint owning collection
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    pos: 'into' | 'before' | 'after';
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // API list panel width (drag to resize) + collection collapsed state (saved to localStorage)
  const [treeWidth, setTreeWidth] = useState<number>(
    () => Number(localStorage.getItem('apiListWidth')) || 300,
  );
  const [collapsedCols, setCollapsedCols] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('collapsedCollections') || '[]'));
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    localStorage.setItem('apiListWidth', String(treeWidth));
  }, [treeWidth]);
  useEffect(() => {
    localStorage.setItem('collapsedCollections', JSON.stringify([...collapsedCols]));
  }, [collapsedCols]);

  // Automatically leave scratch (quick request) mode when an endpoint is selected
  useEffect(() => {
    if (selectedId) setScratch(false);
  }, [selectedId]);
  // Persist scratch mode (across navigation/refresh)
  useEffect(() => {
    localStorage.setItem('scratchMode', scratch ? '1' : '0');
  }, [scratch]);

  // Overflow menu: close on outside click / Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Auto-select ?select=<id> passed from global search
  useEffect(() => {
    const sel = searchParams.get('select');
    if (sel) {
      setSelectedId(sel);
      searchParams.delete('select');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Drag-resize the panel width
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = treeWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(600, Math.max(220, startW + ev.clientX - startX));
      setTreeWidth(w);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Collapse/expand a collection
  const toggleCollapse = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const collapseAll = () =>
    setCollapsedCols(new Set(collections.map((c) => c.id)));
  const expandAll = () => setCollapsedCols(new Set());

  const refresh = async () => {
    const cols = await listCollections();
    setCollections(cols);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setEndpoint(null);
      localStorage.removeItem('selectedEndpointId');
      return;
    }
    localStorage.setItem('selectedEndpointId', selectedId);
    getEndpoint(selectedId)
      .then(setEndpoint)
      .catch(() => {
        // deleted endpoint, etc. → clear selection
        setSelectedId(null);
      });
  }, [selectedId]);

  const onAddCollection = async () => {
    const name = await prompt({ message: t('col.namePrompt') });
    if (!name) return;
    await createCollection(name);
    refresh();
  };

  const onAddEndpoint = async (collectionId: string) => {
    const name = await prompt({
      message: t('col.apiNamePrompt'),
      defaultValue: t('col.apiNameDefault'),
    });
    if (!name) return;
    const ep = await createEndpoint({
      name,
      collectionId,
      method: 'GET',
      baseUrl: '',
      path: '',
    });
    await refresh();
    setSelectedId(ep.id);
  };

  const onDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const dup = await duplicateEndpoint(id);
    await refresh();
    setSelectedId(dup.id);
  };

  const onDeleteEndpoint = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({ message: t('col.deleteApi'), tone: 'warn' }))) return;
    await deleteEndpoint(id);
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  const onDeleteCollection = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await confirm({ message: t('col.deleteCollection'), tone: 'warn' })))
      return;
    await deleteCollection(id);
    refresh();
  };

  // Export backup: download the whole workspace as a JSON file
  const onExport = async () => {
    const data = await exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url;
    a.download = `api-tester-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import backup: pick a JSON file → merge into the server (existing data is preserved)
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const s = await importBackup(data);
      setImportMsg(
        t('col.importDone', {
          colAdded: s.collections.added,
          colMerged: s.collections.merged,
          epAdded: s.endpoints.added,
          epSkipped: s.endpoints.skipped,
          envAdded: s.environments.added,
          envSkipped: s.environments.skipped,
          varAdded: s.variableRules.added,
          varSkipped: s.variableRules.skipped,
        }),
      );
      refresh();
    } catch (err: any) {
      setImportMsg(
        t('col.importFail', { msg: err?.message || t('col.importBadFile') }),
      );
    }
  };

  // Inline-edit a collection name
  const startRename = (col: Collection, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCol(col.id);
    setEditName(col.name);
  };
  const commitRename = async (id: string) => {
    const name = editName.trim();
    setEditingCol(null);
    if (name) {
      await updateCollection(id, name);
      refresh();
    }
  };

  // ---- Tree building & drag ----
  const parentOf = (id: string) =>
    collections.find((c) => c.id === id)?.parentId ?? null;
  // Whether nodeId is a descendant of ancestorId (for cycle prevention)
  const isDescendant = (nodeId: string, ancestorId: string): boolean => {
    let p = parentOf(nodeId);
    while (p) {
      if (p === ancestorId) return true;
      p = parentOf(p);
    }
    return false;
  };
  const childrenOf = (parentId: string | null) =>
    collections
      .filter((c) => (c.parentId ?? null) === parentId)
      .sort((a, b) => a.order - b.order);

  const onAddSubgroup = async (parentId: string) => {
    const name = await prompt({ message: t('col.subgroupPrompt') });
    if (!name) return;
    await createCollection(name, parentId);
    setCollapsedCols((prev) => {
      const next = new Set(prev);
      next.delete(parentId); // expand the parent when adding a child
      return next;
    });
    refresh();
  };

  // Dragging over a collection header: decide before/into/after from the pointer Y.
  // To avoid flicker near boundaries: (1) setState only when the value actually changes,
  // (2) apply hysteresis that holds the current zone slightly longer.
  const onColDragOver = (e: React.DragEvent, col: Collection) => {
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    if (drag.kind === 'ep') {
      setDropTarget((prev) =>
        prev && prev.id === col.id && prev.pos === 'into'
          ? prev
          : { id: col.id, pos: 'into' },
      );
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const yf = (e.clientY - rect.top) / rect.height;
    setDropTarget((prev) => {
      const prevPos = prev && prev.id === col.id ? prev.pos : null;
      // leaving the current zone requires crossing the boundary a bit further (inertia)
      const beforeMax = prevPos === 'before' ? 0.4 : 0.3;
      const afterMin = prevPos === 'after' ? 0.6 : 0.7;
      const pos: 'into' | 'before' | 'after' =
        yf < beforeMax ? 'before' : yf > afterMin ? 'after' : 'into';
      if (prev && prev.id === col.id && prev.pos === pos) return prev;
      return { id: col.id, pos };
    });
  };

  const onColDrop = async (e: React.DragEvent, col: Collection) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag;
    const dt = dropTarget;
    setDrag(null);
    setDropTarget(null);
    if (!d) return;

    // move the endpoint into this group (when it came from another collection)
    if (d.kind === 'ep') {
      if (d.colId === col.id) return;
      await updateEndpoint(d.id, { collectionId: col.id });
      await refresh();
      return;
    }

    // group drag
    if (d.id === col.id) return;
    const pos = dt?.pos ?? 'into';
    if (pos === 'into') {
      if (isDescendant(col.id, d.id)) return; // cannot move into its own descendant
      await moveCollection(d.id, col.id);
    } else {
      const newParent = col.parentId ?? null;
      // if the new parent is the dragged item itself or its descendant, it is a cycle → abort
      if (newParent && (newParent === d.id || isDescendant(newParent, d.id)))
        return;
      const siblingIds = childrenOf(newParent)
        .filter((c) => c.id !== d.id)
        .map((c) => c.id);
      const targetIdx = siblingIds.indexOf(col.id);
      const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1;
      siblingIds.splice(insertIdx, 0, d.id);
      await moveCollection(d.id, newParent);
      await reorderCollections(siblingIds);
    }
    await refresh();
  };

  // Drop onto an endpoint row: reorder within the same collection, or move to that position from another collection
  const onEpDrop = async (e: React.DragEvent, col: Collection, to: number) => {
    e.preventDefault();
    e.stopPropagation();
    const d = drag;
    setDrag(null);
    setDropTarget(null);
    if (!d || d.kind !== 'ep') return;
    if (d.colId === col.id) {
      const from = col.endpoints.findIndex((x) => x.id === d.id);
      if (from < 0 || from === to) return;
      const next = move(col.endpoints, from, to);
      await reorderEndpoints(next.map((x) => x.id));
    } else {
      const epIds = col.endpoints.map((x) => x.id);
      epIds.splice(to, 0, d.id);
      await updateEndpoint(d.id, { collectionId: col.id });
      await reorderEndpoints(epIds);
    }
    await refresh();
  };

  // Recursively render a group node (endpoints + child groups inside). Indent by depth.
  const renderNode = (col: Collection, depth: number) => {
    const collapsed = collapsedCols.has(col.id);
    const kids = childrenOf(col.id);
    const indent = 8 + depth * 14;
    const dropCls =
      dropTarget?.id === col.id ? ` drop-${dropTarget.pos}` : '';
    return (
      <div className="tree-collection" key={col.id}>
        <div
          className={`tree-col-header${dropCls}`}
          style={
            {
              paddingLeft: indent,
              ['--drop-indent']: `${indent}px`,
            } as React.CSSProperties
          }
          draggable={editingCol !== col.id}
          onDragStart={(e) => {
            e.stopPropagation();
            setDrag({ kind: 'col', id: col.id });
          }}
          onDragEnd={() => {
            setDrag(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => onColDragOver(e, col)}
          onDrop={(e) => onColDrop(e, col)}
        >
          <button
            className="mini col-toggle"
            onClick={(e) => toggleCollapse(col.id, e)}
            title={collapsed ? t('shell.expand') : t('shell.collapse')}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <span className="grip" title={t('col.dragHint')}>
            ⠿
          </span>
          {editingCol === col.id ? (
            <input
              className="col-edit-input"
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => commitRename(col.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(col.id);
                if (e.key === 'Escape') setEditingCol(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <>
              <span
                className="col-name"
                title={t('col.renameHint')}
                onDoubleClick={(e) => startRename(col, e)}
              >
                {col.name}
              </span>
              {collapsed && (col.endpoints.length > 0 || kids.length > 0) && (
                <span className="col-count">
                  {col.endpoints.length + kids.length}
                </span>
              )}
            </>
          )}
          {dropTarget?.id === col.id && (
            <span className={`drop-hint drop-hint-${dropTarget.pos}`}>
              {dropTarget.pos === 'into'
                ? `↳ ${t('col.dropInside')} · ${t('col.levelN', { n: depth + 2 })}`
                : t('col.levelN', { n: depth + 1 })}
            </span>
          )}
          <span className="col-actions">
            <button
              className="mini"
              onClick={(e) => startRename(col, e)}
              title={t('col.rename')}
            >
              ✎
            </button>
            <button
              className="mini"
              onClick={() => onAddSubgroup(col.id)}
              title={t('col.addSubgroup')}
            >
              ⊞
            </button>
            <button
              className="mini"
              onClick={() => onAddEndpoint(col.id)}
              title={t('col.addApi')}
            >
              +
            </button>
            <button
              className="mini"
              onClick={(e) => onDeleteCollection(col.id, e)}
              title={t('col.deleteGroup')}
            >
              ✕
            </button>
          </span>
        </div>
        {!collapsed && (
          <>
            {col.endpoints.map((ep, ei) => (
              <div
                key={ep.id}
                className={
                  selectedId === ep.id
                    ? 'tree-endpoint active'
                    : 'tree-endpoint'
                }
                style={{ paddingLeft: indent + 14 }}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDrag({ kind: 'ep', id: ep.id, colId: col.id });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  if (drag?.kind === 'ep') e.preventDefault();
                }}
                onDrop={(e) => onEpDrop(e, col, ei)}
                onClick={() => setSelectedId(ep.id)}
              >
                <span className="grip ep-grip" title={t('col.dragHint')}>
                  ⠿
                </span>
                <span className={`m-badge m-${ep.method}`}>{ep.method}</span>
                <span className="ep-name">{ep.name}</span>
                <button
                  className="mini ep-act"
                  onClick={(e) => onDuplicate(ep.id, e)}
                  title={t('col.duplicate')}
                >
                  ⧉
                </button>
                <button
                  className="mini ep-act"
                  onClick={(e) => onDeleteEndpoint(ep.id, e)}
                  title={t('common.delete')}
                >
                  ✕
                </button>
              </div>
            ))}
            {col.endpoints.length === 0 && kids.length === 0 && (
              <div
                className="tree-endpoint-empty"
                style={{ paddingLeft: indent + 14 }}
              >
                {t('col.noApi')}
              </div>
            )}
            {kids.map((child) => renderNode(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="collections-layout">
      <div className="tree-panel" style={{ width: treeWidth }}>
        <div className="tree-header">
          <div className="tree-header-top">
            <span className="tree-title">{t('col.title')}</span>
            <button
              className={scratch ? 'btn btn-quick active' : 'btn btn-quick'}
              onClick={() => {
                setSelectedId(null);
                setScratch(true);
              }}
              title={t('col.quickRequestTitle')}
            >
              {t('col.quickRequest')}
            </button>
            <div className="tree-menu" ref={menuRef}>
              <button
                className="tree-menu-btn"
                onClick={() => setMenuOpen((o) => !o)}
                title={t('col.manage')}
                aria-label={t('col.manage')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="tree-menu-pop" role="menu">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onAddCollection();
                    }}
                  >
                    {t('col.addCollection')}
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowImport(true);
                    }}
                  >
                    {t('col.importApi')}
                  </button>
                  <div className="tree-menu-sep" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onExport();
                    }}
                  >
                    {t('col.backupExport')}
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      fileRef.current?.click();
                    }}
                  >
                    {t('col.backupImport')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
        </div>
        {collections.length > 0 && (
          <div className="tree-subbar">
            <button
              className="tree-tool-btn"
              onClick={collapseAll}
              title={t('col.collapseAll')}
              aria-label={t('col.collapseAll')}
            >
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7l4-4 4 4" />
                <path d="M4 12l4-4 4 4" />
              </svg>
            </button>
            <button
              className="tree-tool-btn"
              onClick={expandAll}
              title={t('col.expandAll')}
              aria-label={t('col.expandAll')}
            >
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4l4 4 4-4" />
                <path d="M4 9l4 4 4-4" />
              </svg>
            </button>
          </div>
        )}
        {loading && <div className="tree-empty">{t('col.emptyLoading')}</div>}
        {!loading && collections.length === 0 && (
          <div className="tree-empty">{t('col.emptyNoCollection')}</div>
        )}
        {!loading && childrenOf(null).map((col) => renderNode(col, 0))}
      </div>

      <div
        className="resizer"
        onMouseDown={startResize}
        title={t('common.dragResize')}
      />

      <div className="builder-panel">
        {scratch ? (
          <RequestBuilder
            key="scratch"
            endpoint={SCRATCH_ENDPOINT}
            scratch
            onSaved={(ep) => {
              setScratch(false);
              setSelectedId(ep.id);
              setEndpoint(ep);
              refresh();
            }}
          />
        ) : endpoint ? (
          <RequestBuilder
            key={endpoint.id}
            endpoint={endpoint}
            onSaved={(ep) => {
              setSelectedId(ep.id);
              setEndpoint(ep);
              refresh();
            }}
          />
        ) : (
          <div className="builder-empty">
            {t('col.builderEmpty')}
          </div>
        )}
      </div>

      {importMsg && (
        <Modal title={t('col.importResult')} onClose={() => setImportMsg(null)}>
          <p>{importMsg}</p>
          <p className="section-hint">{t('col.importSkipHint')}</p>
        </Modal>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            setShowImport(false);
            setImportMsg(msg);
            refresh();
          }}
        />
      )}
    </div>
  );
}

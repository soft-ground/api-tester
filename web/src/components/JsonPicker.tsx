import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface PickProps {
  data: unknown;
  onPick: (name: string, value: string) => void;
  onCopy: (value: string) => void;
}

// Render the response JSON as a tree; clicking a leaf value opens a popover.
// Choose copy or save-as-variable in the popover (the click itself is harmless — even a
// misclick does nothing destructive). Only one opens at a time; clicking outside closes it.
export default function JsonPicker({ data, onPick, onCopy }: PickProps) {
  const [openPath, setOpenPath] = useState<string | null>(null);

  useEffect(() => {
    if (openPath === null) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      // Keep it open on clicks inside the popover; otherwise (including other values) close it.
      if (!el.closest('.pick-popover')) setOpenPath(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openPath]);

  return (
    <pre className="code-block json-tree">
      <Node
        k={null}
        value={data}
        depth={0}
        path="$"
        openPath={openPath}
        setOpenPath={setOpenPath}
        onPick={onPick}
        onCopy={onCopy}
        last
      />
    </pre>
  );
}

function leafClass(value: unknown): string {
  if (typeof value === 'string') return 'j-str';
  if (typeof value === 'number') return 'j-num';
  if (typeof value === 'boolean') return 'j-bool';
  return 'j-null';
}

interface NodeProps {
  k: string | number | null;
  value: unknown;
  depth: number;
  path: string;
  openPath: string | null;
  setOpenPath: (p: string | null) => void;
  onPick: (name: string, value: string) => void;
  onCopy: (value: string) => void;
  last: boolean;
}

function Node({
  k,
  value,
  depth,
  path,
  openPath,
  setOpenPath,
  onPick,
  onCopy,
  last,
}: NodeProps) {
  const indent = { paddingLeft: depth * 16 };
  const keyLabel =
    k !== null ? <span className="jt-key">"{k}": </span> : null;

  const isObject = value !== null && typeof value === 'object';

  if (isObject) {
    const isArray = Array.isArray(value);
    const entries: [string | number, unknown][] = isArray
      ? (value as unknown[]).map((v, i) => [i, v])
      : Object.entries(value as Record<string, unknown>);
    return (
      <div className="jt-node">
        <div style={indent}>
          {keyLabel}
          {isArray ? '[' : '{'}
          {entries.length === 0 && (isArray ? ']' : '}')}
        </div>
        {entries.map(([ck, cv], i) => (
          <Node
            key={ck}
            k={isArray ? null : (ck as string)}
            value={cv}
            depth={depth + 1}
            path={`${path}.${ck}`}
            openPath={openPath}
            setOpenPath={setOpenPath}
            onPick={onPick}
            onCopy={onCopy}
            last={i === entries.length - 1}
          />
        ))}
        {entries.length > 0 && (
          <div style={indent}>
            {isArray ? ']' : '}'}
            {!last && ','}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={indent} className="jt-line">
      {keyLabel}
      <Leaf
        keyName={k}
        value={value}
        path={path}
        openPath={openPath}
        setOpenPath={setOpenPath}
        onPick={onPick}
        onCopy={onCopy}
      />
      {!last && ','}
    </div>
  );
}

function Leaf({
  keyName,
  value,
  path,
  openPath,
  setOpenPath,
  onPick,
  onCopy,
}: {
  keyName: string | number | null;
  value: unknown;
  path: string;
  openPath: string | null;
  setOpenPath: (p: string | null) => void;
  onPick: (name: string, value: string) => void;
  onCopy: (value: string) => void;
}) {
  const t = useT();
  const open = openPath === path;
  const spanRef = useRef<HTMLSpanElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const defaultName = typeof keyName === 'string' ? keyName : '';
  const strVal =
    typeof value === 'string' ? value : value === null ? 'null' : String(value);

  return (
    <span className="jt-leaf-wrap">
      <span
        ref={spanRef}
        className={`jt-leaf ${leafClass(value)}`}
        title={t('pick.clickHint')}
        onClick={() => {
          setRect(spanRef.current!.getBoundingClientRect());
          setOpenPath(path);
        }}
      >
        {JSON.stringify(value)}
      </span>
      {open && rect && (
        <PickPopover
          anchorRect={rect}
          defaultName={defaultName}
          value={strVal}
          onClose={() => setOpenPath(null)}
          onCopy={() => {
            onCopy(strVal);
            setOpenPath(null);
          }}
          onSave={(name) => {
            onPick(name, strVal);
            setOpenPath(null);
          }}
        />
      )}
    </span>
  );
}

const POP_W = 240;
const POP_H = 150;

function PickPopover({
  anchorRect,
  defaultName,
  value,
  onClose,
  onCopy,
  onSave,
}: {
  anchorRect: DOMRect;
  defaultName: string;
  value: string;
  onClose: () => void;
  onCopy: () => void;
  onSave: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState(defaultName);

  // Compute screen coordinates from the clicked value. Flip upward if there is not enough space below.
  let top = anchorRect.bottom + 4;
  if (top + POP_H > window.innerHeight) {
    top = Math.max(8, anchorRect.top - POP_H - 4);
  }
  let left = anchorRect.left;
  if (left + POP_W > window.innerWidth) {
    left = Math.max(8, window.innerWidth - POP_W - 8);
  }

  // Render via a portal on body so it is not clipped by the box overflow.
  return createPortal(
    <div className="pick-popover" style={{ top, left, width: POP_W }}>
      <div className="pp-value" title={value}>
        {value.length > 60 ? value.slice(0, 60) + '…' : value}
      </div>
      <button className="pp-copy" onClick={onCopy}>
        📋 {t('pick.copy')}
      </button>
      <div className="pp-sep" />
      <div className="pp-title">{t('pick.saveVar')}</div>
      <input
        className="pp-name"
        autoFocus
        placeholder={t('pick.varName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onClose();
        }}
      />
      <div className="pp-actions">
        <button
          className="btn btn-send"
          disabled={!name.trim()}
          onClick={() => onSave(name.trim())}
        >
          {t('common.save')}
        </button>
        <button className="btn-ghost" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>,
    document.body,
  );
}

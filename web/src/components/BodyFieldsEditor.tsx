import { useEffect, useRef, useState } from 'react';
import { VarName } from '../api/client';
import { useT } from '../i18n';
import {
  BodyField,
  FieldMeta,
  FieldValue,
  parseBody,
  serializeBody,
} from '../lib/jsoncFields';
import VarField from './VarField';

interface Props {
  value: string;
  onChange: (v: string) => void;
  names: VarName[];
}

// Structured editor over the same JSONC body text (see lib/jsoncFields). Mounted only while the
// Fields view is active: parses once on mount, writes edits back as the identical annotated format
// the Raw view uses. Objects and arrays expand recursively; keys/values are editable; the include
// toggle and required/optional badge apply per field (badge only on primitive leaves).
export default function BodyFieldsEditor({ value, onChange, names }: Props) {
  const t = useT();
  const [state, setState] = useState(() => parseBody(value));
  const lastText = useRef(value);

  // Re-sync when the body changes externally (e.g. the Reload/revert button resets it), while
  // ignoring the echo of our own edits: after we emit, `value` comes back equal to lastText.
  useEffect(() => {
    if (value !== lastText.current) {
      lastText.current = value;
      setState(parseBody(value));
    }
  }, [value]);

  if (!state.ok) {
    return <div className="bf-notice">{t('req.fieldsInvalid')}</div>;
  }

  const commit = (next: BodyField[]) => {
    const text = serializeBody(next);
    lastText.current = text;
    setState({ ok: true, fields: next });
    onChange(text);
  };

  return (
    <div className="body-fields">
      <div className="bf-legend">{t('req.fieldsLegend')}</div>
      <FieldList fields={state.fields} depth={0} names={names} onChange={commit} />
    </div>
  );
}

function uniqueKey(fields: BodyField[]): string {
  const taken = new Set(fields.map((f) => f.key));
  let n = 1;
  while (taken.has(`field${n}`)) n++;
  return `field${n}`;
}

const emptyLeaf = (): FieldValue => ({ kind: 'leaf', value: '' });

/* ----------------------------- object fields ----------------------------- */

function FieldList({
  fields,
  depth,
  names,
  onChange,
}: {
  fields: BodyField[];
  depth: number;
  names: VarName[];
  onChange: (f: BodyField[]) => void;
}) {
  const t = useT();
  return (
    <div className="bf-list" style={depth ? { marginLeft: 16 } : undefined}>
      {fields.map((f, i) => (
        <FieldRow
          key={i}
          field={f}
          depth={depth}
          names={names}
          onChange={(nf) => onChange(fields.map((x, idx) => (idx === i ? nf : x)))}
          onRemove={() => onChange(fields.filter((_, idx) => idx !== i))}
        />
      ))}
      <button
        type="button"
        className="bf-add"
        onClick={() =>
          onChange([
            ...fields,
            { key: uniqueKey(fields), value: emptyLeaf(), included: true },
          ])
        }
      >
        {t('req.fieldAdd')}
      </button>
    </div>
  );
}

function FieldRow({
  field,
  depth,
  names,
  onChange,
  onRemove,
}: {
  field: BodyField;
  depth: number;
  names: VarName[];
  onChange: (f: BodyField) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const kind = field.value.kind;
  const expandable = kind === 'object' || kind === 'array';

  return (
    <div className={`bf-row${field.included ? '' : ' excluded'}`}>
      <div className="bf-line">
        <input
          type="checkbox"
          className="bf-check"
          checked={field.included}
          onChange={(e) => onChange({ ...field, included: e.target.checked })}
        />
        {expandable ? (
          <button type="button" className="bf-caret" onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="bf-caret bf-caret-spacer" />
        )}

        <input
          className="bf-keyedit"
          value={field.key}
          spellCheck={false}
          onChange={(e) => onChange({ ...field, key: e.target.value })}
        />

        <button
          type="button"
          className={`bf-badge bf-${field.meta ?? 'none'}`}
          onClick={() => onChange({ ...field, meta: nextMeta(field.meta) })}
        >
          {metaLabel(field.meta, t)}
        </button>

        <div className="bf-value">
          {kind === 'object' ? (
            <span className="bf-obj-hint">{'{ }'}</span>
          ) : kind === 'array' ? (
            <span className="bf-obj-hint">{'[ ]'}</span>
          ) : (
            <LeafInput
              value={field.value.value}
              names={names}
              onValue={(v) => onChange({ ...field, value: { kind: 'leaf', value: v } })}
            />
          )}
        </div>

        <button type="button" className="bf-del" title={t('common.delete')} onClick={onRemove}>
          ✕
        </button>
      </div>

      {open && kind === 'object' && (
        <FieldList
          fields={field.value.fields}
          depth={depth + 1}
          names={names}
          onChange={(cf) => onChange({ ...field, value: { kind: 'object', fields: cf } })}
        />
      )}
      {open && kind === 'array' && (
        <ItemList
          items={field.value.items}
          depth={depth + 1}
          names={names}
          onChange={(items) => onChange({ ...field, value: { kind: 'array', items } })}
        />
      )}
    </div>
  );
}

/* ----------------------------- array items ----------------------------- */

function ItemList({
  items,
  depth,
  names,
  onChange,
}: {
  items: FieldValue[];
  depth: number;
  names: VarName[];
  onChange: (items: FieldValue[]) => void;
}) {
  const t = useT();
  return (
    <div className="bf-list" style={{ marginLeft: 16 }}>
      {items.map((it, i) => (
        <ItemRow
          key={i}
          item={it}
          index={i}
          depth={depth}
          names={names}
          onChange={(nv) => onChange(items.map((x, idx) => (idx === i ? nv : x)))}
          onRemove={() => onChange(items.filter((_, idx) => idx !== i))}
        />
      ))}
      <button
        type="button"
        className="bf-add"
        onClick={() => onChange([...items, emptyLeaf()])}
      >
        {t('req.itemAdd')}
      </button>
    </div>
  );
}

function ItemRow({
  item,
  index,
  depth,
  names,
  onChange,
  onRemove,
}: {
  item: FieldValue;
  index: number;
  depth: number;
  names: VarName[];
  onChange: (v: FieldValue) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const kind = item.kind;
  const expandable = kind === 'object' || kind === 'array';

  return (
    <div className="bf-row">
      <div className="bf-line">
        <span className="bf-index">{index}</span>
        {expandable ? (
          <button type="button" className="bf-caret" onClick={() => setOpen((o) => !o)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="bf-caret bf-caret-spacer" />
        )}
        <div className="bf-value">
          {kind === 'object' ? (
            <span className="bf-obj-hint">{'{ }'}</span>
          ) : kind === 'array' ? (
            <span className="bf-obj-hint">{'[ ]'}</span>
          ) : (
            <LeafInput
              value={item.value}
              names={names}
              onValue={(v) => onChange({ kind: 'leaf', value: v })}
            />
          )}
        </div>
        <button type="button" className="bf-del" title={t('common.delete')} onClick={onRemove}>
          ✕
        </button>
      </div>
      {open && kind === 'object' && (
        <FieldList
          fields={item.fields}
          depth={depth + 1}
          names={names}
          onChange={(cf) => onChange({ kind: 'object', fields: cf })}
        />
      )}
      {open && kind === 'array' && (
        <ItemList
          items={item.items}
          depth={depth + 1}
          names={names}
          onChange={(items) => onChange({ kind: 'array', items })}
        />
      )}
    </div>
  );
}

/* ----------------------------- leaf value ----------------------------- */

type LeafType = 'string' | 'number' | 'boolean' | 'null';

function leafTypeOf(v: unknown): LeafType {
  if (v === null) return 'null';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

// A leaf value carries its JSON type, so the picker lets the user send an unquoted number/boolean/
// null instead of everything becoming a quoted string. Switching type coerces the current value.
function LeafInput({
  value,
  names,
  onValue,
}: {
  value: unknown;
  names: VarName[];
  onValue: (v: unknown) => void;
}) {
  const t = useT();
  const type = leafTypeOf(value);

  const changeType = (nt: LeafType) => {
    if (nt === type) return;
    if (nt === 'string') onValue(value === null ? '' : String(value));
    else if (nt === 'number') {
      const n = Number(value);
      onValue(Number.isFinite(n) ? n : 0);
    } else if (nt === 'boolean') onValue(value === true || value === 'true' || value === 1);
    else onValue(null);
  };

  return (
    <div className="bf-leaf">
      {type === 'string' ? (
        <VarField
          className="bf-input"
          value={value as string}
          names={names}
          onChange={(nv) => onValue(nv)}
        />
      ) : type === 'number' ? (
        <NumberLeaf value={value as number} onValue={onValue} />
      ) : type === 'boolean' ? (
        <select
          className="bf-input bf-bool"
          value={String(value)}
          onChange={(e) => onValue(e.target.value === 'true')}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <span className="bf-nullval">null</span>
      )}
      <select
        className="bf-type"
        title={t('req.fieldType')}
        value={type}
        onChange={(e) => changeType(e.target.value as LeafType)}
      >
        <option value="string">&quot; &quot;</option>
        <option value="number">123</option>
        <option value="boolean">T/F</option>
        <option value="null">null</option>
      </select>
    </div>
  );
}

// Numeric leaf with a local text buffer, so intermediate states ("-", "1.", "1e") can be typed
// without the model coercing them away mid-keystroke.
function NumberLeaf({ value, onValue }: { value: number; onValue: (v: unknown) => void }) {
  const [raw, setRaw] = useState(() => String(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setRaw(String(value));
    }
  }, [value]);
  return (
    <input
      className="bf-input"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        if (s.trim() === '') {
          emitted.current = 0;
          onValue(0);
          return;
        }
        const n = Number(s);
        if (Number.isFinite(n)) {
          emitted.current = n;
          onValue(n);
        }
      }}
    />
  );
}

function nextMeta(m?: FieldMeta): FieldMeta | undefined {
  return m === undefined ? 'required' : m === 'required' ? 'optional' : undefined;
}

function metaLabel(m: FieldMeta | undefined, t: (k: string) => string): string {
  return m === 'required'
    ? t('req.fieldRequired')
    : m === 'optional'
      ? t('req.fieldOptional')
      : t('req.fieldNeutral');
}

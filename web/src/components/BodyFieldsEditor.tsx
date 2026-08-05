import { useEffect, useRef, useState } from 'react';
import { VarName } from '../api/client';
import { useT } from '../i18n';
import {
  BodyField,
  FieldMeta,
  FieldValue,
  isPrimitive,
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
  const isPrim = kind === 'leaf' && isPrimitive(field.value.value);

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

        {isPrim ? (
          <button
            type="button"
            className={`bf-badge bf-${field.meta ?? 'none'}`}
            onClick={() => onChange({ ...field, meta: nextMeta(field.meta) })}
          >
            {metaLabel(field.meta, t)}
          </button>
        ) : (
          <span className="bf-badge bf-obj">{kind === 'array' ? '[ ]' : '{ }'}</span>
        )}

        <div className="bf-value">
          {kind === 'object' ? (
            <span className="bf-obj-hint">{`{ ${field.value.fields.length} }`}</span>
          ) : kind === 'array' ? (
            <span className="bf-obj-hint">{`[ ${field.value.items.length} ]`}</span>
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
            <span className="bf-obj-hint">{`{ ${item.fields.length} }`}</span>
          ) : kind === 'array' ? (
            <span className="bf-obj-hint">{`[ ${item.items.length} ]`}</span>
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

function LeafInput({
  value,
  names,
  onValue,
}: {
  value: unknown;
  names: VarName[];
  onValue: (v: unknown) => void;
}) {
  if (typeof value === 'string') {
    return (
      <VarField
        className="bf-input"
        value={value}
        names={names}
        onChange={(nv) => onValue(nv)}
      />
    );
  }
  // number / boolean / null: edit the JSON literal directly
  return (
    <input
      className="bf-input"
      value={JSON.stringify(value)}
      onChange={(e) => {
        try {
          onValue(JSON.parse(e.target.value));
        } catch {
          onValue(e.target.value);
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

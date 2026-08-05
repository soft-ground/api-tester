import { useState } from 'react';
import { VarName } from '../api/client';
import { useT } from '../i18n';
import {
  BodyField,
  FieldMeta,
  isArrayLeaf,
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
// Fields view is active, so it parses the current body once on mount and writes edits back as the
// identical annotated format the Raw view uses. Objects expand recursively; keys and values are
// editable; required/optional badge and the include toggle apply to primitive leaves.
export default function BodyFieldsEditor({ value, onChange, names }: Props) {
  const t = useT();
  const [initial] = useState(() => parseBody(value));
  const [fields, setFields] = useState<BodyField[]>(initial.fields);

  if (!initial.ok) {
    return <div className="bf-notice">{t('req.fieldsInvalid')}</div>;
  }

  const commit = (next: BodyField[]) => {
    setFields(next);
    onChange(serializeBody(next));
  };

  return (
    <div className="body-fields">
      <div className="bf-legend">{t('req.fieldsLegend')}</div>
      <FieldList fields={fields} depth={0} names={names} onChange={commit} />
    </div>
  );
}

function uniqueKey(fields: BodyField[]): string {
  const taken = new Set(fields.map((f) => f.key));
  let n = 1;
  while (taken.has(`field${n}`)) n++;
  return `field${n}`;
}

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
  const setAt = (i: number, f: BodyField) =>
    onChange(fields.map((x, idx) => (idx === i ? f : x)));
  const removeAt = (i: number) =>
    onChange(fields.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...fields,
      { key: uniqueKey(fields), value: { kind: 'leaf', value: '' }, included: true },
    ]);

  return (
    <div className="bf-list" style={depth ? { marginLeft: 16 } : undefined}>
      {fields.map((f, i) => (
        <FieldRow
          key={i}
          field={f}
          depth={depth}
          names={names}
          onChange={(nf) => setAt(i, nf)}
          onRemove={() => removeAt(i)}
        />
      ))}
      <button type="button" className="bf-add" onClick={add}>
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

  const isObj = field.value.kind === 'object';
  const isArr = isArrayLeaf(field);
  const isPrim = field.value.kind === 'leaf' && isPrimitive(field.value.value);

  return (
    <div className={`bf-row${field.included ? '' : ' excluded'}`}>
      <div className="bf-line">
        {isObj ? (
          <button
            type="button"
            className="bf-caret"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <input
            type="checkbox"
            className="bf-check"
            checked={field.included}
            disabled={!isPrim}
            title={isPrim ? '' : t('req.fieldArrHint')}
            onChange={(e) => onChange({ ...field, included: e.target.checked })}
          />
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
          <span className="bf-badge bf-obj">{isArr ? '[ ]' : '{ }'}</span>
        )}

        <div className="bf-value">
          {isObj ? (
            <span className="bf-obj-hint">{`{ ${(field.value as any).fields.length} }`}</span>
          ) : (
            <LeafInput
              value={(field.value as any).value}
              names={names}
              onValue={(v) => onChange({ ...field, value: { kind: 'leaf', value: v } })}
            />
          )}
        </div>

        <button
          type="button"
          className="bf-del"
          title={t('common.delete')}
          onClick={onRemove}
        >
          ✕
        </button>
      </div>

      {isObj && open && (
        <FieldList
          fields={(field.value as any).fields}
          depth={depth + 1}
          names={names}
          onChange={(cf) =>
            onChange({ ...field, value: { kind: 'object', fields: cf } })
          }
        />
      )}
    </div>
  );
}

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
  if (value !== null && typeof value === 'object') {
    // arrays: read-only preview, edit in Raw
    return (
      <code className="bf-obj-preview" title={t('req.fieldArrHint')}>
        {JSON.stringify(value)}
      </code>
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

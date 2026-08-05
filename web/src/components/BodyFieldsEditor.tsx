import { useState } from 'react';
import { VarName } from '../api/client';
import { useT } from '../i18n';
import {
  BodyField,
  FieldMeta,
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

// Structured editor over the same JSONC body text (see lib/jsoncFields). Mounted only while
// the Fields view is active, so it parses the current body once on mount and writes edits back
// as the identical annotated format the Raw view uses.
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
  const patch = (i: number, p: Partial<BodyField>) =>
    commit(fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)));

  const cycleMeta = (m?: FieldMeta): FieldMeta | undefined =>
    m === undefined ? 'required' : m === 'required' ? 'optional' : undefined;

  const metaLabel = (m?: FieldMeta) =>
    m === 'required'
      ? t('req.fieldRequired')
      : m === 'optional'
        ? t('req.fieldOptional')
        : t('req.fieldNeutral');

  if (fields.length === 0) {
    return <div className="bf-notice">{t('req.fieldsEmpty')}</div>;
  }

  return (
    <div className="body-fields">
      <div className="bf-legend">{t('req.fieldsLegend')}</div>
      {fields.map((f, i) => {
        const prim = isPrimitive(f.value);
        return (
          <div className={`bf-row${f.included ? '' : ' excluded'}`} key={i}>
            <input
              type="checkbox"
              className="bf-check"
              checked={f.included}
              disabled={!prim}
              title={prim ? '' : t('req.fieldObjHint')}
              onChange={(e) => patch(i, { included: e.target.checked })}
            />
            <span className="bf-key" title={f.key}>
              {f.key}
            </span>
            {prim ? (
              <button
                type="button"
                className={`bf-badge bf-${f.meta ?? 'none'}`}
                onClick={() => patch(i, { meta: cycleMeta(f.meta) })}
              >
                {metaLabel(f.meta)}
              </button>
            ) : (
              <span className="bf-badge bf-obj" title={t('req.fieldObjHint')}>
                {Array.isArray(f.value) ? '[ ]' : '{ }'}
              </span>
            )}
            <div className="bf-value">
              <ValueInput
                field={f}
                names={names}
                onValue={(v) => patch(i, { value: v })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ValueInput({
  field,
  names,
  onValue,
}: {
  field: BodyField;
  names: VarName[];
  onValue: (v: unknown) => void;
}) {
  const v = field.value;

  if (typeof v === 'string') {
    return (
      <VarField
        className="bf-input"
        value={v}
        names={names}
        onChange={(nv) => onValue(nv)}
      />
    );
  }
  if (v !== null && typeof v === 'object') {
    // Objects/arrays are shown read-only here; edit them in the Raw view.
    return <code className="bf-obj-preview">{JSON.stringify(v)}</code>;
  }
  // number / boolean / null: edit the JSON literal directly.
  return (
    <input
      className="bf-input"
      value={JSON.stringify(v)}
      onChange={(e) => {
        const raw = e.target.value;
        try {
          onValue(JSON.parse(raw));
        } catch {
          onValue(raw);
        }
      }}
    />
  );
}

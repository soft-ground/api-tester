import { KeyValue, VarName } from '../api/client';
import { useT } from '../i18n';
import VarField from './VarField';

interface Props {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  names?: VarName[];
}

// key-value table for editing headers / query parameters
export default function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  names = [],
}: Props) {
  const t = useT();
  const update = (i: number, patch: Partial<KeyValue>) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...rows, { key: '', value: '', enabled: true }]);

  return (
    <div className="kv-editor">
      {rows.length === 0 && <div className="kv-empty">{t('kv.empty')}</div>}
      {rows.map((row, i) => (
        <div className="kv-row" key={i}>
          <input
            type="checkbox"
            checked={row.enabled}
            onChange={(e) => update(i, { enabled: e.target.checked })}
            title={t('kv.enabledTitle')}
          />
          <input
            className="kv-key"
            placeholder={keyPlaceholder}
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <div className="kv-value-wrap">
            <VarField
              className="kv-value"
              placeholder={valuePlaceholder}
              value={row.value}
              names={names}
              onChange={(v) => update(i, { value: v })}
            />
          </div>
          <button
            className="kv-del"
            onClick={() => remove(i)}
            title={t('common.delete')}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="btn-ghost kv-add" onClick={add}>
        {t('kv.addRow')}
      </button>
    </div>
  );
}

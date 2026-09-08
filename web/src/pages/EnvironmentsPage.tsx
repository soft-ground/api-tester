import { useEffect, useState } from 'react';
import {
  Environment,
  VariableRule,
  VariableType,
  activateEnvironment,
  createEnvironment,
  createRule,
  deleteEnvironment,
  deleteRule,
  listEnvironments,
  listRules,
  previewRule,
  reorderEnvironments,
  reorderRules,
  updateEnvironment,
  updateRule,
} from '../api/client';
import { useDialog } from '../components/DialogProvider';
import { useT } from '../i18n';

// Move an array item from one position to another
function move<T>(arr: T[], from: number, to: number): T[] {
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Compute the display order (a list of indices into `rows`) for the variables list. Display-only —
// the DB stores variables as a JSON object, so this never changes what is saved. Empty-key rows sink
// to the bottom. This is a *snapshot*: it is recomputed only at commit points (select / sort change /
// add / delete / save), never on every keystroke, so typing a key does not make its row jump — the
// re-sort happens when the user saves.
function orderRows(rows: [string, string][], sort: 'default' | 'asc' | 'desc'): number[] {
  const idx = rows.map((_, i) => i);
  if (sort === 'default') return idx;
  return idx.sort((a, b) => {
    const ak = rows[a][0];
    const bk = rows[b][0];
    if (!ak || !bk) return !ak && !bk ? 0 : ak ? -1 : 1; // empty keys sink to the bottom
    const cmp = ak.localeCompare(bk, undefined, { numeric: true, sensitivity: 'base' });
    return sort === 'asc' ? cmp : -cmp;
  });
}

export default function EnvironmentsPage() {
  return (
    <div className="env-page">
      <EnvironmentsSection />
      <VariableRulesSection />
    </div>
  );
}

/* ===================== Environments ===================== */

function EnvironmentsSection() {
  const t = useT();
  const { confirm, prompt } = useDialog();
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [selected, setSelected] = useState<Environment | null>(null);
  const [rows, setRows] = useState<[string, string][]>([]);
  // `order` is the visible row sequence (indices into `rows`), frozen while editing so rows don't
  // jump as the user types. It is recomputed only on select / sort change / add / delete / save.
  const [order, setOrder] = useState<number[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Display-only ordering for the variables list (the DB order is unchanged). "asc"/"desc" sort by
  // key with locale-aware collation so multilingual keys order naturally. Edits target the original
  // row index; newly-added rows stay at the bottom until the next save.
  const [varSort, setVarSort] = useState<'default' | 'asc' | 'desc'>(() => {
    const s = localStorage.getItem('envVarSort');
    return s === 'asc' || s === 'desc' ? s : 'default';
  });
  useEffect(() => localStorage.setItem('envVarSort', varSort), [varSort]);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 1800);
  };

  const refresh = async () => setEnvs(await listEnvironments());
  useEffect(() => {
    refresh();
  }, []);

  const onDrop = async (to: number) => {
    if (dragIdx === null || dragIdx === to) return setDragIdx(null);
    const next = move(envs, dragIdx, to);
    setEnvs(next);
    setDragIdx(null);
    await reorderEnvironments(next.map((e) => e.id));
  };

  // Re-read from the DB on (re)selection, so variables saved in another window/tab show up here
  // (this view does not auto-refresh, but switching the selected environment reloads it).
  const select = async (env: Environment) => {
    const fresh = await listEnvironments();
    setEnvs(fresh);
    const cur = fresh.find((e) => e.id === env.id) ?? env;
    const entries = Object.entries(cur.variables ?? {});
    setSelected(cur);
    setRows(entries);
    setOrder(orderRows(entries, varSort));
  };

  const add = async () => {
    const name = await prompt({ message: t('env.namePrompt') });
    if (!name) return;
    const env = await createEnvironment({ name, variables: {} });
    await select(env); // select re-reads the list (which now includes the new env)
  };

  const save = async () => {
    if (!selected) return;
    const variables: Record<string, string> = {};
    rows.forEach(([k, v]) => {
      if (k) variables[k] = v;
    });
    const saved = await updateEnvironment(selected.id, {
      name: selected.name,
      variables,
    });
    // Commit point: reload the (empty-key-stripped) rows and re-apply the sort now, so variables
    // added/renamed during this edit settle into their sorted position only after Save.
    const entries = Object.entries(variables);
    setSelected(saved);
    setRows(entries);
    setOrder(orderRows(entries, varSort));
    refresh();
    flash(t('req.saved'));
  };

  const activate = async (id: string) => {
    await activateEnvironment(id);
    refresh();
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: t('env.deleteConfirm'), tone: 'warn' })))
      return;
    await deleteEnvironment(id);
    if (selected?.id === id) setSelected(null);
    refresh();
  };

  return (
    <section className="env-section">
      <div className="section-head">
        <h2>{t('env.title')}</h2>
        <button className="btn-ghost" onClick={add}>
          {t('env.add')}
        </button>
      </div>
      <p className="section-hint">
        {t('env.hint.1')}
        <code>{t('env.hint.code')}</code>
        {t('env.hint.2')}
        <code>{t('env.hint.code2')}</code>
        {t('env.hint.3')}
      </p>

      <div className="env-body">
        <div className="env-list">
          {envs.length === 0 && (
            <div className="tree-empty">{t('env.none')}</div>
          )}
          {envs.map((env, i) => (
            <div
              key={env.id}
              className={
                selected?.id === env.id ? 'env-row active' : 'env-row'
              }
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              onClick={() => select(env)}
            >
              <span className="grip" title={t('common.dragReorder')}>
                ⠿
              </span>
              {env.isShared ? (
                <span
                  className="shared-tag"
                  title={t('env.sharedTitle')}
                >
                  {t('env.shared')}
                </span>
              ) : (
                <input
                  type="radio"
                  checked={env.isActive}
                  onChange={() => activate(env.id)}
                  onClick={(e) => e.stopPropagation()}
                  title={t('env.activeTitle')}
                />
              )}
              <span className="env-name">
                {env.isShared ? t('env.extractGroupName') : env.name}
              </span>
              {env.isActive && !env.isShared && (
                <span className="active-tag">{t('env.active')}</span>
              )}
              <button
                className="mini"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(env.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="env-editor">
          {!selected ? (
            <div className="builder-empty">{t('env.selectEnv')}</div>
          ) : (
            <>
              <input
                className="req-name"
                value={selected.name}
                onChange={(e) =>
                  setSelected({ ...selected, name: e.target.value })
                }
              />
              <div className="obj-editor-head">
                <span className="obj-editor-title">{t('env.varsTitle')}</span>
                <select
                  className="var-sort"
                  value={varSort}
                  onChange={(e) => {
                    const s = e.target.value as 'default' | 'asc' | 'desc';
                    setVarSort(s);
                    setOrder(orderRows(rows, s));
                  }}
                  title={t('env.sortTitle')}
                >
                  <option value="default">{t('env.sortDefault')}</option>
                  <option value="asc">{t('env.sortAsc')}</option>
                  <option value="desc">{t('env.sortDesc')}</option>
                </select>
              </div>
              <div className="obj-editor">
                {order.map((i) => {
                  const row = rows[i];
                  if (!row) return null;
                  const [k, v] = row;
                  return (
                    <div className="kv-row" key={i}>
                      <input
                        className="kv-key"
                        placeholder={t('env.varNamePh')}
                        value={k}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = [e.target.value, v];
                          setRows(next);
                        }}
                      />
                      <input
                        className="kv-value"
                        placeholder={t('env.varValuePh')}
                        value={v}
                        onChange={(e) => {
                          const next = [...rows];
                          next[i] = [k, e.target.value];
                          setRows(next);
                        }}
                      />
                      <button
                        className="kv-del"
                        onClick={() => {
                          setRows(rows.filter((_, idx) => idx !== i));
                          // Drop this index from the order and shift the higher ones down by one.
                          setOrder(
                            order
                              .filter((idx) => idx !== i)
                              .map((idx) => (idx > i ? idx - 1 : idx)),
                          );
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <button
                  className="btn-ghost kv-add"
                  onClick={() => {
                    // Append at the bottom and keep it there until the next save (no live re-sort).
                    setOrder([...order, rows.length]);
                    setRows([...rows, ['', '']]);
                  }}
                >
                  {t('env.addVar')}
                </button>
              </div>
              <button className="btn" onClick={save}>
                {t('common.save')}
              </button>
            </>
          )}
        </div>
      </div>
      {note && <div className="toast">{note}</div>}
    </section>
  );
}

/* ===================== Dynamic value rules ===================== */

const TYPES: VariableType[] = [
  'fixed',
  'sequence',
  'expression',
  'timestamp',
  'uuid',
  'random',
];

function VariableRulesSection() {
  const t = useT();
  const { confirm, prompt, alert } = useDialog();
  const [rules, setRules] = useState<VariableRule[]>([]);
  const [selected, setSelected] = useState<VariableRule | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 1800);
  };

  const refresh = async () => setRules(await listRules());
  useEffect(() => {
    refresh();
  }, []);

  const onDrop = async (to: number) => {
    if (dragIdx === null || dragIdx === to) return setDragIdx(null);
    const next = move(rules, dragIdx, to);
    setRules(next);
    setDragIdx(null);
    await reorderRules(next.map((r) => r.id));
  };

  const add = async () => {
    const name = await prompt({ message: t('env.varNamePrompt') });
    if (!name) return;
    const rule = await createRule({ name, type: 'fixed', config: {} });
    await refresh();
    setSelected(rule);
    setPreview('');
  };

  const patchCfg = (cfg: Record<string, any>) => {
    if (!selected) return;
    setSelected({ ...selected, config: { ...selected.config, ...cfg } });
  };

  const save = async () => {
    if (!selected) return;
    const saved = await updateRule(selected.id, {
      name: selected.name,
      type: selected.type,
      config: selected.config,
    });
    setSelected(saved);
    refresh();
    flash(t('req.saved'));
  };

  const doPreview = async () => {
    if (!selected) return;
    const { value } = await previewRule({
      type: selected.type,
      config: selected.config,
    });
    setPreview(value);
  };

  const resetSeq = async () => {
    if (!selected) return;
    const saved = await updateRule(selected.id, { state: {} });
    setSelected(saved);
    await alert(t('env.seqReset'));
  };

  const remove = async (id: string) => {
    if (!(await confirm({ message: t('env.deleteRule'), tone: 'warn' }))) return;
    await deleteRule(id);
    if (selected?.id === id) setSelected(null);
    refresh();
  };

  return (
    <section className="rules-section">
      <div className="section-head">
        <h2>{t('env.rulesTitle')}</h2>
        <button className="btn-ghost" onClick={add}>
          {t('env.addRule')}
        </button>
      </div>
      <p className="section-hint">
        {t('env.rulesHint.1')}
        <code>{t('env.rulesHint.code')}</code>
        {t('env.rulesHint.2')}
      </p>

      <div className="env-body">
        <div className="env-list">
          {rules.length === 0 && (
            <div className="tree-empty">{t('env.ruleNone')}</div>
          )}
          {rules.map((rule, i) => (
            <div
              key={rule.id}
              className={
                selected?.id === rule.id ? 'env-row active' : 'env-row'
              }
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(i)}
              onClick={() => {
                setSelected(rule);
                setPreview('');
              }}
            >
              <span className="grip" title={t('common.dragReorder')}>
                ⠿
              </span>
              <span className="rule-type">{rule.type}</span>
              <span className="env-name">{rule.name}</span>
              <button
                className="mini"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(rule.id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="env-editor">
          {!selected ? (
            <div className="builder-empty">{t('env.selectRule')}</div>
          ) : (
            <>
              <div className="rule-name-row">
                <input
                  className="req-name"
                  value={selected.name}
                  onChange={(e) =>
                    setSelected({ ...selected, name: e.target.value })
                  }
                />
                <select
                  value={selected.type}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      type: e.target.value as VariableType,
                    })
                  }
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <RuleConfigEditor rule={selected} onChange={patchCfg} />

              <label className="rule-peruse">
                <input
                  type="checkbox"
                  checked={!!(selected.config as any)?.perUse}
                  onChange={(e) => patchCfg({ perUse: e.target.checked })}
                />
                <span>
                  {t('env.rule.perUse')}
                  <em>{t('env.rule.perUseHint')}</em>
                </span>
              </label>

              <div className="rule-actions">
                <button className="btn" onClick={save}>
                  {t('common.save')}
                </button>
                <button className="btn-ghost" onClick={doPreview}>
                  {t('common.preview')}
                </button>
                {selected.type === 'sequence' && (
                  <button className="btn-ghost" onClick={resetSeq}>
                    {t('env.seqResetBtn')}
                  </button>
                )}
                {preview !== '' && (
                  <span className="preview-val">→ {preview}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {note && <div className="toast">{note}</div>}
    </section>
  );
}

function RuleConfigEditor({
  rule,
  onChange,
}: {
  rule: VariableRule;
  onChange: (cfg: Record<string, any>) => void;
}) {
  const t = useT();
  const c = rule.config ?? {};
  const numOr = (v: any, d: number) => (v === undefined || v === '' ? d : v);

  switch (rule.type) {
    case 'fixed':
      return (
        <input
          className="auth-input"
          placeholder={t('env.rule.fixedPh')}
          value={c.value ?? ''}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );

    case 'sequence':
      return (
        <div className="cfg-grid">
          <label>
            {t('env.rule.start')}
            <input
              type="number"
              value={numOr(c.start, 1)}
              onChange={(e) => onChange({ start: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('env.rule.step')}
            <input
              type="number"
              value={numOr(c.step, 1)}
              onChange={(e) => onChange({ step: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('env.rule.pad')}
            <input
              type="number"
              value={numOr(c.pad, 0)}
              onChange={(e) => onChange({ pad: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('env.rule.prefix')}
            <input
              value={c.prefix ?? ''}
              onChange={(e) => onChange({ prefix: e.target.value })}
            />
          </label>
        </div>
      );

    case 'expression':
      return (
        <div>
          <textarea
            className="body-textarea"
            placeholder={'concat("ORD", now("yyyyMMdd"), seq)'}
            value={c.expr ?? ''}
            onChange={(e) => onChange({ expr: e.target.value })}
          />
          <p className="section-hint">
            {t('env.rule.exprHint1')}
            <code>now(fmt)</code> <code>pad(v,len)</code>{' '}
            <code>concat(...)</code> <code>upper/lower</code>{' '}
            <code>uuid()</code> <code>randomInt(min,max)</code>.{' '}
            {t('env.rule.exprHint2')}
            <code>seq</code>).
          </p>
        </div>
      );

    case 'timestamp':
      return (
        <input
          className="auth-input"
          placeholder="iso | epoch | epochSec | yyyyMMdd"
          value={c.format ?? ''}
          onChange={(e) => onChange({ format: e.target.value })}
        />
      );

    case 'uuid':
      return <p className="section-hint">{t('env.rule.uuidHint')}</p>;

    case 'random':
      return (
        <div className="cfg-grid">
          <label>
            {t('env.rule.kind')}
            <select
              value={c.type ?? 'int'}
              onChange={(e) => onChange({ type: e.target.value })}
            >
              <option value="int">{t('env.rule.int')}</option>
              <option value="hex">{t('env.rule.hexStr')}</option>
            </select>
          </label>
          {c.type === 'hex' ? (
            <label>
              {t('env.rule.length')}
              <input
                type="number"
                value={numOr(c.length, 8)}
                onChange={(e) => onChange({ length: Number(e.target.value) })}
              />
            </label>
          ) : (
            <>
              <label>
                {t('env.rule.min')}
                <input
                  type="number"
                  value={numOr(c.min, 0)}
                  onChange={(e) => onChange({ min: Number(e.target.value) })}
                />
              </label>
              <label>
                {t('env.rule.max')}
                <input
                  type="number"
                  value={numOr(c.max, 100)}
                  onChange={(e) => onChange({ max: Number(e.target.value) })}
                />
              </label>
            </>
          )}
        </div>
      );

    default:
      return null;
  }
}

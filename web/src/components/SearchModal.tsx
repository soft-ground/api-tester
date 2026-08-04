import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchResults, search } from '../api/client';
import { useT } from '../i18n';

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<SearchResults | null>(null);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) return setRes(null);
      setRes(await search(q));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const go = (to: string) => {
    onClose();
    nav(to);
  };

  const total =
    (res?.endpoints.length ?? 0) +
    (res?.scenarios.length ?? 0) +
    (res?.history.length ?? 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal search-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="search-input"
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />

        <div className="search-results">
          {q.trim() && total === 0 && (
            <div className="tree-empty">{t('search.empty')}</div>
          )}

          {res && res.endpoints.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">API ({res.endpoints.length})</div>
              {res.endpoints.map((e) => (
                <div
                  key={e.id}
                  className="search-item"
                  onClick={() => go(`/collections?select=${e.id}`)}
                >
                  <span className={`m-badge m-${e.method}`}>{e.method}</span>
                  <span className="search-item-name">{e.name}</span>
                  <span className="search-item-sub">
                    {e.collection?.name ? `${e.collection.name} · ` : ''}
                    {e.path}
                  </span>
                </div>
              ))}
            </div>
          )}

          {res && res.scenarios.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">
                {t('nav.scenarios')} ({res.scenarios.length})
              </div>
              {res.scenarios.map((s) => (
                <div
                  key={s.id}
                  className="search-item"
                  onClick={() => go('/scenarios')}
                >
                  <span className="search-item-name">{s.name}</span>
                </div>
              ))}
            </div>
          )}

          {res && res.history.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">
                {t('nav.history')} ({res.history.length})
              </div>
              {res.history.map((h) => (
                <div
                  key={h.id}
                  className="search-item"
                  onClick={() => go('/history')}
                >
                  <span className={`m-badge m-${h.reqMethod}`}>
                    {h.reqMethod}
                  </span>
                  <span className="search-item-name">{h.reqUrl}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="search-foot">
          <span className="section-hint">{t('search.escHint')}</span>
        </div>
      </div>
    </div>
  );
}

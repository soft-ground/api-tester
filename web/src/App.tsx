import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import HealthBadge from './components/HealthBadge';
import SearchModal from './components/SearchModal';
import CollectionsPage from './pages/CollectionsPage';
import HistoryPage from './pages/HistoryPage';
import ScenariosPage from './pages/ScenariosPage';
import EnvironmentsPage from './pages/EnvironmentsPage';
import { useI18n } from './i18n';
import { LANGS } from './i18n/translations';

const NAV = [
  { to: '/collections', key: 'nav.collections', icon: '📁' },
  { to: '/history', key: 'nav.history', icon: '🕘' },
  { to: '/scenarios', key: 'nav.scenarios', icon: '🧪' },
  { to: '/environments', key: 'nav.environments', icon: '🔧' },
];

type Layout = 'sidebar' | 'header';

function NavItems({ collapsed }: { collapsed?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
          title={collapsed ? t(n.key) : undefined}
        >
          <span className="nav-icon">{n.icon}</span>
          <span className="nav-label">{t(n.key)}</span>
        </NavLink>
      ))}
    </>
  );
}

function LangSelect() {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      className="lang-select"
      value={lang}
      onChange={(e) => setLang(e.target.value as any)}
      title={t('shell.language')}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

export default function App() {
  const { t } = useI18n();
  const [layout, setLayout] = useState<Layout>(
    () => (localStorage.getItem('navLayout') as Layout) || 'sidebar',
  );
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('navCollapsed') === '1',
  );
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => localStorage.setItem('navLayout', layout), [layout]);
  useEffect(
    () => localStorage.setItem('navCollapsed', collapsed ? '1' : '0'),
    [collapsed],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchModal = showSearch && (
    <SearchModal onClose={() => setShowSearch(false)} />
  );

  const pages = (
    <Routes>
      <Route path="/" element={<Navigate to="/collections" replace />} />
      <Route path="/collections" element={<CollectionsPage />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/scenarios" element={<ScenariosPage />} />
      <Route path="/environments" element={<EnvironmentsPage />} />
    </Routes>
  );

  if (layout === 'header') {
    return (
      <div className="app layout-header">
        <header className="topbar">
          <div className="brand">{t('brand')}</div>
          <nav className="topnav">
            <NavItems />
          </nav>
          <div className="topbar-right">
            <LangSelect />
            <button
              className="search-trigger"
              onClick={() => setShowSearch(true)}
              title={t('shell.searchTitle')}
            >
              {t('shell.search')}
            </button>
            <HealthBadge />
            <button
              className="icon-btn"
              title={t('shell.toSidebar')}
              onClick={() => setLayout('sidebar')}
            >
              ▤
            </button>
          </div>
        </header>
        <main className="content">{pages}</main>
        {searchModal}
      </div>
    );
  }

  return (
    <div className={`app layout-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-top">
          {!collapsed && <div className="brand">{t('brand')}</div>}
          <button
            className="icon-btn"
            title={collapsed ? t('shell.expand') : t('shell.collapse')}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <button
          className="search-trigger sidebar-search"
          onClick={() => setShowSearch(true)}
          title={t('shell.searchTitle')}
        >
          🔍{!collapsed && ` ${t('shell.search').replace('🔍 ', '')}`}
        </button>
        <nav>
          <NavItems collapsed={collapsed} />
        </nav>
        <div className="sidebar-footer">
          {!collapsed && <LangSelect />}
          <HealthBadge />
          {!collapsed && (
            <button
              className="switch-layout"
              title={t('shell.toHeader')}
              onClick={() => setLayout('header')}
            >
              {t('shell.toHeaderBtn')}
            </button>
          )}
        </div>
      </aside>
      <main className="content">{pages}</main>
      {searchModal}
    </div>
  );
}

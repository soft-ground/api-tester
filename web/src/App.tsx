import { useEffect, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import HealthBadge from './components/HealthBadge';
import SearchModal from './components/SearchModal';
import CollectionsPage from './pages/CollectionsPage';
import HistoryPage from './pages/HistoryPage';
import ScenariosPage from './pages/ScenariosPage';
import EnvironmentsPage from './pages/EnvironmentsPage';
import JsonToolPage from './pages/JsonToolPage';
import { useI18n } from './i18n';
import { LANGS } from './i18n/translations';

const NAV = [
  { to: '/collections', key: 'nav.collections', icon: '📁' },
  { to: '/history', key: 'nav.history', icon: '🕘' },
  { to: '/scenarios', key: 'nav.scenarios', icon: '🧪' },
  { to: '/environments', key: 'nav.environments', icon: '🔧' },
  { to: '/json-tools', key: 'nav.jsonTools', icon: '📊' },
];

type Layout = 'sidebar' | 'header';
type Theme = 'dark' | 'light';

function initialTheme(): Theme {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

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

// Catch-all for unknown client-side routes (nginx already falls back to index.html for deep links).
function NotFound() {
  const { t } = useI18n();
  const loc = useLocation();
  return (
    <div className="not-found">
      <div className="nf-code">404</div>
      <p className="nf-msg">{t('shell.notFound')}</p>
      <code className="nf-path">{loc.pathname}</code>
      <Link className="btn" to="/collections">
        {t('shell.notFoundHome')}
      </Link>
    </div>
  );
}

// Top-left logo + wordmark, acting as a home link to the default view. When the sidebar is collapsed
// only the logo shows, so the collapsed rail still has an identity anchor.
function Brand({ collapsed }: { collapsed?: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      className={`brand${collapsed ? ' brand-collapsed' : ''}`}
      to="/collections"
      title={t('brand')}
    >
      <img className="brand-logo" src="/favicon.svg" alt="" width={22} height={22} />
      {!collapsed && <span className="brand-name">{t('brand')}</span>}
    </Link>
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
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => localStorage.setItem('navLayout', layout), [layout]);
  useEffect(
    () => localStorage.setItem('navCollapsed', collapsed ? '1' : '0'),
    [collapsed],
  );
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const themeToggle = (
    <button
      className="icon-btn theme-toggle"
      title={t('shell.theme')}
      aria-label={t('shell.theme')}
      onClick={() => setTheme((th) => (th === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
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
      <Route path="/json-tools" element={<JsonToolPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );

  if (layout === 'header') {
    return (
      <div className="app layout-header">
        <header className="topbar">
          <Brand />
          <nav className="topnav">
            <NavItems />
          </nav>
          <div className="topbar-right">
            <LangSelect />
            {themeToggle}
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
          <Brand collapsed={collapsed} />
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
          {themeToggle}
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

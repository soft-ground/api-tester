// Application menu. Electron's default menu is built for Electron's own docs: in a packaged app its
// Help menu is deliberately EMPTY (Windows shows "(Empty)"), and View exposes Reload / Force Reload
// / Toggle Developer Tools to end users. We replace it with a small menu that points at things
// that are actually useful for this app. Dev-only items (reload, dev tools) return only when the
// app is not packaged.
import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';

const REPO_URL = 'https://github.com/soft-ground/api-tester';

type Lang = 'ko' | 'en';

// Same rule as the loading screen and the web app's i18n: English OS locale -> English, else Korean.
function detectLang(locale: string): Lang {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'ko';
}

const STRINGS: Record<Lang, Record<string, string>> = {
  ko: {
    file: '파일',
    quit: '종료',
    close: '닫기',
    edit: '편집',
    undo: '실행 취소',
    redo: '다시 실행',
    cut: '잘라내기',
    copy: '복사',
    paste: '붙여넣기',
    selectAll: '모두 선택',
    view: '보기',
    reload: '새로고침',
    forceReload: '강제 새로고침',
    devTools: '개발자 도구',
    actualSize: '실제 크기',
    zoomIn: '확대',
    zoomOut: '축소',
    fullscreen: '전체 화면',
    window: '창',
    minimize: '최소화',
    help: '도움말',
    openLogs: '로그 폴더 열기',
    releases: '릴리스 / 새 버전 확인',
    repo: 'GitHub 저장소',
    issues: '문제 신고',
    discussions: '질문 / 토론',
    privacy: '개인정보 처리방침',
    applyUpdate: '업데이트 v{version} 적용 (재시작)',
  },
  en: {
    file: 'File',
    quit: 'Exit',
    close: 'Close',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    forceReload: 'Force Reload',
    devTools: 'Toggle Developer Tools',
    actualSize: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullscreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    help: 'Help',
    openLogs: 'Open Logs Folder',
    releases: 'Releases / Check for Updates',
    repo: 'GitHub Repository',
    issues: 'Report an Issue',
    discussions: 'Questions / Discussions',
    privacy: 'Privacy Policy',
    applyUpdate: 'Apply Update v{version} (Restart)',
  },
};

export interface MenuOptions {
  lang: Lang;
  isMac: boolean;
  // Show reload / developer tools (development only).
  dev: boolean;
  version: string;
  logsDir: string;
  releasesUrl: string;
  // Set only once an update has been downloaded and is waiting for a restart (Windows).
  update: { version: string; restart: () => void } | null;
}

// Pure (no Electron calls at build time) so the shape can be checked without launching the app.
export function buildMenuTemplate(o: MenuOptions): MenuItemConstructorOptions[] {
  const s = STRINGS[o.lang];
  const open = (url: string) => () => void shell.openExternal(url);

  const viewItems: MenuItemConstructorOptions[] = [
    ...(o.dev
      ? ([
          { role: 'reload', label: s.reload },
          { role: 'forceReload', label: s.forceReload },
          { role: 'toggleDevTools', label: s.devTools },
          { type: 'separator' },
        ] as MenuItemConstructorOptions[])
      : []),
    { role: 'resetZoom', label: s.actualSize },
    { role: 'zoomIn', label: s.zoomIn },
    { role: 'zoomOut', label: s.zoomOut },
    { type: 'separator' },
    { role: 'togglefullscreen', label: s.fullscreen },
  ];

  return [
    ...(o.isMac ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[]) : []),
    {
      label: s.file,
      submenu: [o.isMac ? { role: 'close', label: s.close } : { role: 'quit', label: s.quit }],
    },
    {
      label: s.edit,
      submenu: [
        { role: 'undo', label: s.undo },
        { role: 'redo', label: s.redo },
        { type: 'separator' },
        { role: 'cut', label: s.cut },
        { role: 'copy', label: s.copy },
        { role: 'paste', label: s.paste },
        { role: 'selectAll', label: s.selectAll },
      ],
    },
    { label: s.view, submenu: viewItems },
    {
      label: s.window,
      submenu: [
        { role: 'minimize', label: s.minimize },
        { role: 'close', label: s.close },
      ],
    },
    {
      label: s.help,
      role: 'help',
      submenu: [
        ...(o.update
          ? ([
              {
                label: s.applyUpdate.replace('{version}', o.update.version),
                click: o.update.restart,
              },
              { type: 'separator' },
            ] as MenuItemConstructorOptions[])
          : []),
        { label: s.openLogs, click: () => void shell.openPath(o.logsDir) },
        { label: s.releases, click: open(o.releasesUrl) },
        { type: 'separator' },
        { label: s.repo, click: open(REPO_URL) },
        { label: s.issues, click: open(`${REPO_URL}/issues`) },
        { label: s.discussions, click: open(`${REPO_URL}/discussions`) },
        { label: s.privacy, click: open(`${REPO_URL}/blob/main/PRIVACY.md`) },
        { type: 'separator' },
        { label: `API Tester v${o.version}`, enabled: false },
      ],
    },
  ];
}

export function installAppMenu(
  opts: Pick<MenuOptions, 'logsDir' | 'releasesUrl' | 'update'>,
): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate({
        lang: detectLang(app.getLocale()),
        isMac: process.platform === 'darwin',
        dev: !app.isPackaged,
        version: app.getVersion(),
        ...opts,
      }),
    ),
  );
}

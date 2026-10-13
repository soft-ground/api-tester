// Bridge exposed by desktop/src/preload.ts when this app is running inside the Electron
// desktop build. Absent in the Docker/browser build — always feature-detect with `?.`.
export interface DesktopUpdateStatus {
  // 'ready': downloaded and installs on restart (Windows only). 'manual': a newer version
  // exists but this platform (macOS/Linux) can't self-install it — link to the releases page.
  status: 'ready' | 'manual';
  version: string;
}

export interface DesktopBridge {
  isDesktop: true;
  onUpdateStatus: (cb: (s: DesktopUpdateStatus) => void) => () => void;
  // Current status (or null): the shell's 'update:status' event fires only once.
  getUpdateStatus: () => Promise<DesktopUpdateStatus | null>;
  restartToUpdate: () => void;
  openReleasesPage: () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

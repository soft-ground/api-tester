// Preload runs in an isolated context with access to a limited Node surface. Keep the
// bridge minimal — expose only what each renderer genuinely needs.
//
// Two different pages load this same preload: the local loading screen (uses `window.boot`
// while the backend starts up) and the real web app once it's healthy (uses `window.desktop`,
// unchanged and otherwise talking to the local server over http).
import { contextBridge, ipcRenderer } from 'electron';

interface BootStatus {
  stage: 'db' | 'migrate' | 'server' | 'retry';
}
interface BootError {
  message: string;
}
interface UpdateStatus {
  // 'ready': downloaded and installs on restart (Windows only — see main.ts).
  // 'manual': a newer version exists but this platform can't self-install it; point the user
  // at the releases page (macOS needs a signed .zip we don't publish; Linux's .deb path would
  // pop a sudo/polkit prompt, which is the opposite of the quiet update this app aims for).
  status: 'ready' | 'manual';
  version: string;
}

contextBridge.exposeInMainWorld('boot', {
  onStatus: (cb: (s: BootStatus) => void) => {
    const listener = (_e: unknown, payload: BootStatus) => cb(payload);
    ipcRenderer.on('boot:status', listener);
    return () => ipcRenderer.removeListener('boot:status', listener);
  },
  onError: (cb: (e: BootError) => void) => {
    const listener = (_e: unknown, payload: BootError) => cb(payload);
    ipcRenderer.on('boot:error', listener);
    return () => ipcRenderer.removeListener('boot:error', listener);
  },
  retry: () => ipcRenderer.send('boot:retry'),
  openLogs: () => ipcRenderer.send('boot:open-logs'),
  quit: () => ipcRenderer.send('boot:quit'),
});

contextBridge.exposeInMainWorld('desktop', {
  // Marker the web app can feature-detect if it ever needs desktop-only behavior.
  isDesktop: true,
  onUpdateStatus: (cb: (s: UpdateStatus) => void) => {
    const listener = (_e: unknown, payload: UpdateStatus) => cb(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  restartToUpdate: () => ipcRenderer.send('update:restart'),
  openReleasesPage: () => ipcRenderer.send('update:open-releases'),
});

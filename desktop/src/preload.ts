// Preload runs in an isolated context with access to a limited Node surface. Keep the
// bridge minimal — expose only what the renderer genuinely needs. For now the web app is
// unchanged and talks to the local server over http, so nothing is required here yet.
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('desktop', {
  // Marker the web app can feature-detect if it ever needs desktop-only behavior.
  isDesktop: true,
});

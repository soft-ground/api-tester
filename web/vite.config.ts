import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// In the local dev server (vite), proxy /api requests to the Docker server (host 8472).
// In the Docker deployment, nginx proxies /api to server:3000.
export default defineConfig({
  plugins: [react()],
  // Shown next to the brand when not running inside the desktop shell (which reports its own version).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8472',
        changeOrigin: true,
      },
    },
  },
});

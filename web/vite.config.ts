import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In the local dev server (vite), proxy /api requests to the Docker server (host 8472).
// In the Docker deployment, nginx proxies /api to server:3000.
export default defineConfig({
  plugins: [react()],
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

// tsc only compiles src/**/*.ts; copy the plain static assets it serves as-is into dist/ so
// dist/ stays the single self-contained tree that both `electron .` and electron-builder's
// `files: [dist/**/*]` expect.
import { copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(here, '..');

for (const file of ['loading.html', 'loading.js']) {
  copyFileSync(join(desktopDir, 'src', file), join(desktopDir, 'dist', file));
}

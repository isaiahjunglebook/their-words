// Vercel build step. The whole site is password-gated (DECISIONS.md A5), so
// the static bundle must contain NO quote data: the canon is served only via
// the authenticated /api/canon endpoint. This script exists to enforce that —
// it removes any stray canon copy from public/ before deploy.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const stray = path.join(root, 'public', 'their-words.json');
if (fs.existsSync(stray)) {
  fs.rmSync(stray);
  console.log('Removed stray canon copy from public/');
} else {
  console.log('Static bundle is clean (no canon data).');
}

// Vercel build step: copy the committed canon JSON (repo root = source of
// truth) into public/ so the static viewer can fetch it. Candidates are
// deliberately NOT copied — they are only reachable through the
// password-gated API.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.copyFileSync(path.join(root, 'their-words.json'), path.join(root, 'public', 'their-words.json'));
console.log('Copied their-words.json into public/');

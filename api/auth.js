import { checkAuth } from '../lib/auth.mjs';

// Password check only — used by the site's lock screen so unlocking works
// even if the GitHub token/branch config is broken (those problems then
// surface as their own errors after unlock, not as a locked-out site).
export default async function handler(req, res) {
  if (!checkAuth(req, res)) return;
  res.status(200).json({ ok: true });
}

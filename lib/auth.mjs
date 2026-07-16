import crypto from 'node:crypto';

// App-level password gate for the review API. This layers UNDER Vercel
// Deployment Protection (which must also be enabled — see README); it is not
// a substitute for it. Constant-time comparison; no session state.
export function checkAuth(req, res) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server' });
    return false;
  }
  const header = req.headers['authorization'] || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(supplied).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!supplied || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Wrong password' });
    return false;
  }
  return true;
}

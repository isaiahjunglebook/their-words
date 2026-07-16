// Minimal GitHub Git Data API client for the serverless review endpoints.
// Reads files at head and writes all changed files in ONE commit
// (blobs inline in the tree, deletions via sha: null).

const API = 'https://api.github.com';

function repoConfig() {
  const repo =
    process.env.GITHUB_REPO ||
    (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
      ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
      : null);
  const branch =
    process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    const missing = [!repo && 'GITHUB_REPO', !token && 'GITHUB_TOKEN'].filter(Boolean);
    const err = new Error(`Server not configured: missing ${missing.join(', ')}`);
    err.status = 503;
    throw err;
  }
  return { repo, branch, token };
}

async function gh(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    err.status = res.status >= 500 ? 502 : res.status;
    throw err;
  }
  return res.json();
}

// Read a file's decoded content at the branch head. Returns null if absent.
export async function readFile(path) {
  const { repo, branch, token } = repoConfig();
  const data = await gh(token, 'GET', `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
  if (!data) return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

// List a directory at the branch head. Returns [] if absent.
export async function listDir(path) {
  const { repo, branch, token } = repoConfig();
  const data = await gh(token, 'GET', `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
  return Array.isArray(data) ? data : [];
}

// Commit a set of file changes atomically.
// changes: [{ path, content }] to write, [{ path, delete: true }] to remove.
export async function commitFiles(message, changes) {
  const { repo, branch, token } = repoConfig();
  const ref = await gh(token, 'GET', `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!ref) throw new Error(`Branch ${branch} not found`);
  const headSha = ref.object.sha;
  const headCommit = await gh(token, 'GET', `/repos/${repo}/git/commits/${headSha}`);

  const tree = changes.map((c) =>
    c.delete
      ? { path: c.path, mode: '100644', type: 'blob', sha: null }
      : { path: c.path, mode: '100644', type: 'blob', content: c.content }
  );
  const newTree = await gh(token, 'POST', `/repos/${repo}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree,
  });
  const newCommit = await gh(token, 'POST', `/repos/${repo}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha],
  });
  await gh(token, 'PATCH', `/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    sha: newCommit.sha,
  });
  return newCommit.sha;
}

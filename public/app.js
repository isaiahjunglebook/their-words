/* Their Words — viewer + password-gated review dashboard. No frameworks. */
(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let entries = [];
  let activeTags = new Set();
  let activeMen = new Set();
  let searchTerm = '';
  let password = sessionStorage.getItem('tw-password') || '';

  // ---------- utilities ----------
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c === null || c === undefined) continue;
      node.append(c.nodeType ? c : document.createTextNode(c));
    }
    return node;
  };

  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = el('div', { class: 'toast' }); document.body.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch { toast('Copy failed'); }
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + password,
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
    return data;
  }

  // ---------- canon loading ----------
  async function loadCanon() {
    // Prefer the live canon from GitHub (no redeploy lag); fall back to the
    // static copy bundled at deploy time.
    for (const url of ['/api/canon', '/their-words.json']) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        entries = data.entries || [];
        return;
      } catch { /* try next */ }
    }
    entries = [];
  }

  // ---------- viewer rendering ----------
  function renderStats() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = entries.filter((e) => (e.date || '').startsWith(ym)).length;
    const lastDate = entries.reduce((m, e) => (e.date > m ? e.date : m), '') || '—';
    $('#stats').innerHTML =
      `<strong>${entries.length}</strong> entries · <strong>${thisMonth}</strong> this month<br>last updated ${lastDate}`;
  }

  function counted(values) {
    const m = new Map();
    for (const v of values) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderChips() {
    const tagBox = $('#tag-chips');
    const manBox = $('#man-chips');
    tagBox.replaceChildren();
    manBox.replaceChildren();
    for (const [tag, n] of counted(entries.flatMap((e) => e.tags || []))) {
      tagBox.append(el('button', {
        class: 'chip' + (activeTags.has(tag) ? ' active' : ''),
        type: 'button',
        onclick: () => { activeTags.has(tag) ? activeTags.delete(tag) : activeTags.add(tag); render(); },
      }, tag, el('span', { class: 'n' }, String(n))));
    }
    for (const [man, n] of counted(entries.map((e) => e.man))) {
      manBox.append(el('button', {
        class: 'chip' + (activeMen.has(man) ? ' active' : ''),
        type: 'button',
        onclick: () => { activeMen.has(man) ? activeMen.delete(man) : activeMen.add(man); render(); },
      }, man, el('span', { class: 'n' }, String(n))));
    }
    $('#clear-filters').hidden = !(activeTags.size || activeMen.size || searchTerm);
  }

  function visibleEntries() {
    const q = searchTerm.toLowerCase();
    return entries.filter((e) => {
      if (q && !e.quote.toLowerCase().includes(q)) return false;
      if (activeTags.size && ![...activeTags].every((t) => (e.tags || []).includes(t))) return false;
      if (activeMen.size && !activeMen.has(e.man)) return false;
      return true;
    });
  }

  function renderCards() {
    const box = $('#cards');
    box.replaceChildren();
    const list = visibleEntries().slice().reverse(); // newest first
    $('#empty').hidden = list.length > 0 || entries.length === 0;
    if (entries.length === 0) {
      $('#empty').hidden = false;
      $('#empty').textContent = 'The canon is empty — approve your first candidates in Review.';
    }
    for (const e of list) {
      box.append(el('article', { class: 'card' },
        el('p', { class: 'quote' }, e.quote),
        el('div', { class: 'card-meta' },
          el('span', { class: 'man' }, e.man),
          el('span', {}, e.date),
          el('span', {}, e.context),
          el('span', {}, e.id),
        ),
        el('div', { class: 'card-tags' }, ...(e.tags || []).map((t) => el('span', { class: 'tag' }, t))),
        el('div', { class: 'card-actions' },
          el('button', { class: 'btn', type: 'button', onclick: () => copyText(e.quote) }, 'Copy quote'),
          el('button', { class: 'btn btn-quiet', type: 'button', onclick: () => copyText(`${e.quote} (${e.id})`) }, 'Copy + ID'),
        ),
      ));
    }
  }

  function render() { renderStats(); renderChips(); renderCards(); }

  // ---------- review dashboard ----------
  function setUnlocked(unlocked) {
    $('#review-locked').hidden = unlocked;
    $('#review-unlocked').hidden = !unlocked;
  }

  async function loadQueue() {
    const queue = $('#queue');
    queue.replaceChildren(el('p', { class: 'muted' }, 'Loading queue…'));
    try {
      const { batches } = await api('/api/candidates');
      const total = batches.reduce((n, b) => n + (b.quotes || []).length, 0);
      $('#pending-count').textContent = `${total} pending`;
      queue.replaceChildren();
      if (!total) {
        queue.append(el('p', { class: 'muted' }, 'Queue is clear. New candidates appear here after you run ingest on the Mac.'));
        return;
      }
      for (const batch of batches) {
        if (!(batch.quotes || []).length) continue;
        queue.append(el('div', { class: 'batch' },
          el('div', { class: 'batch-title' }, `${batch.call_name || batch.slug}`),
          el('div', { class: 'batch-sub' }, `${batch.date || ''} · ${batch.context_label || ''} · ${batch.quotes.length} pending`),
        ));
        for (const q of batch.quotes) queue.append(candidateCard(batch, q));
      }
    } catch (err) {
      if (err.status === 401) { lock('Wrong password.'); return; }
      queue.replaceChildren(el('p', { class: 'error' }, `Could not load queue: ${err.message}`));
    }
  }

  function candidateCard(batch, q) {
    const quoteBox = el('textarea', { class: 'cand-quote' }, q.quote);
    const tagsBox = el('input', { class: 'cand-tags', value: (q.tags || []).join(', ') });
    const approveBtn = el('button', { class: 'btn btn-approve', type: 'button' }, 'Approve');
    const killBtn = el('button', { class: 'btn btn-danger', type: 'button' }, 'Kill');

    async function decide(action) {
      approveBtn.disabled = killBtn.disabled = true;
      try {
        const body = { action, slug: batch.slug, quoteId: q.id };
        if (action === 'approve') {
          body.quote = quoteBox.value;
          body.tags = tagsBox.value.split(',').map((t) => t.trim()).filter(Boolean);
        }
        const result = await api('/api/review', { method: 'POST', body: JSON.stringify(body) });
        toast(action === 'approve' ? `Approved as ${result.entry.id}` : 'Killed');
        card.remove();
        await loadCanon();
        render();
        const pill = $('#pending-count');
        const n = parseInt(pill.textContent, 10) - 1;
        pill.textContent = `${Math.max(n, 0)} pending`;
      } catch (err) {
        toast(`Failed: ${err.message}`);
        approveBtn.disabled = killBtn.disabled = false;
      }
    }
    approveBtn.addEventListener('click', () => decide('approve'));
    killBtn.addEventListener('click', () => decide('kill'));

    const card = el('div', { class: 'cand' },
      el('div', { class: 'cand-head' },
        el('span', { class: 'man' }, q.man),
        q.timestamp ? el('span', {}, `[${q.timestamp}]`) : null,
        el('span', {}, (q.tag_note || '')),
      ),
      quoteBox,
      el('label', {}, 'Tags (comma-separated)', tagsBox),
      q.proposed_new_tag
        ? el('div', { class: 'new-tag' },
            el('strong', {}, `Proposed new tag: ${q.proposed_new_tag.name}`),
            el('div', {}, q.proposed_new_tag.definition),
            el('div', { class: 'muted' }, 'Approving with this tag keeps it — remember to add it to tags.md and the changelog.'))
        : null,
      q.why ? el('div', { class: 'cand-why' }, q.why) : null,
      el('div', { class: 'card-actions' }, approveBtn, killBtn),
    );
    return card;
  }

  function lock(message) {
    password = '';
    sessionStorage.removeItem('tw-password');
    setUnlocked(false);
    const errBox = $('#password-error');
    errBox.hidden = !message;
    if (message) errBox.textContent = message;
  }

  async function unlock(pw) {
    password = pw;
    try {
      await api('/api/candidates'); // validates the password
      sessionStorage.setItem('tw-password', pw);
      $('#password-error').hidden = true;
      setUnlocked(true);
      await loadQueue();
    } catch (err) {
      lock(err.status === 401 ? 'Wrong password.' : `Server error: ${err.message}`);
    }
  }

  // ---------- wiring ----------
  $('#search').addEventListener('input', (e) => { searchTerm = e.target.value; render(); });
  $('#clear-filters').addEventListener('click', () => {
    activeTags.clear(); activeMen.clear(); searchTerm = ''; $('#search').value = ''; render();
  });
  $('#review-toggle').addEventListener('click', async () => {
    const panel = $('#review-panel');
    panel.hidden = !panel.hidden;
    if (!panel.hidden && password) await unlock(password);
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth' });
  });
  $('#password-form').addEventListener('submit', (e) => {
    e.preventDefault();
    unlock($('#password-input').value);
  });
  $('#lock-btn').addEventListener('click', () => lock());
  $('#add-text-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('#tx-status');
    status.textContent = 'Saving…';
    try {
      const result = await api('/api/add-text', {
        method: 'POST',
        body: JSON.stringify({
          date: $('#tx-date').value,
          man: $('#tx-man').value,
          quote: $('#tx-quote').value,
          tags: $('#tx-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      status.textContent = `Added as ${result.entry.id}.`;
      e.target.reset();
      await loadCanon();
      render();
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
    }
  });

  loadCanon().then(render);
})();

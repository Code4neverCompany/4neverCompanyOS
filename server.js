'use strict';

// 4neverCompanyOS backend — Express, CommonJS, Node 18+, no deps beyond express.

const express = require('express');
const fs = require('fs');
const path = require('path');

const { Store, genId } = require('./lib/store');
const agentsLib = require('./lib/agents');
const {
  DEFAULT_CONFIG,
  deepMerge,
  maskConfig,
  integrationsStatus,
  isPlainObject
} = require('./lib/integrations');

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT) || 4444;

const DATA_DIR = path.join(__dirname, 'data');
const VAULT_DIR = path.join(__dirname, 'vault');
const PUBLIC_DIR = path.join(__dirname, 'public');

const UNITS = ['aiart4never', '4nevercompany', 'master4broker', 'master4never', 'general'];
const PRIORITIES = ['P0', 'P1', 'P2', 'P3'];
const TASK_STATUSES = ['open', 'doing', 'done'];

// ---------------------------------------------------------------------------
// Boot: dirs + seed files
// ---------------------------------------------------------------------------

const store = new Store(DATA_DIR); // creates ./data if missing
store.seed('tasks', []);
store.seed('notes', []);
store.seed('runs', []);
store.seed('config', DEFAULT_CONFIG);

// Boot reconciliation: runs left "running" by a previous process are orphaned.
{
  const runs = store.read('runs');
  let reconciled = 0;
  for (const r of runs) {
    if (r.status === 'running') {
      r.status = 'error';
      r.finishedAt = new Date().toISOString();
      r.output = (r.output || '') + '\n(orphaned by restart)';
      reconciled++;
    }
  }
  if (reconciled > 0) store.write('runs', runs);
}

const VAULT_SEED = {
  'Welcome': [
    '# Welcome',
    '',
    'Welcome to your **4neverCompanyOS** vault — the knowledge base for [[4neverCompany]].',
    '',
    'Jump into a business unit:',
    '',
    '- [[aiart4never]] — content',
    '- [[4nevercompany Engineering]] — engineering',
    '- [[master4broker]] — trading',
    '- [[master4never]] — gaming',
    '',
    'Create new notes from the Vault tab; link anything by wrapping a note name in double square brackets.'
  ].join('\n'),
  '4neverCompany': [
    '# 4neverCompany',
    '',
    'The umbrella for everything we build. Start at [[Welcome]].',
    '',
    '## Business units',
    '',
    '- [[aiart4never]] — AI art & content pipeline',
    '- [[4nevercompany Engineering]] — software & tooling',
    '- [[master4broker]] — trading operations',
    '- [[master4never]] — gaming projects'
  ].join('\n'),
  'aiart4never': [
    '# aiart4never',
    '',
    'Content unit of [[4neverCompany]] — AI art, publishing cadence, channel growth.',
    '',
    'See also: [[Welcome]].'
  ].join('\n'),
  '4nevercompany Engineering': [
    '# 4nevercompany Engineering',
    '',
    'Engineering unit of [[4neverCompany]] — builds the tools, including this OS.',
    '',
    'See also: [[Welcome]].'
  ].join('\n'),
  'master4broker': [
    '# master4broker',
    '',
    'Trading unit of [[4neverCompany]] — strategies, risk rules, broker automation.',
    '',
    'See also: [[Welcome]].'
  ].join('\n'),
  'master4never': [
    '# master4never',
    '',
    'Gaming unit of [[4neverCompany]] — game projects and community.',
    '',
    'See also: [[Welcome]].'
  ].join('\n')
};

if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
for (const [name, content] of Object.entries(VAULT_SEED)) {
  const file = path.join(VAULT_DIR, name + '.md');
  if (!fs.existsSync(file)) fs.writeFileSync(file, content + '\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso() {
  return new Date().toISOString();
}

function localDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function sanitizeVaultName(name) {
  return String(name || '')
    .replace(/\0/g, '')
    .replace(/[\\/]/g, '')
    .replace(/\.\./g, '')
    .replace(/\.md$/i, '')
    .trim();
}

function vaultFile(name) {
  return path.join(VAULT_DIR, name + '.md');
}

function parseWikiLinks(content) {
  const links = [];
  const re = /\[\[([^\[\]]+)\]\]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].split('|')[0].trim();
    if (target && !links.some((l) => l.toLowerCase() === target.toLowerCase())) {
      links.push(target);
    }
  }
  return links;
}

function readVaultNotes() {
  if (!fs.existsSync(VAULT_DIR)) return [];
  return fs
    .readdirSync(VAULT_DIR)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .map((f) => {
      const full = path.join(VAULT_DIR, f);
      const stat = fs.statSync(full);
      const content = fs.readFileSync(full, 'utf8');
      return {
        name: f.slice(0, -3),
        content,
        links: parseWikiLinks(content),
        updatedAt: stat.mtime.toISOString(),
        size: stat.size
      };
    });
}

// Resolve a wikilink target to an existing note's canonical name (case-insensitive).
function canonicalName(target, notes) {
  const hit = notes.find((n) => n.name.toLowerCase() === String(target).toLowerCase());
  return hit ? hit.name : target;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

// ---- health ----

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: '4neverCompanyOS', version: VERSION, time: nowIso() });
});

// ---- tasks ----

app.get('/api/tasks', (req, res) => {
  let tasks = store.read('tasks', []);
  const { status, unit, priority } = req.query;
  if (status) tasks = tasks.filter((t) => t.status === status);
  if (unit) tasks = tasks.filter((t) => t.unit === unit);
  if (priority) tasks = tasks.filter((t) => t.priority === priority);
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'title is required' });
  const task = {
    id: genId(),
    title,
    priority: PRIORITIES.includes(body.priority) ? body.priority : 'P2',
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    unit: UNITS.includes(body.unit) ? body.unit : 'general',
    status: TASK_STATUSES.includes(body.status) ? body.status : 'open',
    due: typeof body.due === 'string' && body.due ? body.due : null,
    today: Boolean(body.today),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const tasks = store.read('tasks', []);
  tasks.push(task);
  store.write('tasks', tasks);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const tasks = store.read('tasks', []);
  const task = tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  const body = req.body || {};
  if (typeof body.title === 'string' && body.title.trim()) task.title = body.title.trim();
  if (PRIORITIES.includes(body.priority)) task.priority = body.priority;
  if (Array.isArray(body.tags)) task.tags = body.tags.map(String);
  if (UNITS.includes(body.unit)) task.unit = body.unit;
  if (TASK_STATUSES.includes(body.status)) task.status = body.status;
  if (body.due === null || typeof body.due === 'string') task.due = body.due || null;
  if (typeof body.today === 'boolean') task.today = body.today;
  task.updatedAt = nowIso();
  store.write('tasks', tasks);
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const tasks = store.read('tasks', []);
  const idx = tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'task not found' });
  tasks.splice(idx, 1);
  store.write('tasks', tasks);
  res.json({ ok: true });
});

// ---- today ----

app.get('/api/today', (req, res) => {
  const date = localDate();
  const all = store.read('tasks', []);
  const tasks = all
    .filter(
      (t) =>
        t.status !== 'done' &&
        (t.today === true || t.priority === 'P0' || (t.due && t.due <= date))
    )
    .sort((a, b) => {
      const ap = a.priority === 'P0' ? 0 : 1;
      const bp = b.priority === 'P0' ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const ad = a.due || '9999-12-31';
      const bd = b.due || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    });
  const counts = {
    open: all.filter((t) => t.status === 'open').length,
    doing: all.filter((t) => t.status === 'doing').length,
    done: all.filter((t) => t.status === 'done').length,
    p0: all.filter((t) => t.priority === 'P0' && t.status !== 'done').length
  };
  res.json({ date, tasks, counts });
});

// ---- notes ----

app.get('/api/notes', (req, res) => {
  const notes = [...store.read('notes', [])].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  res.json(notes);
});

app.post('/api/notes', (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'title is required' });
  const note = {
    id: genId(),
    title,
    body: typeof body.body === 'string' ? body.body : '',
    pinned: Boolean(body.pinned),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const notes = store.read('notes', []);
  notes.push(note);
  store.write('notes', notes);
  res.status(201).json(note);
});

app.patch('/api/notes/:id', (req, res) => {
  const notes = store.read('notes', []);
  const note = notes.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'note not found' });
  const body = req.body || {};
  if (typeof body.title === 'string' && body.title.trim()) note.title = body.title.trim();
  if (typeof body.body === 'string') note.body = body.body;
  if (typeof body.pinned === 'boolean') note.pinned = body.pinned;
  note.updatedAt = nowIso();
  store.write('notes', notes);
  res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
  const notes = store.read('notes', []);
  const idx = notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'note not found' });
  notes.splice(idx, 1);
  store.write('notes', notes);
  res.json({ ok: true });
});

// ---- vault ----

app.get('/api/vault', (req, res) => {
  const notes = readVaultNotes();
  const result = notes.map((n) => {
    const links = n.links.map((l) => canonicalName(l, notes));
    const backlinks = notes
      .filter(
        (other) =>
          other.name !== n.name &&
          other.links.some((l) => l.toLowerCase() === n.name.toLowerCase())
      )
      .map((other) => other.name);
    return { name: n.name, links, backlinks, updatedAt: n.updatedAt, size: n.size };
  });
  res.json(result);
});

app.get('/api/vault/note', (req, res) => {
  const name = sanitizeVaultName(req.query.name);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const file = vaultFile(name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'note not found' });
  res.json({ name, content: fs.readFileSync(file, 'utf8') });
});

app.put('/api/vault/note', (req, res) => {
  const body = req.body || {};
  const name = sanitizeVaultName(body.name);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const content = typeof body.content === 'string' ? body.content : '';
  if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });
  fs.writeFileSync(vaultFile(name), content);
  res.json({ ok: true, name });
});

app.delete('/api/vault/note', (req, res) => {
  const name = sanitizeVaultName(req.query.name);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const file = vaultFile(name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'note not found' });
  fs.unlinkSync(file);
  res.json({ ok: true });
});

app.get('/api/vault/graph', (req, res) => {
  const notes = readVaultNotes();
  const nodeNames = new Map(); // lowercase -> canonical
  for (const n of notes) nodeNames.set(n.name.toLowerCase(), n.name);
  const edges = [];
  for (const n of notes) {
    for (const link of n.links) {
      const key = link.toLowerCase();
      if (!nodeNames.has(key)) nodeNames.set(key, link); // linked-but-nonexistent
      edges.push({ from: n.name, to: nodeNames.get(key) });
    }
  }
  res.json({
    nodes: [...nodeNames.values()].map((id) => ({ id })),
    edges
  });
});

app.get('/api/vault/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  if (!q) return res.json([]);
  const results = [];
  for (const n of readVaultNotes()) {
    const contentIdx = n.content.toLowerCase().indexOf(q);
    const nameMatch = n.name.toLowerCase().includes(q);
    if (contentIdx === -1 && !nameMatch) continue;
    let snippet;
    if (contentIdx !== -1) {
      const start = Math.max(0, contentIdx - 40);
      snippet = n.content.slice(start, contentIdx + q.length + 60).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '…' + snippet;
      if (contentIdx + q.length + 60 < n.content.length) snippet += '…';
    } else {
      snippet = n.content.slice(0, 100).replace(/\s+/g, ' ').trim();
    }
    results.push({ name: n.name, snippet });
  }
  res.json(results);
});

// ---- agents ----

app.get('/api/agents', (req, res) => {
  res.json(agentsLib.listAgents(store));
});

app.post('/api/agents/run', (req, res) => {
  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!body.agentId) return res.status(400).json({ error: 'agentId is required' });
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  const agents = agentsLib.listAgents(store);
  const agent = agents.find((a) => a.id === body.agentId);
  if (!agent) return res.status(404).json({ error: 'unknown agent: ' + body.agentId });
  const run = agentsLib.runAgent(store, agent, prompt);
  res.status(202).json(run);
});

app.get('/api/agents/runs', (req, res) => {
  const runs = [...agentsLib.getRuns(store)].sort((a, b) =>
    String(b.startedAt).localeCompare(String(a.startedAt))
  );
  res.json(runs.slice(0, 50));
});

app.get('/api/agents/runs/:id', (req, res) => {
  const run = agentsLib.getRun(store, req.params.id);
  if (!run) return res.status(404).json({ error: 'run not found' });
  res.json(run);
});

app.post('/api/agents/delegate', (req, res) => {
  const body = req.body || {};
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const chain = Array.isArray(body.chain) ? body.chain.map(String) : [];
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (chain.length === 0) {
    return res.status(400).json({ error: 'chain must contain at least one agentId' });
  }
  const agents = agentsLib.listAgents(store);
  const missing = chain.filter((id) => !agents.some((a) => a.id === id));
  if (missing.length) {
    return res.status(404).json({ error: 'unknown agent(s): ' + missing.join(', ') });
  }
  const result = agentsLib.delegate(store, agents, prompt, chain);
  res.status(202).json(result);
});

// ---- config ----

app.get('/api/config', (req, res) => {
  res.json(maskConfig(store.read('config', DEFAULT_CONFIG)));
});

app.put('/api/config', (req, res) => {
  const current = store.read('config', DEFAULT_CONFIG);
  const patch = isPlainObject(req.body) ? req.body : {};
  const merged = deepMerge(deepMerge(DEFAULT_CONFIG, current), patch);
  store.write('config', merged);
  res.json(maskConfig(merged));
});

// ---- integrations ----

app.get('/api/integrations/status', (req, res) => {
  res.json(integrationsStatus(store.read('config', DEFAULT_CONFIG)));
});

// ---- fallback ----

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not found: ' + req.method + ' ' + req.path });
  }
  const index = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res
    .status(200)
    .type('text/plain')
    .send('4neverCompanyOS backend is running. Frontend not built yet (public/index.html missing).');
});

// JSON error handler (bad JSON bodies etc.)
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

app.listen(PORT, () => {
  console.log('4neverCompanyOS v' + VERSION + ' listening on http://localhost:' + PORT);
});

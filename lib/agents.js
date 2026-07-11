'use strict';

// Agent registry + CLI run execution for 4neverCompanyOS.

const { spawn, spawnSync } = require('child_process');
const { genId } = require('./store');

const OUTPUT_CAP = 100 * 1024; // 100KB
const RUN_TIMEOUT_MS = 120 * 1000; // 120s
const RUNS_MAX = 50;

const DEFAULT_AGENTS = [
  {
    id: 'claude',
    name: 'Claude',
    cmd: 'claude',
    args: ['-p'],
    description: 'Anthropic Claude Code CLI (prompt passed via -p).'
  },
  {
    id: 'pi',
    name: 'Pi',
    cmd: 'pi',
    args: [],
    description: 'Pi CLI agent (prompt passed as last argument).'
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    cmd: 'antigravity',
    args: [],
    description: 'Antigravity CLI agent (prompt passed as last argument).'
  }
];

function isAvailable(cmd) {
  try {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    const res = spawnSync(probe, [String(cmd)], { stdio: 'ignore' });
    return res.status === 0;
  } catch (e) {
    return false;
  }
}

// Defaults merged with config.customAgents, live availability flag attached.
function listAgents(store) {
  const config = store.read('config', {}) || {};
  const custom = Array.isArray(config.customAgents) ? config.customAgents : [];
  const merged = DEFAULT_AGENTS.map((a) => ({ ...a, args: [...a.args] }));
  for (const c of custom) {
    if (!c || !c.id || !c.cmd) continue;
    const agent = {
      id: String(c.id),
      name: c.name ? String(c.name) : String(c.id),
      cmd: String(c.cmd),
      args: Array.isArray(c.args) ? c.args.map(String) : [],
      description: c.description ? String(c.description) : 'Custom agent from config.'
    };
    const idx = merged.findIndex((a) => a.id === agent.id);
    if (idx >= 0) merged[idx] = agent;
    else merged.push(agent);
  }
  return merged.map((a) => ({ ...a, available: isAvailable(a.cmd) }));
}

// ---- runs.json helpers (newest first, capped) ----

function getRuns(store) {
  const runs = store.read('runs', []);
  return Array.isArray(runs) ? runs : [];
}

function getRun(store, id) {
  return getRuns(store).find((r) => r.id === id) || null;
}

function createRun(store, agentId, prompt, delegatedTo) {
  const run = {
    id: genId(),
    agentId,
    prompt,
    status: 'running',
    output: '',
    exitCode: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    delegatedTo: Array.isArray(delegatedTo) ? delegatedTo : []
  };
  const runs = getRuns(store);
  runs.unshift(run);
  store.write('runs', runs.slice(0, RUNS_MAX));
  return run;
}

function updateRun(store, id, patch) {
  const runs = getRuns(store);
  const run = runs.find((r) => r.id === id);
  if (!run) return null;
  Object.assign(run, patch);
  store.write('runs', runs);
  return run;
}

// cmd.exe-safe quoting for win32 shell mode.
function quoteArgWin(a) {
  const s = String(a);
  if (s === '') return '""';
  if (!/[\s"&|<>^%]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// Execute agent CLI, streaming output into the existing run record.
// Resolves with the final run object (never rejects).
function executeInto(store, agent, prompt, runId) {
  return new Promise((resolve) => {
    let output = '';
    let finished = false;
    let timer = null;
    let child = null;

    const finish = (status, exitCode) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      const updated = updateRun(store, runId, {
        status,
        exitCode,
        output: output.slice(0, OUTPUT_CAP),
        finishedAt: new Date().toISOString()
      });
      resolve(updated || getRun(store, runId));
    };

    const useShell = process.platform === 'win32';
    const rawArgs = [...agent.args, prompt];
    const args = useShell ? rawArgs.map(quoteArgWin) : rawArgs;

    try {
      child = spawn(agent.cmd, args, { shell: useShell, windowsHide: true });
    } catch (e) {
      output += 'spawn error: ' + e.message;
      return finish('error', null);
    }

    timer = setTimeout(() => {
      output += '\n[killed after 120s timeout]';
      try {
        child.kill('SIGKILL');
      } catch (e) {
        /* ignore */
      }
      finish('error', null);
    }, RUN_TIMEOUT_MS);

    const collect = (chunk) => {
      if (output.length < OUTPUT_CAP) output += chunk.toString();
    };
    if (child.stdout) child.stdout.on('data', collect);
    if (child.stderr) child.stderr.on('data', collect);
    child.on('error', (e) => {
      output += 'spawn error: ' + e.message;
      finish('error', null);
    });
    child.on('close', (code) => {
      finish(code === 0 ? 'done' : 'error', code);
    });
  });
}

// Fire-and-forget single run. Returns the Run record immediately (status running).
function runAgent(store, agent, prompt) {
  const run = createRun(store, agent.id, prompt, []);
  executeInto(store, agent, prompt, run.id).catch(() => {});
  return run;
}

// Sequential delegation pipeline. All Run records are created up front so the
// caller gets every run id immediately; stages execute one after another.
// An error in any stage stops the chain (remaining runs marked error).
function delegate(store, agents, prompt, chain) {
  const stageAgents = chain.map((id) => agents.find((a) => a.id === id));
  const runs = chain.map((agentId) => createRun(store, agentId, prompt, [...chain]));

  (async () => {
    let context = null;
    for (let i = 0; i < stageAgents.length; i++) {
      const agent = stageAgents[i];
      const stagePrompt =
        context === null
          ? prompt
          : 'Context from previous agent:\n' + context + '\n\nTask: ' + prompt;
      updateRun(store, runs[i].id, { prompt: stagePrompt, startedAt: new Date().toISOString() });
      const done = await executeInto(store, agent, stagePrompt, runs[i].id);
      if (!done || done.status !== 'done') {
        for (let j = i + 1; j < runs.length; j++) {
          updateRun(store, runs[j].id, {
            status: 'error',
            output: 'Skipped: a previous agent in the chain failed.',
            finishedAt: new Date().toISOString()
          });
        }
        return;
      }
      context = done.output;
    }
  })().catch(() => {});

  return { id: genId(), runs: runs.map((r) => r.id) };
}

module.exports = {
  DEFAULT_AGENTS,
  isAvailable,
  listAgents,
  getRuns,
  getRun,
  runAgent,
  delegate,
  OUTPUT_CAP,
  RUN_TIMEOUT_MS
};

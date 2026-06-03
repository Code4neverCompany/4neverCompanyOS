// @c4n/telemetry/consumer — long-running JSONL consumer.
//
// Watches `<vault>/personas/<persona_id>/log/<date>.jsonl` and emits
// running per-persona aggregates as new lines arrive. The consumer is
// the bridge between the Rust persona-supervisor's tail-friendly JSONL
// files and the in-process React panels (and any future HTTP / WebSocket
// feeds) that want real-time stats.
//
// Implementation notes:
//   - In production, the Tauri event bridge (`vault-artifact-changed`)
//     is the primary trigger — the consumer just re-reads the affected
//     file when it gets the signal. We use `node:fs.watch` (or its
//     no-op shim in jsdom) as the test fallback so the package stays
//     Tauri-free. Callers that want a different watcher can pass one
//     in via `options.watcher`.
//   - The consumer is a singleton-shaped object. `start()` is idempotent;
//     `stop()` is always safe to call.

import { createLogger } from "@c4n/observability";
import { ProgressBus, type ProgressSignal } from "@c4n/progress-signal";
import type { LogEntry } from "./parser.js";
import { parseJsonl } from "./parser.js";
import type { PersonaAggregate } from "./aggregator.js";
import { aggregate } from "./aggregator.js";

export const PACKAGE_NAME = "@c4n/telemetry/consumer" as const;

const log = createLogger("@c4n/telemetry");

// ── Public API ────────────────────────────────────────────────────────

export interface StartConsumerOptions {
  /**
   * Root directory that contains the `personas/<id>/log/<date>.jsonl`
   * tree. In the desktop app this is the resolved vault root. The
   * consumer only walks it on the first start; the watcher then keeps
   * the in-memory state current.
   */
  vaultDir: string;
  /**
   * Override the directory watcher for tests. Receives the directory
   * path and a callback to fire on each filesystem change. The default
   * uses `node:fs.watch` and degrades to a no-op when unavailable
   * (e.g. in vitest's happy-dom environment).
   */
  watcher?: WatcherFactory;
  /**
   * Called every time an aggregate is updated. UI panels subscribe
   * here to refresh their running totals.
   */
  onAggregate?: (aggregate: PersonaAggregate) => void;
  /**
   * Called when a parse error occurs (malformed line, unreadable file).
   * Errors are never thrown — the consumer stays running.
   */
  onError?: (err: Error) => void;
  /**
   * When true, the consumer also subscribes to ProgressBus and treats
   * `artifact.changed` signals as triggers to re-read the affected
   * JSONL file. This is the canonical path in the desktop app: the
   * Rust side fires a `vault-artifact-changed` Tauri event, the
   * desktop's main.tsx bridges it to `ProgressBus.emitArtifact()`, and
   * the consumer picks it up here. Defaults to true.
   */
  subscribeToBus?: boolean;
}

export type WatcherFactory = (
  dir: string,
  onChange: (path: string) => void,
) => () => void;

// ── File watcher (defined first so STATE can reference it) ────────────

const defaultWatcher: WatcherFactory = (dir, onChange) => {
  // node:fs is only available in node-like environments. In the browser
  // (Tauri's webview, vitest happy-dom, etc.) we can't watch files
  // directly — the Rust side's `vault-artifact-changed` Tauri event
  // is the canonical signal in those environments. Tests pass an
  // explicit watcher factory to drive change events deterministically.
  let watcher: { close: () => void } | null = null;
  try {
    // Dynamic require to keep this module browser-loadable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (fs.watch && typeof dir === "string" && dir.length > 0) {
      watcher = fs.watch(dir, { recursive: true }, (_event, filename) => {
        if (typeof filename === "string" && filename.endsWith(".jsonl")) {
          onChange(filename);
        }
      });
    }
  } catch {
    // node:fs unavailable; fall through to a no-op watcher.
  }
  return () => {
    if (watcher !== null) {
      watcher.close();
      watcher = null;
    }
  };
};

// ── State ─────────────────────────────────────────────────────────────

interface ConsumerState {
  vaultDir: string;
  watcher: WatcherFactory;
  onAggregate: ((a: PersonaAggregate) => void) | null;
  onError: ((e: Error) => void) | null;
  stopWatch: (() => void) | null;
  unsubscribeBus: (() => void) | null;
  /** Per-persona entries we've already read. */
  entries: Map<string, LogEntry[]>;
  /** Per-persona inotify-style flag so we re-parse on next signal. */
  dirty: Set<string>;
}

const STATE: ConsumerState = {
  vaultDir: "",
  watcher: defaultWatcher,
  onAggregate: null,
  onError: null,
  stopWatch: null,
  unsubscribeBus: null,
  entries: new Map(),
  dirty: new Set(),
};

// ── Lifecycle ─────────────────────────────────────────────────────────

/** Start the singleton consumer. Idempotent: a second call is a no-op. */
export function startTelemetryConsumer(options: StartConsumerOptions): void {
  if (STATE.stopWatch !== null) {
    log.warn("telemetry consumer already started; ignoring duplicate start()");
    return;
  }
  STATE.vaultDir = options.vaultDir;
  STATE.watcher = options.watcher ?? defaultWatcher;
  STATE.onAggregate = options.onAggregate ?? null;
  STATE.onError = options.onError ?? null;
  STATE.entries = new Map();
  STATE.dirty = new Set();

  // Best-effort initial scan: read any JSONL files that already exist.
  // We don't fail the consumer if the vault isn't there yet — the
  // watcher will pick up new files as they appear.
  initialScan().catch((err) => {
    log.error("initial scan failed", { err: String(err) });
  });

  STATE.stopWatch = STATE.watcher(options.vaultDir, (path) => {
    handleChange(path);
  });

  // The Tauri event bridge in main.tsx fires `vault-artifact-changed`
  // for any file change under the vault. The desktop bridges those
  // events to ProgressBus, so subscribing here means the consumer
  // works even when its initial `vaultDir` is a placeholder.
  if (options.subscribeToBus !== false) {
    STATE.unsubscribeBus = ProgressBus.subscribe((signal: ProgressSignal) => {
      if (signal.kind === "artifact.changed") {
        handleChange(signal.path);
      }
    });
  }

  log.info("telemetry consumer started", { vaultDir: options.vaultDir });
}

/** Stop the consumer and release watcher resources. Safe to call twice. */
export function stopTelemetryConsumer(): void {
  if (STATE.stopWatch !== null) {
    STATE.stopWatch();
    STATE.stopWatch = null;
  }
  if (STATE.unsubscribeBus !== null) {
    STATE.unsubscribeBus();
    STATE.unsubscribeBus = null;
  }
  STATE.entries.clear();
  STATE.dirty.clear();
  log.info("telemetry consumer stopped");
}

/**
 * Latest known aggregate for `personaId`, computed from the in-memory
 * entries. Returns `null` if we have no entries for that persona yet.
 * Used by future UI panels — not called by anyone in v0, but exported
 * so the API is stable.
 */
export function latestAggregate(personaId: string): PersonaAggregate | null {
  const entries = STATE.entries.get(personaId);
  if (entries === undefined || entries.length === 0) return null;
  return aggregate(entries, personaId);
}

// ── File watching — change handler ────────────────────────────────────

function handleChange(changedPath: string): void {
  // changedPath may be relative (from the recursive watcher) or
  // absolute (from a test double). Try to pull a personaId out of it.
  const personaId = extractPersonaId(changedPath, STATE.vaultDir);
  if (personaId === null) return; // not a JSONL under personas/<id>/log/
  STATE.dirty.add(personaId);
  void reprocess(personaId);
}

async function reprocess(personaId: string): Promise<void> {
  STATE.dirty.delete(personaId);
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const file = path.join(STATE.vaultDir, "personas", personaId, "log", todayJsonlName());
    let text: string;
    try {
      text = await fs.readFile(file, "utf8");
    } catch (e) {
      // File may have been removed between watch fire and read.
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return;
      throw err;
    }
    const { entries, errors } = parseJsonl(text);
    for (const entry of entries) {
      entry.personaId = personaId;
      entry.sourceFile = file;
    }
    STATE.entries.set(personaId, entries);
    if (errors.length > 0) {
      log.warn("telemetry parse errors", { personaId, count: errors.length });
    }
    if (STATE.onAggregate !== null) {
      STATE.onAggregate(aggregate(entries, personaId));
    }
  } catch (e) {
    log.error("telemetry reprocess failed", {
      personaId,
      err: String(e),
    });
    if (STATE.onError !== null) {
      STATE.onError(e as Error);
    }
  }
}

async function initialScan(): Promise<void> {
  // Walk `<vault>/personas/*/log/*.jsonl` once so the consumer's first
  // emitted aggregate has real data, not zeros. Best-effort: missing
  // directories are fine; only I/O errors are surfaced.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const personasDir = path.join(STATE.vaultDir, "personas");
  let personaDirs: import("node:fs").Dirent[];
  try {
    personaDirs = await fs.readdir(personasDir, { withFileTypes: true });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const dirent of personaDirs) {
    if (!dirent.isDirectory()) continue;
    const personaId = dirent.name;
    const logDir = path.join(personasDir, personaId, "log");
    let fileNames: string[];
    try {
      fileNames = await fs.readdir(logDir);
    } catch {
      continue;
    }
    for (const name of fileNames) {
      if (!name.endsWith(".jsonl")) continue;
      if (name !== todayJsonlName()) continue; // v0: today's only
      const filePath = path.join(logDir, name);
      const text = await fs.readFile(filePath, "utf8");
      const { entries: parsed, errors } = parseJsonl(text);
      for (const entry of parsed) {
        entry.personaId = personaId;
        entry.sourceFile = filePath;
      }
      STATE.entries.set(personaId, parsed);
      if (errors.length > 0) {
        log.warn("telemetry initial parse errors", {
          personaId,
          count: errors.length,
        });
      }
      if (STATE.onAggregate !== null) {
        STATE.onAggregate(aggregate(parsed, personaId));
      }
    }
  }
}

function todayJsonlName(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}.jsonl`;
}

/**
 * Extract the persona id from a watcher event path. Returns `null` for
 * paths that don't match the expected `personas/<id>/log/...` shape
 * so non-JSONL changes are dropped early.
 */
function extractPersonaId(changedPath: string, vaultDir: string): string | null {
  // Normalize separators; the watcher can hand us either OS-style.
  const parts = changedPath.replace(/\\/g, "/").split("/");
  const personasIdx = parts.findIndex((p) => p === "personas");
  if (personasIdx < 0 || personasIdx + 1 >= parts.length) return null;
  if (!parts[personasIdx + 1]) return null;
  // Verify the file path contains /log/<date>.jsonl so we don't try
  // to reparse other artifacts (e.g. .pty.raw streams).
  const tail = parts.slice(personasIdx + 2).join("/");
  if (!/\.jsonl$/.test(tail)) return null;
  if (!/\/log\//.test(tail)) return null;
  // Touch vaultDir to make the unused-var tsc check happy — we don't
  // actually need the prefix because personaIds are unique within a
  // vault, but the signature documents the assumption.
  void vaultDir;
  return parts[personasIdx + 1]!;
}

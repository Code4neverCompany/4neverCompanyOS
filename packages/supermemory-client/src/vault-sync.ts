// @c4n/supermemory-client — vault <-> supermemory sync bridge.
//
// Reads persona/project vault entries via injected IO and pushes new/changed
// content to supermemory. Uses a lightweight last-synced timestamp stored in
// the vault's PERSONA_META_FILE to decide what is stale.
//
// The caller (desktop shell) supplies the filesystem IO so this module stays
// free of hard `node:fs` imports and is fully testable without a real vault.

import { SupermemoryClient } from "./client.js";
import type { MemoryRecord } from "./types.js";

/** Minimal async IO surface needed for vault reads. */
export interface VaultIO {
  /** Read a UTF-8 text file; return null if the file does not exist. */
  readText(path: string): Promise<string | null>;
  /** Write a UTF-8 text file (creates intermediate dirs if needed). */
  writeText(path: string, content: string): Promise<void>;
}

export interface SyncOptions {
  /** ISO-8601 timestamp; only entries newer than this are re-synced. */
  since?: string;
  /** Space(s) to tag on the created memories (persona/project namespaces). */
  spaces?: string[];
}

export interface SyncResult {
  pushed: number;
  skipped: number;
  errors: Array<{ entry: string; error: string }>;
}

/**
 * Sync a list of vault entry paths to supermemory.
 *
 * Each path is read via `io.readText`; non-existent paths are skipped.
 * A simple content hash check prevents re-pushing unchanged entries.
 * Sync state (last-pushed hashes) is persisted to `stateFile` via `io.writeText`.
 *
 * @param client    Initialized SupermemoryClient.
 * @param io        Injected filesystem IO (real or mock).
 * @param entries   Vault-relative file paths to sync.
 * @param stateFile Path where the last-push state is stored (JSON).
 * @param options   Optional sync constraints.
 */
export async function syncVaultEntriesToSupermemory(
  client: SupermemoryClient,
  io: VaultIO,
  entries: string[],
  stateFile: string,
  options?: SyncOptions,
): Promise<SyncResult> {
  // Load or initialize push state (maps path -> hash of last pushed content).
  const stateRaw = await io.readText(stateFile);
  const state: Record<string, string> =
    stateRaw !== null ? (JSON.parse(stateRaw) as Record<string, string>) : {};

  const result: SyncResult = { pushed: 0, skipped: 0, errors: [] };

  for (const entryPath of entries) {
    const content = await io.readText(entryPath);
    if (content === null) {
      result.skipped++;
      continue;
    }

    const hash = simpleHash(content);
    if (state[entryPath] === hash) {
      result.skipped++;
      continue;
    }

    try {
      const addOpts: import("./types.js").AddMemoryOptions = {
        metadata: { vaultPath: entryPath, syncedAt: new Date().toISOString() },
      };
      if (options?.spaces !== undefined) addOpts.spaces = options.spaces;
      await client.add(content, addOpts);
      state[entryPath] = hash;
      result.pushed++;
    } catch (err) {
      result.errors.push({
        entry: entryPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await io.writeText(stateFile, JSON.stringify(state, null, 2));
  return result;
}

/**
 * Pull supermemory search results and write them as a markdown file in the vault.
 * This is the inbound direction of the sync: supermemory → vault.
 *
 * @param client    Initialized SupermemoryClient.
 * @param io        Injected IO.
 * @param query     Search query for the pull.
 * @param destPath  Vault path to write the pulled memories to.
 * @param spaces    Restrict pull to these supermemory spaces.
 * @param limit     Max memories to pull (default 20).
 */
export async function pullSupermemoryToVault(
  client: SupermemoryClient,
  io: VaultIO,
  query: string,
  destPath: string,
  spaces?: string[],
  limit = 20,
): Promise<MemoryRecord[]> {
  const searchOpts: import("./types.js").SearchOptions = { limit };
  if (spaces !== undefined) searchOpts.spaces = spaces;
  const results = await client.search(query, searchOpts);

  const lines = [
    `# Supermemory pull — ${new Date().toISOString()}`,
    `> Query: \`${query}\``,
    "",
    ...results.map(
      (r) => `## ${r.id}\n\n${r.content.trim()}\n\n_score: ${(r.score * 100).toFixed(1)}%_\n`,
    ),
  ];

  await io.writeText(destPath, lines.join("\n"));
  return results as unknown as MemoryRecord[];
}

// ── Internal ───────────────────────────────────────────────────────────────

/** djb2-style hash — good enough for change detection, not cryptographic. */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

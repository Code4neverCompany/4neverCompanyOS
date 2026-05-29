// @c4n/supermemory-client — Opt-in Supermemory wrapper for cross-project semantic memory.
// Per-category toggles drive what crosses the local-to-cloud boundary.
//
// Architecture: FR-31
// Implementing stories: M5 Story 5.2 (full opt-in settings); NEVAAA-10 (M3 core client + pipeline)
//
// Auth: API key is retrieved externally via @c4n/credential-storage (SUPERMEMORY_SERVICE /
// SUPERMEMORY_ACCOUNT). Never hardcode the key — pass it into SupermemoryClient at construction.

export const PACKAGE_NAME = "@c4n/supermemory-client" as const;

export {
  SUPERMEMORY_SERVICE,
  SUPERMEMORY_ACCOUNT,
  SUPERMEMORY_BASE_URL,
  SupermemoryError,
  type AddMemoryOptions,
  type MemoryRecord,
  type SearchOptions,
  type MemorySearchResult,
  type SessionFacts,
  type InjectedContext,
} from "./types.js";

export { SupermemoryClient, type SupermemoryClientOptions, type FetchFn } from "./client.js";

export { injectSessionContext, flushSessionFacts } from "./pipeline.js";

export {
  syncVaultEntriesToSupermemory,
  pullSupermemoryToVault,
  type VaultIO,
  type SyncOptions,
  type SyncResult,
} from "./vault-sync.js";

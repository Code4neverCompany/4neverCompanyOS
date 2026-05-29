// @c4n/supermemory-client — shared types for the supermemory REST API wrapper.

/** Credential-storage key constants. The API key must be set externally — never hardcode it. */
export const SUPERMEMORY_SERVICE = "supermemory" as const;
export const SUPERMEMORY_ACCOUNT = "api-key" as const;

/** Base URL for the supermemory v1 API. */
export const SUPERMEMORY_BASE_URL = "https://api.supermemory.ai/v1" as const;

// ── Request/response shapes ────────────────────────────────────────────────

export interface AddMemoryOptions {
  /** Namespace(s) for this memory — use persona ID to scope per-persona. */
  spaces?: string[];
  /** Freeform metadata stored alongside the memory. */
  metadata?: Record<string, unknown>;
}

export interface MemoryRecord {
  id: string;
  content: string;
  spaces: string[];
  metadata: Record<string, unknown>;
  createdAt?: string;
}

export interface SearchOptions {
  /** Max results to return (default 10). */
  limit?: number;
  /** Restrict search to these spaces. */
  spaces?: string[];
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score: number;
  spaces: string[];
  metadata: Record<string, unknown>;
}

// ── Pipeline types ─────────────────────────────────────────────────────────

/** Facts extracted from a session to flush to supermemory. */
export interface SessionFacts {
  /** ID of the persona that ran the session. */
  personaId: string;
  /** Freeform fact strings extracted from session artifacts. */
  facts: string[];
  /** ISO-8601 timestamp of the session. */
  sessionAt: string;
  /** Optional project-level namespace to attach alongside the persona space. */
  projectId?: string;
}

/** Context block injected into a persona's session prompt. */
export interface InjectedContext {
  personaId: string;
  memories: MemorySearchResult[];
  /** Pre-rendered markdown block ready to append to a system prompt. */
  promptBlock: string;
}

// ── Error ──────────────────────────────────────────────────────────────────

export class SupermemoryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SupermemoryError";
  }
}

// @c4n/supermemory-client — typed HTTP wrapper around the supermemory v1 REST API.
//
// The caller is responsible for supplying the API key (retrieved via
// @c4n/credential-storage in the Tauri shell, or injected in tests).
// No credentials are stored or hardcoded here.

import {
  SUPERMEMORY_BASE_URL,
  type AddMemoryOptions,
  type MemoryRecord,
  type MemorySearchResult,
  type SearchOptions,
  SupermemoryError,
} from "./types.js";

/** Thin injectable fetch signature — matches globalThis.fetch. */
export type FetchFn = typeof globalThis.fetch;

export interface SupermemoryClientOptions {
  /** supermemory API key. Retrieved from credential-storage by the caller. */
  apiKey: string;
  /** Override base URL (useful for tests). Default: SUPERMEMORY_BASE_URL. */
  baseUrl?: string;
  /** Injectable fetch implementation. Defaults to globalThis.fetch. */
  fetch?: FetchFn;
}

export class SupermemoryClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetch: FetchFn;

  constructor(options: SupermemoryClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? SUPERMEMORY_BASE_URL;
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Add a memory. Returns the persisted record including its server-assigned ID. */
  async add(content: string, options?: AddMemoryOptions): Promise<MemoryRecord> {
    const body: Record<string, unknown> = { content };
    if (options?.spaces !== undefined) body["spaces"] = options.spaces;
    if (options?.metadata !== undefined) body["metadata"] = options.metadata;

    const res = await this.request("POST", "/memories", body);
    return res as MemoryRecord;
  }

  /** Semantic search. Returns ranked results. */
  async search(query: string, options?: SearchOptions): Promise<MemorySearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    if (options?.spaces !== undefined) {
      for (const s of options.spaces) params.append("spaces", s);
    }

    const res = await this.request("GET", `/search?${params.toString()}`);
    const raw = res as { results?: unknown[] };
    return (raw["results"] ?? []) as MemorySearchResult[];
  }

  /** Delete a single memory by ID. */
  async delete(memoryId: string): Promise<void> {
    await this.request("DELETE", `/memories/${encodeURIComponent(memoryId)}`);
  }

  /** Get a single memory by ID. */
  async get(memoryId: string): Promise<MemoryRecord> {
    const res = await this.request("GET", `/memories/${encodeURIComponent(memoryId)}`);
    return res as MemoryRecord;
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.fetch(url, init);

    if (!res.ok) {
      let msg = `supermemory ${method} ${path} → ${res.status}`;
      try {
        const errBody = (await res.json()) as { error?: string; message?: string };
        msg = errBody["error"] ?? errBody["message"] ?? msg;
      } catch {
        // ignore parse failure — use status-only message
      }
      throw new SupermemoryError(res.status, msg);
    }

    if (res.status === 204) return undefined;

    return res.json() as Promise<unknown>;
  }
}

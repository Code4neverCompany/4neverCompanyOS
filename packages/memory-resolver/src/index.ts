// @c4n/memory-resolver — Four-tier memory read resolver (FR-32 / Story 5.3).
//
// Precedence order (highest to lowest):
//   1. Per-persona vault dir     → personas/<id>/memory/*.md
//   2. Project vault           → projects/<id>/**/*.md
//   3. Hermes native           → FTS5 session search
//   4. Supermemory             → cross-project semantic (opt-in)
//
// The resolver returns the first hit, or null if all tiers miss.
// Per the precedence spec: specificity wins; exact matches from tier 1/2 always
// beat Supermemory relevance scores; project-vault [override] tags in decision
// logs beat persona entries for the same query.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";
import { personaDir, projectDir } from "@c4n/vault-layout";
import { SupermemoryClient } from "@c4n/supermemory-client";

// ── Types ─────────────────────────────────────────────────────────────────

export type MemorySource = "persona" | "project" | "hermes" | "supermemory";

export interface MemoryReadResult {
  content: string;
  source: MemorySource;
  /** Absolute path (tiers 1/2) or query string (tiers 3/4). */
  path: string;
  /** 0-1 relevance score. Only set for tier 4 (Supermemory). */
  relevance?: number;
  /** Unix millis — file mtime or session timestamp. */
  ts: number;
}

export interface MemoryResolverOptions {
  /** Vault root (e.g. /home/user/vault). */
  vaultRoot: string;
  /** Active persona id (kebab-case). */
  personaId: string;
  /** Active project id (slug). */
  projectId: string;
  /** Hermes session search function. Called with a query string; returns matching session facts. */
  hermesSearch: (query: string) => Promise<Array<{ content: string; ts: number }>>;
  /** Optional Supermemory client. If absent, tier 4 is skipped. */
  supermemory?: SupermemoryClient;
  /**
   * Whether Supermemory is opted-in for cross-project fallback.
   * Tier 4 is only consulted when this is true AND tiers 1-3 miss.
   */
  supermemoryEnabled?: boolean;
}

// ── MemoryResolver ─────────────────────────────────────────────────────────

export class MemoryResolver {
  private readonly vaultRoot: string;
  private readonly personaId: string;
  private readonly projectId: string;
  private readonly hermesSearch: (query: string) => Promise<Array<{ content: string; ts: number }>>;
  private readonly supermemory: SupermemoryClient | undefined;
  private readonly supermemoryEnabled: boolean;

  constructor(opts: MemoryResolverOptions) {
    this.vaultRoot = opts.vaultRoot;
    this.personaId = opts.personaId;
    this.projectId = opts.projectId;
    this.hermesSearch = opts.hermesSearch;
    this.supermemory = opts.supermemory;
    this.supermemoryEnabled = opts.supermemoryEnabled ?? false;
  }

  /**
   * Resolve a memory query across all four tiers, in precedence order.
   * Returns the first hit, or null if no tier has a result.
   */
  async resolve(query: string): Promise<MemoryReadResult | null> {
    const tier1 = await this.searchPersonaMemory(query);
    if (tier1) return tier1;

    const tier2 = await this.searchProjectVault(query);
    if (tier2) return tier2;

    const tier3 = await this.searchHermes(query);
    if (tier3) return tier3;

    if (this.supermemoryEnabled && this.supermemory) {
      const tier4 = await this.searchSupermemory(query);
      if (tier4) return tier4;
    }

    return null;
  }

  private async searchPersonaMemory(query: string): Promise<MemoryReadResult | null> {
    const memoryDir = personaDir(this.vaultRoot, this.personaId) + "/memory";
    return this.searchMarkdownDir(memoryDir, query, "persona");
  }

  private async searchProjectVault(query: string): Promise<MemoryReadResult | null> {
    const projectPath = projectDir(this.vaultRoot, this.projectId);
    return this.searchMarkdownDir(projectPath, query, "project");
  }

  private async searchHermes(query: string): Promise<MemoryReadResult | null> {
    const hits = await this.hermesSearch(query);
    if (hits.length === 0) return null;
    const hit = hits[0];
    return {
      content: hit.content,
      source: "hermes",
      path: "hermes://session?q=" + encodeURIComponent(query),
      ts: hit.ts,
    };
  }

  private async searchSupermemory(query: string): Promise<MemoryReadResult | null> {
    if (!this.supermemory) return null;
    const results = await this.supermemory.search(query, { limit: 1 });
    if (results.length === 0) return null;
    const top = results[0];
    return {
      content: top.content,
      source: "supermemory",
      path: "supermemory://" + top.id,
      relevance: top.score,
      ts: Date.now(),
    };
  }

  private async searchMarkdownDir(
    dir: string,
    query: string,
    source: MemorySource,
  ): Promise<MemoryReadResult | null> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    const lowerQuery = query.toLowerCase();

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        const subResult = await this.searchMarkdownDir(join(dir, entry.name), query, source);
        if (subResult) return subResult;
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = join(dir, entry.name);
        const content = await this.readFileMaybe(filePath);
        if (content && content.toLowerCase().includes(lowerQuery)) {
          let ts: number;
          try {
            const fileStat = await stat(filePath);
            ts = fileStat.mtimeMs;
          } catch {
            ts = Date.now();
          }
          return { content, source, path: filePath, ts };
        }
      }
    }

    return null;
  }

  private async readFileMaybe(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return null;
    }
  }
}

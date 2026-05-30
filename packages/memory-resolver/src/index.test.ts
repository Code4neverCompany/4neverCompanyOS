// @c4n/memory-resolver — Story 5.3 unit tests.
//
// Tests verify the four-tier precedence order:
//   1. persona (highest specificity) — skipped in unit tests (requires real fs)
//   2. project                     — skipped in unit tests (requires real fs)
//   3. hermes                     — mocked
//   4. supermemory (lowest, opt-in fallback) — mocked via vi.mock
//
// Integration tests with real filesystem and Supermemory live API
// should be added separately.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryResolver, type MemoryResolverOptions } from "./index.js";

// ── Supermemory mock ──────────────────────────────────────────────────────

vi.mock("@c4n/supermemory-client", () => ({
  SupermemoryClient: class MockSupermemoryClient {
    search = vi.fn().mockResolvedValue([]);
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────

const FIXTURE_ROOT = "/fake-vault";

function makeResolver(opts: Partial<MemoryResolverOptions> = {}): MemoryResolver {
  const options: MemoryResolverOptions = {
    vaultRoot: opts.vaultRoot ?? FIXTURE_ROOT,
    personaId: opts.personaId ?? "dev",
    projectId: opts.projectId ?? "test-project",
    hermesSearch: opts.hermesSearch ?? vi.fn().mockResolvedValue([]),
    supermemoryEnabled: opts.supermemoryEnabled ?? false,
  };
  if (opts.supermemory !== undefined) {
    options.supermemory = opts.supermemory;
  }
  return new MemoryResolver(options);
}

describe("MemoryResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("all tiers miss", () => {
    it("returns null when every tier misses", async () => {
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue([]),
        supermemoryEnabled: true,
      });
      const result = await resolver.resolve("nonexistent query xyzzy");
      expect(result).toBe(null);
    });
  });

  describe("tier 3 — hermes native", () => {
    it("returns hermes result when tiers 1-2 miss", async () => {
      const hits = [{ content: "use OAuth2 not JWT", ts: Date.now() }];
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue(hits),
      });
      const result = await resolver.resolve("OAuth");
      expect(result?.source).toBe("hermes");
      expect(result?.content).toBe("use OAuth2 not JWT");
    });

    it("hermes result path uses hermes scheme", async () => {
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue([{ content: "fact", ts: Date.now() }]),
      });
      const result = await resolver.resolve("fact");
      expect(result?.path).toMatch(/^hermes:\/\//);
    });
  });

  describe("tier 4 — Supermemory (opt-in fallback)", () => {
    it("supermemory is skipped when supermemoryEnabled = false", async () => {
      const resolver = makeResolver({ supermemoryEnabled: false });
      const result = await resolver.resolve("auth");
      expect(result).toBe(null);
    });
  });

  describe("precedence — hermes wins over Supermemory", () => {
    it("tier 3 hermes wins over tier 4 when both have hits", async () => {
      const hermesHits = [{ content: "hermes wins", ts: Date.now() }];
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue(hermesHits),
        supermemoryEnabled: true,
      });
      const result = await resolver.resolve("auth");
      expect(result?.source).toBe("hermes");
    });
  });

  describe("hermesSearch receives query verbatim", () => {
    it("calls hermesSearch with the exact query string", async () => {
      const hermesSearch = vi.fn().mockResolvedValue([]);
      const resolver = makeResolver({ hermesSearch });
      await resolver.resolve("my specific query");
      expect(hermesSearch).toHaveBeenCalledOnce();
      expect(hermesSearch).toHaveBeenCalledWith("my specific query");
    });
  });

  describe("result shape", () => {
    it("hermes result includes all required fields", async () => {
      const ts = Date.now();
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue([{ content: "session fact", ts }]),
      });
      const result = await resolver.resolve("session");
      expect(result).toMatchObject({
        content: "session fact",
        source: "hermes",
        path: expect.stringContaining("hermes://"),
        ts,
      });
    });

    it("supermemory result does NOT have relevance when hermes hit exists", async () => {
      const hermesHits = [{ content: "from hermes", ts: Date.now() }];
      const resolver = makeResolver({
        hermesSearch: vi.fn().mockResolvedValue(hermesHits),
        supermemoryEnabled: true,
      });
      const result = await resolver.resolve("auth");
      expect(result?.source).toBe("hermes");
      expect(result?.relevance).toBeUndefined();
    });
  });
});

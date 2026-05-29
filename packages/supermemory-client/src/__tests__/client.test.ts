// Unit tests for SupermemoryClient and pipeline helpers.
// Uses a mock fetch so no real API calls are made.

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { SupermemoryClient } from "../client.js";
import { SupermemoryError } from "../types.js";
import { injectSessionContext, flushSessionFacts } from "../pipeline.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown): Mock {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function makeClient(fetchFn: Mock): SupermemoryClient {
  return new SupermemoryClient({
    apiKey: "test-key",
    baseUrl: "https://mock.supermemory.test/v1",
    fetch: fetchFn as typeof globalThis.fetch,
  });
}

// ── SupermemoryClient ──────────────────────────────────────────────────────

describe("SupermemoryClient.add", () => {
  it("POSTs to /memories and returns the created record", async () => {
    const record = { id: "mem-1", content: "hello", spaces: ["persona:dev"], metadata: {} };
    const fetchFn = mockFetch(200, record);
    const client = makeClient(fetchFn);

    const result = await client.add("hello", { spaces: ["persona:dev"] });

    expect(result).toEqual(record);
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mock.supermemory.test/v1/memories");
    expect(init.method).toBe("POST");
    const bodyParsed = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(bodyParsed["content"]).toBe("hello");
    expect(bodyParsed["spaces"]).toEqual(["persona:dev"]);
  });

  it("sends the Bearer token in the Authorization header", async () => {
    const fetchFn = mockFetch(200, { id: "mem-2", content: "x", spaces: [], metadata: {} });
    const client = makeClient(fetchFn);
    await client.add("x");
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-key");
  });

  it("throws SupermemoryError on non-2xx", async () => {
    const fetchFn = mockFetch(401, { error: "unauthorized" });
    const client = makeClient(fetchFn);
    await expect(client.add("x")).rejects.toThrow(SupermemoryError);
    await expect(client.add("x")).rejects.toMatchObject({ status: 401 });
  });
});

describe("SupermemoryClient.search", () => {
  it("GETs /search with query params and returns results array", async () => {
    const results = [{ id: "m1", content: "result 1", score: 0.9, spaces: [], metadata: {} }];
    const fetchFn = mockFetch(200, { results });
    const client = makeClient(fetchFn);

    const out = await client.search("some query", { limit: 5, spaces: ["persona:dev"] });

    expect(out).toEqual(results);
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain("q=some+query");
    expect(url).toContain("limit=5");
    expect(url).toContain("spaces=persona%3Adev");
  });

  it("returns empty array when results key is absent", async () => {
    const fetchFn = mockFetch(200, {});
    const client = makeClient(fetchFn);
    const out = await client.search("query");
    expect(out).toEqual([]);
  });
});

describe("SupermemoryClient.delete", () => {
  it("sends DELETE to /memories/:id and resolves on 204", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    const client = makeClient(fetchFn);
    await expect(client.delete("mem-99")).resolves.toBeUndefined();
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://mock.supermemory.test/v1/memories/mem-99");
    expect(init.method).toBe("DELETE");
  });
});

// ── pipeline helpers ───────────────────────────────────────────────────────

describe("injectSessionContext", () => {
  let client: SupermemoryClient;
  let fetchFn: Mock;

  beforeEach(() => {
    fetchFn = mockFetch(200, {
      results: [
        { id: "m1", content: "Decisions use pnpm 11", score: 0.95, spaces: [], metadata: {} },
        { id: "m2", content: "Node 22.13 required", score: 0.8, spaces: [], metadata: {} },
      ],
    });
    client = makeClient(fetchFn);
  });

  it("searches using persona space + optional project space", async () => {
    await injectSessionContext(client, "dev", "setup toolchain", "proj-abc");
    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toContain("spaces=persona%3Adev");
    expect(url).toContain("spaces=project%3Aproj-abc");
  });

  it("returns a promptBlock with recalled memories", async () => {
    const ctx = await injectSessionContext(client, "dev", "setup toolchain");
    expect(ctx.personaId).toBe("dev");
    expect(ctx.memories).toHaveLength(2);
    expect(ctx.promptBlock).toContain("Recalled context");
    expect(ctx.promptBlock).toContain("Decisions use pnpm 11");
  });

  it("returns an empty promptBlock when no memories found", async () => {
    fetchFn.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    const ctx = await injectSessionContext(client, "dev", "query");
    expect(ctx.promptBlock).toBe("");
    expect(ctx.memories).toHaveLength(0);
  });
});

describe("flushSessionFacts", () => {
  it("adds one memory per fact with persona + project spaces", async () => {
    const fetchFn = mockFetch(200, { id: "x", content: "y", spaces: [], metadata: {} });
    const client = makeClient(fetchFn);

    await flushSessionFacts(client, {
      personaId: "dev",
      facts: ["fact A", "fact B", "fact C"],
      sessionAt: "2026-05-29T06:00:00Z",
      projectId: "proj-1",
    });

    expect(fetchFn).toHaveBeenCalledTimes(3);
    for (const call of fetchFn.mock.calls) {
      const [, init] = call as [string, RequestInit];
      const b = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(b["spaces"]).toContain("persona:dev");
      expect(b["spaces"]).toContain("project:proj-1");
      expect((b["metadata"] as Record<string, unknown>)["persona"]).toBe("dev");
    }
  });

  it("omits project space when projectId is not given", async () => {
    const fetchFn = mockFetch(200, { id: "x", content: "y", spaces: [], metadata: {} });
    const client = makeClient(fetchFn);
    await flushSessionFacts(client, {
      personaId: "architect",
      facts: ["sole fact"],
      sessionAt: "2026-05-29T06:00:00Z",
    });
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const b = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(b["spaces"]).toEqual(["persona:architect"]);
  });
});

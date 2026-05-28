// Story 1.19 — attribution single-source-of-truth guardrails.
//
// These tests are the safety net that keeps the three in-product
// attribution surfaces (wizard DoneStep, app-launch splash, Settings →
// About) honest: they all render from the same canonical data, so a
// drift here is caught before it reaches a surface.

import { describe, expect, it } from "vitest";
import {
  BUNDLED,
  INTEGRATED,
  renderAttributionText,
  renderAttributionMarkdown,
  renderAttributionShort,
} from "./attribution";
import { VERSIONS } from "./versions";

describe("attribution data integrity", () => {
  it("every BUNDLED entry has the required fields", () => {
    expect(BUNDLED.length).toBeGreaterThan(0);
    for (const e of BUNDLED) {
      expect(e.name, "name").toBeTruthy();
      expect(e.license, `license for ${e.name}`).toBeTruthy();
      expect(e.source, `source for ${e.name}`).toMatch(/^https?:\/\//);
    }
  });

  it("every INTEGRATED entry has the required fields", () => {
    expect(INTEGRATED.length).toBeGreaterThan(0);
    for (const e of INTEGRATED) {
      expect(e.name, "name").toBeTruthy();
      expect(e.license, `license for ${e.name}`).toBeTruthy();
      expect(e.source, `source for ${e.name}`).toMatch(/^https?:\/\//);
    }
  });

  it("has no duplicate component names across BUNDLED + INTEGRATED", () => {
    const names = [...BUNDLED, ...INTEGRATED].map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("VERSIONS coverage (Story 1.19 — Settings → About shows a version per bundled component)", () => {
  it("has a version string for every BUNDLED component", () => {
    for (const e of BUNDLED) {
      expect(VERSIONS[e.name], `VERSIONS missing for ${e.name}`).toBeTruthy();
    }
  });

  it("has no stray VERSIONS keys that don't map to a BUNDLED component", () => {
    // INTEGRATED tools are user-installed; their versions vary per machine
    // and are intentionally NOT pinned here. So every VERSIONS key must be
    // a BUNDLED name — a stray key signals a typo or a drifted entry.
    const bundledNames = new Set(BUNDLED.map((e) => e.name));
    for (const key of Object.keys(VERSIONS)) {
      expect(bundledNames.has(key), `stray VERSIONS key: ${key}`).toBe(true);
    }
  });
});

describe("renderAttributionText (existing — plain text for splash/clipboard)", () => {
  it("contains every bundled + integrated component name", () => {
    const text = renderAttributionText();
    for (const e of [...BUNDLED, ...INTEGRATED]) {
      expect(text, `text missing ${e.name}`).toContain(e.name);
    }
  });

  it("references LICENSES.md as the full-text pointer", () => {
    expect(renderAttributionText()).toContain("LICENSES.md");
  });
});

describe("renderAttributionShort (Story 1.19 — single-line splash + wizard credit)", () => {
  it("produces a single line (no newlines)", () => {
    expect(renderAttributionShort()).not.toContain("\n");
  });

  it("starts with 'Powered by' and names at least the first bundled components", () => {
    const short = renderAttributionShort();
    expect(short.startsWith("Powered by")).toBe(true);
    // The first few bundled upstreams are the headline credit.
    expect(short).toContain("Paperclip");
    expect(short).toContain("Hermes Agent");
    expect(short).toContain("BMAD Method");
  });

  it("respects a custom limit", () => {
    const two = renderAttributionShort(2);
    expect(two).toContain("Paperclip");
    expect(two).toContain("Hermes Agent");
    // With a limit of 2, later entries are elided behind an ellipsis.
    expect(two).toContain("…");
  });
});

describe("renderAttributionMarkdown (Story 1.19 — structured for React surfaces)", () => {
  it("returns a well-formed { bundled, integrated } structure", () => {
    const md = renderAttributionMarkdown();
    expect(Array.isArray(md.bundled)).toBe(true);
    expect(Array.isArray(md.integrated)).toBe(true);
    expect(md.bundled.length).toBe(BUNDLED.length);
    expect(md.integrated.length).toBe(INTEGRATED.length);
  });

  it("merges the version string into each bundled row", () => {
    const md = renderAttributionMarkdown();
    for (const row of md.bundled) {
      expect(row.name).toBeTruthy();
      expect(row.license).toBeTruthy();
      expect(row.source).toMatch(/^https?:\/\//);
      expect(row.version, `version for ${row.name}`).toBeTruthy();
    }
  });

  it("integrated rows carry name/license/source but no pinned version", () => {
    const md = renderAttributionMarkdown();
    for (const row of md.integrated) {
      expect(row.name).toBeTruthy();
      expect(row.license).toBeTruthy();
      expect(row.source).toMatch(/^https?:\/\//);
      expect("version" in row).toBe(false);
    }
  });
});

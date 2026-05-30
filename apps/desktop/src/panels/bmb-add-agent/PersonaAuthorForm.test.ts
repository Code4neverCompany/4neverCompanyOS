// PersonaAuthorForm — Story 3.10 unit tests.
//
// Tests the pure-function layer of the authoring form: validation logic
// and the slugify helper. These run in vitest without a browser/DOM
// (the component itself requires Tauri invoke which is not available in
// the test environment).

import { describe, it, expect } from "vitest";
import { slugifyName, validateAuthorForm } from "./PersonaAuthorForm";

// ── slugifyName ──────────────────────────────────────────────────────

describe("slugifyName", () => {
  it("lowercases and replaces spaces with dashes", () => {
    expect(slugifyName("DB Architect")).toBe("db-architect");
  });

  it("collapses consecutive separators", () => {
    expect(slugifyName("My  Custom  Agent")).toBe("my-custom-agent");
  });

  it("strips leading/trailing dashes", () => {
    expect(slugifyName(" Foo Bar ")).toBe("foo-bar");
  });

  it("replaces non-alphanumeric chars with dashes and strips trailing dashes", () => {
    // The slug strips leading AND trailing dashes after collapsing runs.
    expect(slugifyName("QA/Reviewer (v2)!")).toBe("qa-reviewer-v2");
    expect(slugifyName("Test!")).toBe("test");
  });

  it("returns empty string for all-special input", () => {
    // "!!!" → "---" → "-" → "" after stripping leading/trailing dashes.
    // Callers check slug.length > 0 before saving.
    expect(slugifyName("!!!")).toBe("");
  });

  it("produces different slugs for similar names (no collision)", () => {
    expect(slugifyName("DB Architect")).not.toBe(slugifyName("DB Designer"));
    expect(slugifyName("Security Auditor")).not.toBe(slugifyName("Security Reviewer"));
  });
});

// ── validateAuthorForm ───────────────────────────────────────────────

describe("validateAuthorForm", () => {
  const VALID_BASE = {
    name: "Security Auditor",
    roleDescription: "Audits the codebase for vulnerabilities.",
    cli: "claude" as const,
    customBin: "",
    lifecycle: "persistent" as const,
    vaultScope: "shared" as const,
  };

  it("returns null for a fully valid form", () => {
    expect(validateAuthorForm(VALID_BASE)).toBeNull();
  });

  it("rejects empty name", () => {
    expect(validateAuthorForm({ ...VALID_BASE, name: "" })).toBe("Enter a persona name.");
    expect(validateAuthorForm({ ...VALID_BASE, name: "   " })).toBe("Enter a persona name.");
  });

  it("rejects name that slugifies to empty string", () => {
    // "!!!" slugifies to "" (all special chars stripped), so the
    // slug-length guard fires and returns the alphanumeric error.
    const error = validateAuthorForm({ ...VALID_BASE, name: "!!!" });
    expect(error).toBe("Name must contain at least one alphanumeric character.");
  });

  it("rejects empty role description", () => {
    expect(validateAuthorForm({ ...VALID_BASE, roleDescription: "" })).toBe(
      "Enter a role description.",
    );
    expect(validateAuthorForm({ ...VALID_BASE, roleDescription: "   " })).toBe(
      "Enter a role description.",
    );
  });

  it("rejects custom CLI without a binary name", () => {
    expect(validateAuthorForm({ ...VALID_BASE, cli: "custom", customBin: "" })).toBe(
      "Enter a custom binary name.",
    );
    expect(validateAuthorForm({ ...VALID_BASE, cli: "custom", customBin: "   " })).toBe(
      "Enter a custom binary name.",
    );
  });

  it("accepts custom CLI with a binary name", () => {
    expect(validateAuthorForm({ ...VALID_BASE, cli: "custom", customBin: "gemini" })).toBeNull();
  });

  it("accepts all CLI variants when binary is not needed", () => {
    for (const cli of ["claude", "agy", "hermes"] as const) {
      expect(validateAuthorForm({ ...VALID_BASE, cli })).toBeNull();
    }
  });

  it("accepts both lifecycle variants", () => {
    expect(validateAuthorForm({ ...VALID_BASE, lifecycle: "ephemeral" })).toBeNull();
    expect(validateAuthorForm({ ...VALID_BASE, lifecycle: "persistent" })).toBeNull();
  });

  it("accepts both vault scope variants", () => {
    expect(validateAuthorForm({ ...VALID_BASE, vaultScope: "isolated" })).toBeNull();
    expect(validateAuthorForm({ ...VALID_BASE, vaultScope: "shared" })).toBeNull();
  });
});

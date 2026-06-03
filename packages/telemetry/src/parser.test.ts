// @c4n/telemetry parser tests — covers the on-disk JSONL shape written
// by the Rust persona-supervisor (crates/persona-supervisor/src/lib.rs:139).

import { describe, it, expect } from "vitest";
import { parseJsonl, type LogEntry } from "./parser.js";

const SHAPE: LogEntry = { ts: 1_716_700_000_000, level: "info", line: "hello" };

describe("parseJsonl", () => {
  it("parses a single well-formed line", () => {
    const text = JSON.stringify(SHAPE);
    const { entries, errors } = parseJsonl(text);
    expect(errors).toHaveLength(0);
    expect(entries).toEqual([SHAPE]);
  });

  it("parses multiple lines and tolerates CRLF", () => {
    const text = [
      JSON.stringify({ ts: 100, level: "info", line: "first" }),
      JSON.stringify({ ts: 200, level: "info", line: "second" }),
    ].join("\r\n");
    const { entries, errors } = parseJsonl(text);
    expect(errors).toHaveLength(0);
    expect(entries).toEqual([
      { ts: 100, level: "info", line: "first" },
      { ts: 200, level: "info", line: "second" },
    ]);
  });

  it("skips blank lines silently", () => {
    const text = [
      JSON.stringify(SHAPE),
      "",
      "   ",
      JSON.stringify({ ts: 999, level: "info", line: "later" }),
    ].join("\n");
    const { entries, errors } = parseJsonl(text);
    expect(errors).toHaveLength(0);
    expect(entries).toHaveLength(2);
    expect(entries[1]?.line).toBe("later");
  });

  it("accepts string-form timestamps (Rust's u128 emits as a number; this guards future migrations)", () => {
    const text = JSON.stringify({ ts: "1716700000000", level: "info", line: "str-ts" });
    const { entries, errors } = parseJsonl(text);
    expect(errors).toHaveLength(0);
    expect(entries[0]?.ts).toBe(1_716_700_000_000);
  });

  it("collects parse errors with line numbers and a raw preview", () => {
    const good = JSON.stringify(SHAPE);
    const text = [good, "not json at all", JSON.stringify({ ts: 1, level: "info" })].join("\n");
    const { entries, errors } = parseJsonl(text);
    expect(entries).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.lineNumber).toBe(2);
    expect(errors[0]?.raw).toBe("not json at all");
    expect(errors[0]?.message).toMatch(/JSON/i);
    // Line 3 is missing the `line` field — that's a structural error,
    // not a JSON error, so the message reflects that.
    expect(errors[1]?.lineNumber).toBe(3);
    expect(errors[1]?.message).toMatch(/missing required fields/);
  });

  it("returns empty results for an empty file", () => {
    const { entries, errors } = parseJsonl("");
    expect(entries).toEqual([]);
    expect(errors).toEqual([]);
  });
});

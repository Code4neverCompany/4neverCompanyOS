// @c4n/observability logger tests — focus on the contract, not the sink.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createLogger, setLogSink, type LogRecord } from "./logger.js";

interface Captured {
  records: LogRecord[];
}

let captured: Captured;

beforeEach(() => {
  captured = { records: [] };
  setLogSink((rec) => captured.records.push(rec));
});

afterEach(() => {
  setLogSink(null);
});

describe("createLogger", () => {
  it("auto-prefixes the package name on every record", () => {
    const log = createLogger("@c4n/desktop");
    log.info("ready");
    log.error("oops");
    expect(captured.records).toHaveLength(2);
    expect(captured.records[0].target).toBe("@c4n/desktop");
    expect(captured.records[1].target).toBe("@c4n/desktop");
  });

  it("emits the right level per method", () => {
    const log = createLogger("test");
    log.trace("a");
    log.debug("b");
    log.info("c");
    log.warn("d");
    log.error("e");
    const levels = captured.records.map((r) => r.level);
    expect(levels).toEqual(["trace", "debug", "info", "warn", "error"]);
  });

  it("includes structured fields when supplied", () => {
    const log = createLogger("test");
    log.info("spawned", { persona: "dev", ttlMs: 30000 });
    const [rec] = captured.records;
    expect(rec.msg).toBe("spawned");
    expect(rec.fields).toEqual({ persona: "dev", ttlMs: 30000 });
  });

  it("omits the fields key when none are supplied", () => {
    const log = createLogger("test");
    log.info("no-fields");
    const [rec] = captured.records;
    expect(rec.fields).toBeUndefined();
  });

  it("stamps a unix-ms timestamp on every record", () => {
    const before = Date.now();
    const log = createLogger("test");
    log.info("now");
    const after = Date.now();
    const [rec] = captured.records;
    expect(rec.ts).toBeGreaterThanOrEqual(before);
    expect(rec.ts).toBeLessThanOrEqual(after);
  });
});

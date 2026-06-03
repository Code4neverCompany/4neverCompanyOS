// @c4n/observability tracing tests.

import { describe, it, expect } from "vitest";
import { startSpan, type Span } from "./tracing.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("startSpan", () => {
  it("opens with a name, target, and startTs", () => {
    const span = startSpan("spawn-persona", "@c4n/desktop");
    expect(span.name).toBe("spawn-persona");
    expect(span.target).toBe("@c4n/desktop");
    expect(span.startTs).toBeGreaterThan(0);
    expect(span.endTs).toBeNull();
    expect(span.open).toBe(true);
    span.end();
  });

  it("end() stamps durMs and closes the span", async () => {
    const span = startSpan("work", "test");
    await delay(15);
    span.end();
    expect(span.open).toBe(false);
    expect(span.endTs).not.toBeNull();
    expect(typeof span.fields["durMs"]).toBe("number");
    expect(span.fields["durMs"] as number).toBeGreaterThanOrEqual(10);
  });

  it("fail() marks the span as failed and records duration", () => {
    const span = startSpan("work", "test");
    span.fail({ reason: "boom" });
    expect(span.fields["failed"]).toBe(true);
    expect(span.fields["reason"]).toBe("boom");
    expect(span.fields["durMs"]).toBeTypeOf("number");
    expect(span.open).toBe(false);
  });

  it("ignores subsequent end/fail calls (idempotent)", () => {
    const span: Span = startSpan("once", "test");
    span.end({ stage: "first" });
    const firstEndTs = span.endTs;
    span.end({ stage: "second" }); // should be a no-op
    expect(span.endTs).toBe(firstEndTs);
    expect(span.fields["stage"]).toBe("first");
  });

  it("accepts pre-set fields at construction time", () => {
    const span = startSpan("create-aggregate", "@c4n/telemetry", {
      fields: { personaId: "hermes", entries: 12 },
    });
    expect(span.fields["personaId"]).toBe("hermes");
    expect(span.fields["entries"]).toBe(12);
    span.end();
  });
});

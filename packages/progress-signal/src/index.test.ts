// Tests for `ProgressBus` instance independence (Story 4.5 / D-4 → D-12 injection).
//
// Coverage:
//   ✓ Two independently-constructed `ProgressBusImpl` instances have
//     independent listener sets — emitting on one is invisible to the
//     other.
//   ✓ The `defaultProgressBus` alias and the deprecated `ProgressBus`
//     alias point at the same singleton (so the deprecation does not
//     silently change behavior for existing call sites).
//   ✓ `subscribe` returns an unsubscribe function that, when called,
//     removes the listener.
//   ✓ Listener exceptions do not stop the rest of the bus from
//     dispatching (existing invariant — kept intact by the refactor).

import { describe, expect, it } from "vitest";
import { defaultProgressBus, ProgressBus, ProgressBusImpl } from "./index";

describe("ProgressBusImpl — instance independence", () => {
  it("two instances have independent listener sets", () => {
    const a = new ProgressBusImpl();
    const b = new ProgressBusImpl();

    const aSeen: string[] = [];
    const bSeen: string[] = [];

    a.subscribe((s) => aSeen.push(s.path));
    b.subscribe((s) => bSeen.push(s.path));

    a.emit({ kind: "artifact.changed", path: "/vault/a.md", ts: 1 });
    expect(aSeen).toEqual(["/vault/a.md"]);
    // b did not see the emission — the bus is a per-instance abstraction.
    expect(bSeen).toEqual([]);

    b.emit({ kind: "code.changed", path: "/repo/main.ts", ts: 2 });
    expect(bSeen).toEqual(["/repo/main.ts"]);
    // a still only saw its own emission.
    expect(aSeen).toEqual(["/vault/a.md"]);
  });

  it("subscribe returns an unsubscribe function that detaches the listener", () => {
    const bus = new ProgressBusImpl();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe((s) => seen.push(s.path));

    bus.emit({ kind: "story.state", path: "first", ts: 1 });
    expect(seen).toEqual(["first"]);

    unsubscribe();
    bus.emit({ kind: "story.state", path: "second", ts: 2 });
    expect(seen).toEqual(["first"]); // not ["first", "second"]
  });

  it("a throwing listener does not stop the bus from dispatching to other listeners", () => {
    const bus = new ProgressBusImpl();
    const ok: string[] = [];
    bus.subscribe(() => {
      throw new Error("boom");
    });
    bus.subscribe((s) => ok.push(s.path));

    // Both listeners are invoked; the throw is swallowed inside emit().
    bus.emit({ kind: "artifact.changed", path: "/x", ts: 1 });
    expect(ok).toEqual(["/x"]);
  });
});

describe("defaultProgressBus / ProgressBus aliases", () => {
  it("the deprecated ProgressBus alias points at defaultProgressBus", () => {
    expect(ProgressBus).toBe(defaultProgressBus);
  });

  it("defaultProgressBus is a ProgressBusImpl instance", () => {
    expect(defaultProgressBus).toBeInstanceOf(ProgressBusImpl);
  });
});

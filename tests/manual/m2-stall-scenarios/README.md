# M2 Stall-Detection Validation Corpus (Story 2.17)

> Validates the **SM-4** M2 exit criterion: the stall detector's behaviour is
> demonstrably correct on a known set of ≥ 10 scenarios mixing "should
> intervene" and "should not intervene".

## What this is

The detector under test is `@c4n/stall-detector` (`packages/stall-detector`,
shipped in `b63ca20`). It watches `@c4n/progress-signal`'s `ProgressBus` over a
rolling window and declares a **stall** when the window elapses with zero
progress signals (`artifact.changed` / `code.changed` / `story.state`). A stall
**clears** (resume) when a new signal arrives.

Each scenario below documents its **setup**, the **expected detector behaviour**
(intervene = declare stall, or not), and **why**. The scenarios are also encoded
as a deterministic, executable spec in [`corpus.test.ts`](./corpus.test.ts) so
the "manual run" is reproducible — fake timers drive a scaled 5 s window / 0.5 s
poll, exercising the exact same `silence >= windowMs` boundary logic as the 5-min
production default.

## How to run

From the repo root:

```
pnpm --filter @c4n/stall-detector exec vitest run \
  --root "$PWD" tests/manual/m2-stall-scenarios/corpus.test.ts
```

(On Windows PowerShell, pass the absolute repo path for `--root` and the test
file, e.g. `--root "I:/c4n-4neverCompanyOS" "I:/c4n-4neverCompanyOS/tests/manual/m2-stall-scenarios/corpus.test.ts"`.)

This file lives under `tests/manual/` and is intentionally **outside** the
default `pnpm test` include set — it is a manual/on-demand verification protocol,
not a CI gate.

## Scenarios

### Should INTERVENE (stall expected)

| #   | Slug                       | Setup                                                                                 | Expected                                                                        | Why                                                                                                     |
| --- | -------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| S1  | `cold-start-total-silence` | Persona spawns, emits no progress signal at all for longer than one window.           | **Stall** declared once; `lastSignal` is `null`.                                | The canonical dead-on-arrival case — nothing ever happened.                                             |
| S2  | `spawn-burst-then-silence` | A burst of 3 early artifact writes (scaffolding), then total silence past the window. | **Stall** declared once; stall event's `lastSignal` is the last burst artifact. | Early activity must not buy indefinite credit; the window is rolling, not cumulative.                   |
| S3  | `chatter-without-progress` | Persona streams terminal chatter the whole time but writes no artifact/code/story.    | **Stall** declared once.                                                        | **Core SM-4 case.** Chatter is not a progress signal — only file/story changes are. Talking ≠ progress. |
| S4  | `persona-crash-mid-task`   | Two `code.changed` signals, then the process dies → permanent silence.                | **Stall** declared once; `lastSignal.kind === "code.changed"`.                  | A crash looks like silence to the detector; it must still intervene after a healthy start.              |
| S5  | `exact-window-boundary`    | One signal, then silence reaching **exactly** `windowMs`.                             | **Stall** declared once.                                                        | Documents that the threshold is inclusive (`silence >= windowMs`). The boundary itself counts.          |

### Should NOT intervene (no stall)

| #   | Slug                             | Setup                                                                             | Expected                                          | Why                                                                                                         |
| --- | -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| S6  | `steady-artifact-stream`         | An artifact every 0.4× window for 8 cycles (span ≫ one window).                   | **No stall.**                                     | Healthy steady output keeps resetting the window — the happy path.                                          |
| S7  | `productive-multi-kind-exchange` | Rotating `artifact` / `code` / `story.state` signals every 0.5× window, 9 cycles. | **No stall.**                                     | All three signal kinds must equally keep the window alive.                                                  |
| S8  | `signal-just-before-expiry`      | Advance to (window − poll), emit one signal, advance another (window − poll).     | **No stall**, despite total elapsed > one window. | A just-in-time signal resets the window; no single gap reaches the threshold.                               |
| S9  | `slow-but-steady-near-threshold` | A signal every **0.9× window**, 6 cycles.                                         | **No stall.**                                     | The near-threshold case: slow but genuine progress must not trip the detector. Drives tuning (OQ-E / OQ-H). |

### Lifecycle: INTERVENE then RESUME

| #   | Slug                 | Setup                                                           | Expected                                                                       | Why                                                                                                    |
| --- | -------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| S10 | `resume-after-stall` | Silence past the window → stall; then a fresh artifact arrives. | **Stall** declared, then **resume** fires and `isStalling` returns to `false`. | The full intervention lifecycle: a recovered persona must clear the stall so Hermes stops intervening. |

## Mix summary

- **Should intervene:** 6 (S1–S5, S10)
- **Should not intervene:** 4 (S6–S9)
- **Total:** 10 ✓ (SM-4 requires ≥ 10)

## Run record

| Run date   | Window / Poll        | Result                     | Pass rate                   |
| ---------- | -------------------- | -------------------------- | --------------------------- |
| 2026-05-29 | 5 s / 0.5 s (scaled) | 10/10 passed on first pass | **100%** (≥ 80% target met) |

All scenarios produced their expected outcome on the first pass, so no
threshold tuning was forced by failures. The near-threshold scenario (S9, gaps at
0.9× window) confirms the current `>= windowMs` rule has adequate margin against
false positives for slow-but-genuine progress. See
[`docs/progress-signal-taxonomy.md`](../../../docs/progress-signal-taxonomy.md)
for the recorded threshold recommendation that Story 2.18 builds on.

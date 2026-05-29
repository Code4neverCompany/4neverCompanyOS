# Progress-signal taxonomy & stall threshold

> Records the stall-detection threshold recommendation validated by the M2
> scenario corpus (Story 2.17), and seeds the signal/intervention taxonomy that
> Story 2.18 expands (pause / redirect / action).
>
> Validates PRD success metric **SM-4** (stall detector behaviour demonstrably
> correct on a known set).

## Threshold recommendation (Story 2.17)

The `@c4n/stall-detector` rolling window (algorithm D-5) declares a stall when

```
silence_since_last_progress_signal >= windowMs
```

evaluated every `pollIntervalMs`. Progress signals are `artifact.changed`,
`code.changed`, and `story.state` only — terminal chatter is **not** progress.

**Recommended values (M2 default):**

| Parameter        | Value               | Rationale                                                                                                                                                            |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `windowMs`       | **300_000** (5 min) | Long enough that slow-but-genuine work (S9: gaps at 0.9× window) never trips it, short enough that a dead/looping persona is caught within one human attention span. |
| `pollIntervalMs` | **10_000** (10 s)   | Bounds detection latency to ≤ `windowMs + pollIntervalMs`; cheap to evaluate.                                                                                        |

These are the values shipped in `packages/stall-detector` (`b63ca20`) and are
**retained unchanged** — the validation corpus passed 10/10 on the first run, so
no failure forced a retune.

### Evidence

The 10-scenario corpus in [`tests/manual/m2-stall-scenarios/`](../tests/manual/m2-stall-scenarios/README.md)
exercises both sides of the boundary with a scaled 5 s / 0.5 s clock that
preserves the same `>= windowMs` inclusivity:

- **Should intervene (6):** total silence, burst-then-silence, chatter-without-progress, mid-task crash, exact-window-boundary, and stall-then-resume.
- **Should not intervene (4):** steady stream, multi-kind exchange, just-before-expiry, and slow-but-steady at 0.9× window.

Run record: **10/10 passed, 100%** (≥ 80% acceptance target), 2026-05-29.

### Tuning notes (OQ-E / OQ-H)

- The decisive margin is scenario **S9** (gaps at 0.9× window → no stall) vs.
  **S5** (silence exactly at the window → stall). The 5-min window keeps a
  comfortable gap between "slow human-paced agent" and "stuck agent". If field
  use shows healthy personas pausing > ~4.5 min between artifacts (e.g. long
  build/test steps that emit no file changes), raise `windowMs` rather than
  adding signal types, to avoid false positives.
- If detection feels too slow in practice, lower `pollIntervalMs` first
  (latency) before lowering `windowMs` (sensitivity) — the latter risks the S9
  false-positive class.
- Open question for M4: should `story.state` carry more weight than file churn?
  Deferred until story-level signals (Story 4.5) exist.

## Intervention taxonomy — _Story 2.18 scope_

> The full **pause / redirect / action** intervention taxonomy (what Hermes does
> once a stall is declared) is owned by Story 2.18 and will be written here. This
> section is a placeholder so the threshold record above and the 2.18 taxonomy
> live in one document, as the Story 2.17 acceptance criteria require.

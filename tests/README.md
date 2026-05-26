# tests/

Workspace-level tests. Per-package unit tests live alongside source inside each `packages/*` or `crates/*` directory.

## Layout

```
tests/
  e2e/
    fixtures/   shared test data
    scenarios/  Playwright (M4+) and manual e2e flows
  manual/
    m1-exit-criterion-recording.md   (Story 1.18 — 10-min install scenario)
    m2-stall-scenarios/              (Story 2.17 — ≥10 stall-detection scenarios)
    m4-greenfield-runs/              (Story 4.7 — three greenfield-fullstack runs)
    m5-round-trip-runs/              (Story 5.5 — Win → Mac → Linux continuity)
```

## When to add an e2e test

- A milestone exit criterion that needs end-to-end proof (M1 ≤10-min install, M4 single-session greenfield, M5 round-trip).
- A bug surfaced in a stress test (M3 100-cycle ephemeral cleanup, NFR-Performance baselines).
- A regression captured during sprint review.

# Integration: 4neverCompany OS hardening sprint — round 1

This branch merges five feature branches that landed in the M1.5 hardening
sprint. All five were independently accepted; this integration verifies they
work together.

## Branches merged

- feature/workflow-yaml-refactor — workflow engine reads BMAD YAMLs at
  runtime, ProgressBus is class-instantiable, stub packages shipped
- feature/observability-perf — new observability package, telemetry
  consumer, notify-based workflow vault wait, bus backpressure policy
- feature/security-hardening — testable credential storage, vault
  scope events, cross-persona pty path validation
- feature/ci-supply-chain — two-lane CI lockfile, weekly supply-chain
  audit, CycloneDX SBOM, non-silent release error handling
- feature/repo-dx — gitignore, CONTRIBUTING/CHANGELOG/SECURITY,
  lefthook, 5 ADRs, HANDOFF path fix

## Conflict resolutions (round 1)

- packages/workflow-engine/src/engine.ts: combined imports — keep the
  modern bus API (defaultProgressBus, ProgressBusImpl) AND add the
  observability logger.
- packages/workflow-engine/src/engine.test.ts: kept HEAD's 4 test
  cases (artifact polling + approval gates + bus injection), appended
  observability's 4 cases (notify-based fast-clear + dispose/pause
  leak regressions).
- packages/telemetry/src/index.ts: took observability side wholesale —
  its parser+aggregator+consumer is strictly better than the
  core-refactor stub.
- crates/vault-scoping/src/lib.rs: the test for the multi-persona
  write logger loop had two equivalent for-loops. Took the security
  side's cleaner form (no unused enumerate index).
- deliverable.md: removed both per-task worker deliverables — they
  belonged to the worktree state, not the integration.

## Verification

Run the full test matrix to confirm no regressions. CI lane will gate
future integrations.

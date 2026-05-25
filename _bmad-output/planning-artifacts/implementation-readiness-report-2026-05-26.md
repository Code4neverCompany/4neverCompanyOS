---
title: 4neverCompany OS — Implementation Readiness Report
date: 2026-05-26
assessor: bmad-check-implementation-readiness (partial — Fast path, run manually by Architect Winston given no epics/UX exist yet)
scope: PRD ↔ Architecture alignment (full); Epic coverage / UX alignment / Epic quality (BLOCKED — artifacts not yet produced)
inputs:
  - _bmad-output/planning-artifacts/prds/prd-c4n-4neverCompanyOS-2026-05-25/prd.md (status: final)
  - _bmad-output/planning-artifacts/architecture.md (status: complete)
  - _bmad-output/planning-artifacts/briefs/brief-c4n-4neverCompanyOS-2026-05-25/brief.md (status: approved-tier1)
verdict: NEEDS WORK before Phase 4 — but only the missing-artifact kind (epics + UX), not the alignment kind
---

# Implementation Readiness — 4neverCompany OS

> Generated 2026-05-26. This is a **partial readiness check** run because two of the artifacts the skill normally validates (epics-and-stories listing, UX spec) have not yet been produced. The scope of what *can* be assessed (PRD↔Architecture alignment) is run in full; the rest is explicitly marked BLOCKED with the action that unblocks it.

---

## 1. Document Discovery

Artifacts found in `_bmad-output/planning-artifacts/`:

| Artifact | File | Status | Source-extractable? |
|---|---|---|---|
| Project Brief | `briefs/brief-c4n-4neverCompanyOS-2026-05-25/brief.md` | approved-tier1 | ✓ |
| Brief Addendum | `briefs/brief-c4n-4neverCompanyOS-2026-05-25/addendum.md` | (companion) | ✓ |
| PRD | `prds/prd-c4n-4neverCompanyOS-2026-05-25/prd.md` | final | ✓ |
| PRD Rubric Review | `prds/prd-c4n-4neverCompanyOS-2026-05-25/review-rubric.md` | (reference) | ✓ (all findings applied) |
| Architecture | `architecture.md` | complete | ✓ |
| **UX Specification** | — | — | ✗ **MISSING** (explicitly skipped — see decision below) |
| **Epics & Stories** | — | — | ✗ **MISSING** (Bob / Scrum Master stage not yet run) |

**Decisions captured in upstream `.decision-log.md` files that this report relies on:**
- Primary persona: solo dev + AI-tooling power user (Tier 1).
- Success metrics: engineering exit criteria only, M1–M5 (Tier 1).
- Desktop shell: Tauri + M0 spike (Tier 2 / OQ-C).
- Repo: monorepo + pnpm workspaces (Tier 2 / OQ-I).
- Version pinning: M0 research + quarterly cadence (Tier 2 / OQ-J).
- License audit: LICENSES.md as M0 deliverable (Tier 2 / OQ-K).
- UX-design stage explicitly skipped for v1 (per Winston session decision; product is power-user / internal-tool; PRD UJ-1..UJ-7 carry the user-facing flow).

---

## 2. PRD Analysis

### Functional Requirements Extracted

The PRD defines **37 globally-numbered FRs** across 11 feature groups. Full enumeration:

| FR | Title | Feature group |
|---|---|---|
| FR-1 | Single-installer provisioning | 4.1 Installer & First-Run Wizard |
| FR-2 | First-run wizard credential collection | 4.1 |
| FR-3 | Obsidian vault location selection | 4.1 |
| FR-4 | Dev persona spawn | 4.2 Fixed Persona Spawning |
| FR-5 | Frontend Designer persona spawn | 4.2 |
| FR-6 | Fixed personas survive desktop-app restart | 4.2 |
| FR-7 | BMB "Add Agent" panel | 4.3 Dynamic Persona Spawning |
| FR-8 | Lifecycle selection at spawn time | 4.3 |
| FR-9 | Persistent dynamic agents get terminal + vault dir | 4.3 |
| FR-10 | Ephemeral agents run one task and exit cleanly | 4.3 |
| FR-11 | Custom persona authoring and reuse | 4.3 |
| FR-12 | Hermes proposes persona spawns with rationale | 4.4 Hermes-Initiated |
| FR-13 | User approval required before spawn | 4.4 |
| FR-14 | Promotion path ephemeral → persistent | 4.4 |
| FR-15 | Pub/sub bus carries peer-to-peer agent messages | 4.5 Bus & Stall Detection |
| FR-16 | Bus state survives Paperclip restart | 4.5 |
| FR-17 | UI channel view per project | 4.5 |
| FR-18 | Progress-based stall detection | 4.5 |
| FR-19 | User can pause / redirect any persona | 4.5 |
| FR-20 | Persona file → tool config projection | 4.6 Persona-File Sync |
| FR-21 | Tool config → persona file backflow | 4.6 |
| FR-22 | One Zellij pane per persistent persona | 4.7 Multi-Terminal View |
| FR-23 | Attach/detach without killing processes | 4.7 |
| FR-24 | Hermes TUI embedded | 4.7 |
| FR-25 | "Start a BMAD project" entry point | 4.8 BMAD Workflow Execution |
| FR-26 | Workflow phases spawn personas at the right moments | 4.8 |
| FR-27 | Workflow can pause, app close, reopen, resume | 4.8 |
| FR-28 | `brownfield` workflow supported | 4.8 |
| FR-29 | Per-persona scoped vault directory | 4.9 Memory Tiers |
| FR-30 | Project-wide vault | 4.9 |
| FR-31 | Supermemory integration — opt-in per content category | 4.9 |
| FR-32 | Memory tier precedence | 4.9 |
| FR-33 | Sync configs and artifacts to GitHub | 4.10 GitHub Sync |
| FR-34 | Cross-machine continuity | 4.10 |
| FR-35 | Windows installer (`.exe`) | 4.11 Cross-Platform Distribution |
| FR-36 | macOS installer (`.dmg`) | 4.11 |
| FR-37 | Linux installer | 4.11 |

**Total FRs: 37.** Contiguous numbering, no gaps, no duplicates (per PRD rubric mechanical notes).

### Non-Functional Requirements Extracted

PRD §10 defines six cross-cutting NFRs:

| NFR | Category | Concrete bound |
|---|---|---|
| NFR-Performance | resource | ≤300 MB resident memory / ≤500 input tokens per hour per idle agent (AS-9) |
| NFR-Reliability | runtime | Zellij session-resume + zero orphans after ephemeral exit |
| NFR-Security | trust | Sandboxing leans on each backing CLI's permission model; formal security review M3↔M4 |
| NFR-Observability | telemetry | Per-persona token-cost telemetry from M2; structured JSON logs; per-persona log file |
| NFR-Resilience-to-Upstream-Churn | maintenance | ~10% capacity per milestone reserved for rebases |
| NFR-Headless-Scriptability | CLI | All actions scriptable; CLIs on system path |

### Additional Constraints

PRD §11 — Safety, Privacy, Cost guardrails:
- Safety: no spawn without lifecycle; no silent cost runaway; no surprise bus interventions.
- Privacy: local-first; opt-in cloud per category; credentials in owning CLI.
- Cost: liberal bus + bounded agents; per-persona budgets from M2 telemetry; project-level kill switch.

PRD §12 — Integration & Dependencies table names 10 upstream components with their roles, pinning policy, and upstream-risk profile.

### PRD Completeness Assessment

PRD passed the rubric walker (`review-rubric.md`) on 2026-05-25 with all 10 findings applied. Status: `final`. Zero remaining `N seconds`/`N ms` placeholders; AS-1..AS-9 assumptions all indexed; 13 OQs surfaced and tracked, of which 4 (OQ-C, OQ-I, OQ-J, OQ-K) were resolved at the PRD level before Architect started, and 3 more (OQ-A, OQ-B, OQ-G partial) were resolved by architectural decisions (D-6, D-8, D-9).

PRD is implementation-grade for downstream artifacts.

---

## 3. Epic Coverage Validation

**STATUS: BLOCKED.** No epics-and-stories listing exists yet. The Scrum Master (Bob) persona has not run.

**What this would have checked:** that every PRD FR appears in at least one epic, that no orphan FR exists, and that no epic references a non-existent FR.

**What can be inferred without epics:**
- Every FR has a delivering milestone in PRD §15 Release Plan (M0–M5 column).
- Every FR has a delivering crate/package in Architecture §6 "Requirements → Structure Mapping" table.
- So **the architectural surface** for full FR coverage exists; what's missing is the **story breakdown** that translates each FR into Dev-executable work.

**Action to unblock:** run `bmad-create-epics-and-stories` (Bob / Scrum Master). Will produce `_bmad-output/planning-artifacts/epics-and-stories.md` (or similar). After that artifact exists, re-run the readiness check.

---

## 4. UX Alignment

**STATUS: BLOCKED BY DESIGN.** No UX-spec artifact exists; UX-design stage was **explicitly skipped** for v1 in this session.

**Rationale for skipping:** product is power-user / internal-tool, not consumer. The PRD's 7 user journeys (UJ-1..UJ-7) carry the user-facing flow with enough specificity that downstream consumers (Architect, SM) can source-extract from them directly. Architect produced architecture without UX input and flagged no UX-blocked decisions.

**What this would have checked:** that every UJ maps to UX-spec screens; that UI components named in the UX spec have implementations defined architecturally; that accessibility / responsive / animation requirements are addressed.

**Risk of skipping:** when M3 lands the BMad Builder "Add Agent" panel (FR-7) and M4 lands workflow visualization (FR-25/26), the team will be authoring genuinely-new UI without a UX spec. The PRD's UJ-5 (Add Agent flow) is the most prescriptive — it lists steps 1–5 of the user's path — but does not specify visual hierarchy, color, copy, or interaction details.

**Mitigation in place:** PRD's UJ-1..UJ-7 are written narratively enough that Dev + Frontend Designer (the two fixed personas building the product) can author the UI inline during M3 / M4 with the user reviewing each panel before it locks in.

**If you want to unblock this for real:** run `bmad-create-ux-design` (Sally / UX Designer) before M3. Otherwise accept the inline-UX-design path explicitly.

---

## 5. Epic Quality Review

**STATUS: BLOCKED.** Same root cause as §3 — no epics-and-stories listing exists. Re-run after `bmad-create-epics-and-stories`.

---

## 6. PRD ↔ Architecture Alignment (the part we CAN assess in full)

This is the heart of what's checkable today. Cross-walk:

### Coverage matrix — every FR has at least one architectural home

| FR(s) | Architecture coverage | Lives in |
|---|---|---|
| FR-1 | Tauri bundler (D-15) + CI release workflow | `scripts/build-installer.sh`, `.github/workflows/release.yml` |
| FR-2 | Wizard app + credential storage abstractions (D-9, D-14) | `apps/wizard/`, `packages/credential-storage/` |
| FR-3 | Wizard + vault layout spec (OQ-N) | `apps/wizard/`, `docs/vault-layout.md`, `packages/vault-layout/` |
| FR-4, FR-5, FR-6 | Zellij adapter + persona-supervisor (D-2) | `crates/zellij-adapter/`, `crates/persona-supervisor/` |
| FR-7 | BMB Add-Agent panel (D-13 portal injection) | `apps/desktop/src/panels/bmb-add-agent/` |
| FR-8, FR-9, FR-10 | Lifecycle types in core + Zellij adapter | `packages/core/`, `crates/zellij-adapter/` |
| FR-11 | Persona-sync custom-module path | `packages/persona-sync/`, `_bmad/custom/` |
| FR-12, FR-13 | Approval-prompt panel + bus subscription | `apps/desktop/src/panels/approval-prompt/`, `packages/bus-client/` |
| FR-14 | Workflow-engine spawn-count tracker | `packages/workflow-engine/` |
| FR-15, FR-16, FR-17 | Bus relay (D-3) | `crates/bus-relay/`, `packages/bus-client/`, `apps/desktop/src/panels/bus-channel-view/` |
| FR-18 | Progress signals (D-4) + stall detector (D-5) | `packages/progress-signal/`, `packages/stall-detector/` |
| FR-19 | Persona-supervisor pause command | `crates/persona-supervisor/` |
| FR-20, FR-21 | Persona-sync (D-6) | `packages/persona-sync/`, `crates/platform-fs/` |
| FR-22, FR-23 | Multi-terminal panel + Zellij adapter | `apps/desktop/src/panels/multi-terminal/`, `crates/zellij-adapter/` |
| FR-24 | Hermes TUI pane in multi-terminal | `apps/desktop/src/panels/multi-terminal/` |
| FR-25, FR-26, FR-27, FR-28 | Workflow engine (D-12) | `packages/workflow-engine/` |
| FR-29 | Vault-scoping crate (D-7) | `crates/vault-scoping/` |
| FR-30 | Vault layout spec (OQ-N) | `packages/vault-layout/`, `docs/vault-layout.md` |
| FR-31 | Supermemory client | `packages/supermemory-client/` |
| FR-32 | Memory precedence (D-8) | `docs/memory-precedence.md`, `packages/core/` |
| FR-33, FR-34 | GitHub-sync package | `packages/github-sync/` |
| FR-35 | Windows installer via Tauri bundler (D-15) | Same as FR-1 |
| FR-36, FR-37 | macOS + Linux via Tauri bundler (D-15) | Same as FR-1 |

**Result: 37 of 37 FRs (100%) have a documented architectural home in the architecture document's §6 Project Structure.**

### Coverage matrix — every NFR has an architectural mechanism

| NFR | Mechanism | Lives in |
|---|---|---|
| NFR-Performance | Telemetry tap (D-11) baselines from M2 | `packages/telemetry/`, instrumented per persona-supervisor |
| NFR-Reliability | Zellij session-resume (D-2) + clean ephemeral exit | `crates/zellij-adapter/`, `crates/persona-supervisor/` |
| NFR-Security | Per-CLI permission model (D-9), best-effort vault scoping (D-7), security review M3↔M4 | `packages/credential-storage/`, `crates/vault-scoping/` |
| NFR-Observability | Telemetry tap (D-11), structured JSON logs, per-persona log files | `packages/telemetry/`, vault per-persona log dirs |
| NFR-Resilience-to-Upstream-Churn | Vendored services + workspace SQLite isolation (D-10) + quarterly rebase | `services/`, workspace SQLite, `scripts/pin-upstream-versions.sh` |
| NFR-Headless-Scriptability | All CLIs on system path; HTTP endpoints documented | `apps/wizard/` HTTP server, environment setup |

**Result: 6 of 6 NFRs have an architectural mechanism.**

### OQ resolution status

| OQ | Resolved at | By |
|---|---|---|
| OQ-A persona-file/tool-config conflict rules | Architecture D-6 | Last-writer-wins + per-persona conflict log |
| OQ-B memory-tier precedence | Architecture D-8 | Persona dir → project vault → Hermes → Supermemory; draft M3, finalize M5 |
| OQ-C Tauri vs Electron | PRD Tier 2 + Architecture | Tauri + M0 spike + Electron fallback |
| OQ-D Hermes auto-approve policy | Deferred to M3 detail design (OQ remains open) | PM stage at M3 kickoff |
| OQ-E stall-window default value | Deferred to M2 calibration (OQ remains open) | PM + Architect at M2 |
| OQ-F Hot-load vs reload of BMAD modules | Deferred to M3 (OQ remains open) | Architect at M3 kickoff |
| OQ-G Credential storage policy | Architecture D-9 | Each CLI's own model + OS keychain for Supermemory/GitHub |
| OQ-H Stall-window weighting | Same as OQ-E | M2 |
| OQ-N Vault directory layout | Acknowledged as M1 deliverable (OQ remains open) | PM + Architect at M1 |
| OQ-I monorepo vs multi-repo | PRD Tier 2 | Monorepo with pnpm workspaces |
| OQ-J version pinning | PRD Tier 2 | Architect at M0; quarterly cadence |
| OQ-K license audit | PRD Tier 2 | LICENSES.md at M0 |
| OQ-L team size + budget | Tier 3 — deferred (OQ remains open) | User decision |
| OQ-M attribution + contribution-back | Tier 4 — deferred (OQ remains open) | User decision |

**Resolved by Architect: 4 (OQ-A, OQ-B, OQ-G, plus OQ-C/I/J/K confirmed at PRD level).** **Open at M0 entry: 6** (OQ-D, OQ-E, OQ-F, OQ-H, OQ-N, OQ-L, OQ-M) — none of which block M0 start.

### Architecture gap mirror

Architecture §7 listed 4 important gaps (G-1..G-4) and 3 nice-to-have gaps (G-5..G-7). All have explicit owners and revisit milestones. None block M0 start. Cross-checked against PRD here: each gap aligns with a known PRD OQ:

- G-1 (M0 Tauri spike) ↔ OQ-C resolution (already committed; spike validates)
- G-2 (M1 vault layout) ↔ OQ-N (open at M1)
- G-3 (Antigravity re-verification) ↔ already in source brief §9 risk register
- G-4 (M2 stall-window calibration) ↔ OQ-E, OQ-H

---

## 7. Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK before Phase 4 (Dev/QA implementation begins) — but only in the "missing-artifact" sense, not the "alignment" sense.**

- ✅ **PRD ↔ Architecture alignment: READY.** Every FR has an architectural home; every NFR has a mechanism; every PRD-surfaced OQ is either resolved or has a delivering milestone with an owner.
- ⚠️ **Epics & Stories: MISSING.** Scrum Master (Bob) stage has not run. Dev cannot execute against PRD + Architecture alone — story files are the missing intermediate.
- ⚠️ **UX Spec: SKIPPED (explicit decision).** Acceptable for v1 power-user product; inline UX during M3/M4 with user review as the mitigation.

### Critical Issues Requiring Immediate Action

**Before M0 work can begin:** none. M0's scope (Tauri spike, LICENSES.md, pinned-versions.md, monorepo scaffolding, CI baseline) does not require story files.

**Before M1 stories can be written:**
1. **Run `bmad-create-epics-and-stories`** (Scrum Master / Bob) to produce the epic-and-story listing. Story files are what Dev/QA execute.
2. **Produce OQ-N vault directory layout spec** (`docs/vault-layout.md`) at M1 start, before any M1 story that touches the vault is written. Owner: PM + Architect.

### Recommended Next Steps

1. **Approve this architecture (`status: complete`)** and the PRD↔Architecture alignment finding here.
2. **Decide on Scrum Master timing:** in this session, or next session. The architecture is buildable as-is; SM can run at any point before Dev work starts.
3. **At M0 kickoff:** run the Tauri/WebView2 spike (G-1), produce `LICENSES.md` (OQ-K), produce `pinned-versions.md` (OQ-J), scaffold the monorepo per architecture §6 (OQ-I).
4. **At M1 kickoff:** produce `docs/vault-layout.md` (OQ-N) before M1 stories. Make the wizard mini-spec a follow-up artifact per build plan.
5. **At M2 kickoff:** re-verify Antigravity CLI public-preview status (G-3) before Frontend-Designer ships; design the bus protocol schema as a one-pager before any bus code (per build plan follow-up artifacts list).

### Final Note

This assessment validated **PRD↔Architecture alignment is implementation-ready**. The two BLOCKED steps (Epic Coverage, Epic Quality) and one SKIPPED step (UX Alignment) are not failures of the artifacts produced — they're correctly-identified missing or deferred artifacts in the pipeline.

For the parts that exist, the verdict is **READY**. To get to a green-light implementation readiness check, run Bob (Scrum Master) and re-run this report.

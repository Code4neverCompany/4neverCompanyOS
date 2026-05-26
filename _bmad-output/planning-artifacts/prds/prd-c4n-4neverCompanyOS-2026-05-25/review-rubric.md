# PRD Quality Review — 4neverCompany OS

## Overall verdict

This is a strong chain-top PRD: the thesis is unambiguous (the bundle _is_ the product), feature groups are organized by user-visible capability rather than by upstream component, and every FR carries at least one testable consequence and a milestone home. The main risks are concentrated in Done-ness clarity — several FRs lean on placeholder thresholds (`N seconds`, `N ms`, `N MB`, "documented vault layout") that defer real numbers to Architect, and a handful of cross-cutting policies (FR-21 conflict rules, FR-32 precedence, FR-3 vault layout) point at "separate spec" without naming a deliverable owner. Substance, scope honesty, and strategic coherence are all solid for the stakes; the PRD is buildable as-is by an Architect who is comfortable absorbing those placeholders.

## Decision-readiness — strong

The PRD treats decisions as decisions, not as soft preferences. § 1 Vision states explicitly what the product is _not_ ("not a new orchestrator, not a new methodology, not a fork") rather than smoothing those into neutral framing. § 5 Non-Goals is unusually load-bearing — it names the deferred personas, the absent user-facing metrics, and the no-marketplace decision and ties each one back to a Tier 1 lock. § 7 Success Metrics doubles down: the PRD names that "v1 success is defined exclusively by the build-plan engineering exit criteria" and adds counter-metrics (SM-C1, SM-C2, SM-C3) that explicitly say "do not optimize this." That kind of honesty is rare and earns trust.

Trade-offs are surfaced rather than dodged. § 12 Integration & Dependencies names upstream risk per component ("Antigravity CLI — Public preview as of May 2026; RCE issue reported May 2026 — verify state at M2 start"). § 11.3 Cost frames the bus-liberal vs. agents-not-liberal trade as a guardrail rather than a wishful "we'll be careful." Open Questions in § 8 are genuinely open — each has an owner and a revisit milestone.

The `[NOTE FOR PM]` callouts (FR-2, FR-3, FR-7, FR-13, FR-20, FR-21, FR-29) land on real tensions (credential storage, hot-load vs. reload, conflict rules) not on safe checkpoints. No findings here.

## Substance over theater — strong

No persona theater (one primary persona, explicit non-users including the deferred v2 personas — and the decision log shows the PM was instructed by Tier 1 lock to keep it to one). No vision theater — § 1 Vision could not swap into a different PRD because the phrase "two fixed persona agents — Dev on Claude Code and Frontend Designer on Antigravity CLI" is product-specific in a way no other product can claim. No NFR theater — § 10 NFR-Performance names a _category_ of measurement (idle MB, tokens/hour) and explicitly tags the threshold as a tunable to be baselined at M2; NFR-Security names a specific position ("Sandboxing leans on each backing CLI's own permission model — Workspace does not invent a parallel permission model") rather than copy-pasting "must be secure."

The invented sections (§ 12 Integration & Dependencies, § 15 Release Plan) are earned — they directly serve the product's thesis (the bundle is integration; FRs must land somewhere). The Glossary (§ 3) is substantive: each term has a specific role in downstream FR text rather than reading as a vocabulary list. No findings here.

## Strategic coherence — strong

The PRD has a thesis and the features serve it. The thesis: _the friction of stitching Paperclip + Hermes + BMAD + Zellij + Obsidian into a working agent workspace is the problem worth removing for the solo-dev power user; the bundle (installer + first-run wizard + dynamic-spawn UI + bus + vault layout + sync) is the product._ That thesis is asserted in § 1 Vision and § 13 Why Now, and every one of the eleven feature groups maps to a piece of that bundle. There is no "list of capabilities someone wanted" feel.

Feature prioritization follows from the thesis. M1's exit criterion ("under 10 minutes from clean install to working Dev agent") is the headline activation moment for the primary persona — and FR-1, FR-2, FR-3, FR-4, FR-22 all serve that moment. M2's "second agent + bus" is the smallest unit of "this is a multi-agent product." M3's "dynamic spawn + BMB minimal" is when the product earns its name. M4's `greenfield-fullstack` is the day-one win. M5's memory + collab is what makes the workspace stick. Each phase has a coherent reason to be where it is.

Success metrics validate the thesis at each phase rather than measuring activity in general. SM-1 (the 10-minute install) is exactly the activation event the primary persona JTBD #1 names. Counter-metrics name the failure modes that would destroy the thesis if optimized for. No findings here.

## Done-ness clarity — adequate

This is the weakest dimension and the one downstream story creation will trip on. The PRD's FR structure is right — every FR has a "Consequences (testable)" block — but the _numbers_ in those consequences are routinely placeholders. Specifically:

- FR-4: "within N seconds of project open. [ASSUMPTION: N ≤ 5s — Architect to confirm]"
- FR-5: "within N seconds of project open"
- FR-15: "within N ms. [ASSUMPTION: N ≤ 500ms — Architect to confirm]"
- FR-16: "last N messages... [ASSUMPTION: 1000 — Architect / source review to confirm]"
- FR-17: "within N ms of bus delivery" (no assumption at all — just N)
- FR-19: "within N seconds"
- FR-20: "within N seconds. [NOTE FOR PM: confirm propagation latency requirement with Architect]"
- FR-21: "within N seconds"
- NFR-Performance: "≤ N MB resident memory per agent at idle and ≤ M tokens per agent per hour"

This is honest — the PRD is explicit that these are tunables — but it pushes a lot of definitional load onto the Architect. SM creating stories against FR-15 cannot write an acceptance criterion stronger than "bus delivery is fast" until N is fixed. The pattern is fine for the _Architect-facing_ tier of FRs (FR-15, FR-16, NFR-Performance — true Architect tuning), but riskier for the _user-facing_ tier (FR-4 spawn time, FR-17 UI latency, FR-19 pause latency, FR-20/21 sync propagation) where the right number is a UX call.

Several FRs also lean on language softer than the rest of the PRD warrants. FR-1 says "without manual intervention beyond the wizard prompts" — what counts as manual intervention vs. a wizard prompt? FR-3 says vault is scaffolded "with the documented directory layout" but the layout is itself an undelivered artifact (NOTE FOR PM acknowledges this). FR-6 says "the same scrollback the user left" — does that survive Zellij version upgrades? FR-29 says personas "cannot write outside their scoped dir" but acknowledges enforcement depends on each CLI's permission model — so the FR may be aspirational depending on what the Architect can actually enforce.

Conversely, several FRs are excellent on done-ness: FR-10 ("After 100 spawn/exit cycles, zero orphan processes remain"), FR-14 ("After 3 ephemeral spawns of the same persona type"), FR-18 ("validated against a corpus of ≥10 manual test scenarios"), FR-28 ("on at least one real test repo"), FR-34 (Windows → push → pull on macOS → open). These show the team knows how to write done-ness; the placeholders are a _Fast path_ artifact, not a capability gap.

### Findings

- **[high]** UI-facing latency placeholders unresolved (§ 4.2 FR-4, § 4.5 FR-17/FR-19, § 4.6 FR-20/FR-21). These FRs cite "within N seconds/ms" but the right number for user-perceived latency is a UX/PM judgment, not an Architect one. Defer-to-Architect leaves SMs unable to write a sharper acceptance criterion than "feels fast." _Fix:_ either set an initial target value with "Architect may revise downward" framing (e.g. FR-4 ≤5s, FR-17 ≤200ms, FR-19 ≤2s, FR-20/21 ≤30s), or add a NOTE FOR PM to OQ-E-style "M2 baselines this" workstream so a deliverable exists.
- **[medium]** FR-1 acceptance is loose on "without manual intervention beyond the wizard prompts" (§ 4.1 FR-1). The wizard _is_ manual intervention; the FR risks being un-testable. _Fix:_ enumerate the prompt set the wizard owns (model API keys, OAuth, vault location, optional Supermemory, optional GitHub) and assert "no other system dialogs, terminal prompts, or installer choices."
- **[medium]** FR-3 ("vault scaffolded with documented directory layout") depends on an undelivered artifact (§ 4.1 FR-3). The NOTE FOR PM acknowledges the vault directory layout doc is "a separate M1 deliverable" but it has no owner, no name, no place in the Release Plan or Open Questions. SM will need this before writing M1 stories. _Fix:_ add an Open Question (OQ-N) "Vault directory layout spec" with owner = PM + Architect, revisit = before M1 start, and reference it from FR-3, FR-29, FR-30.
- **[medium]** FR-29 sandboxing claim may exceed enforceability (§ 4.9 FR-29). "Personas cannot write outside their scoped dir" is stated as a testable consequence but the NOTE FOR PM admits enforcement depends on each CLI's permission model. If Claude Code or `agy` can write anywhere by design, this FR is aspirational, not testable. _Fix:_ downgrade the consequence to "writes outside scope are detected and logged; enforcement is best-effort per CLI permission model" and lift the harder version to a future enforcement story.
- **[medium]** NFR-Performance has no initial bounds (§ 10 NFR-Performance). Idle memory and tokens/hour are flagged as tunable, but a PRD-level upper bound (even loose) gives Architect a target. _Fix:_ set an initial ceiling — e.g. "≤300 MB resident per idle agent; ≤500 input tokens/hour per idle agent" — labeled as "starting target; revise after M2 baseline."
- **[low]** FR-6 "the same scrollback" is fuzzy (§ 4.2 FR-6). Bounded — last N lines, until Zellij upgrade, etc.? _Fix:_ "scrollback to the limit of the underlying Zellij session" or "≥ last 1000 lines."
- **[low]** FR-13 "configurable window (default: 24 hours)" — is this a per-proposal expiration or a system-wide default? (§ 4.4 FR-13). _Fix:_ clarify scope of the configurability.

## Scope honesty — strong

Omissions are not silent. § 2.3 Non-Users (v1) explicitly carves out the four cohorts the product won't serve in v1 — teams of 4+, mobile/browser, SaaS users, marketplace browsers — and adds the deferred-personas carve-out from the Tier 1 lock. § 5 Non-Goals re-states these in product-feature terms and adds the "no user-facing metrics" non-goal that some PMs would have hidden. § 6.2 "Out of Scope for MVP" gives a third pass at items that _could_ have crept in (workflow forking, custom workflow authoring via BMB, real-time multi-user).

[ASSUMPTION] tags exist on the right kind of claim (AS-1 platform parity, AS-2 spawn latency, AS-3 bus latency, AS-4 bus retention, AS-5 stall-window default) and all five are indexed in § 9 — roundtrip is clean. [NOTE FOR PM] callouts are concentrated at the right places (credential storage, sync conflict rules, sandbox enforcement, etc.) — not at safe checkpoints.

Open-items density (13 OQs + 5 AS + 7 NOTE FOR PM callouts) is _high_ in absolute terms but appropriate given (a) this is a chain-top PRD with five downstream consumers (Architect, SM, Dev, QA, UX), (b) Tier 2 inheritance from the brief, and (c) Fast path posture. The PRD is explicit that OQ-C/I/J/K block Architect-stage start — not PM-stage. That framing is correct.

One small honesty gap: the "documented vault directory layout" referenced by FR-3, FR-29, FR-30 lives in a phrase "separate M1 deliverable, per build plan" but does not appear in the Release Plan table or Open Questions. See finding [medium] in Done-ness above.

## Downstream usability — adequate

This is chain-top, so the bar is high. Most things work:

- Glossary is single-source. Spot-check: "Persona," "Fixed Persona," "Dynamic Persona," "Lifecycle," "Vault," "Zellij Pane," "Tool Config" are used verbatim across the PRD. No synonyms creep in.
- FR IDs are contiguous FR-1 through FR-37 with no gaps. UJ IDs are UJ-1 through UJ-7, also contiguous. SM IDs are SM-1 through SM-7 plus SM-C1 through SM-C3. AS IDs are AS-1 through AS-5. OQ IDs are OQ-A through OQ-M (skipping nothing).
- Every UJ ends with a "Realizes: FR-X, FR-Y" line — Architect can lift any UJ in isolation and find its FR coverage.
- Cross-references mostly resolve. UJ-1 → FR-1/2/3/4/22 (all valid). UJ-2 → FR-25/26/27 (all valid). UJ-7 → FR-33/34 (valid). FR-21 → OQ-A (valid). FR-32 → OQ-B (valid).
- Each major section makes sense pulled out alone — § 4.5 (Bus & Stall) cites Hermes, Vault, Stall, Progress Signal as defined Glossary terms; no "see above" references.

What's at risk:

- Several FR/UJ cross-references are slightly incomplete. UJ-2 (BMAD `greenfield-fullstack`) realizes "FR-25, FR-26, FR-27, and FRs across the persona / bus / memory feature groups" — the "and FRs across..." escape hatch defeats the cross-reference. The UJ actually exercises FR-4, FR-5, FR-7, FR-8, FR-9, FR-12, FR-15, FR-25, FR-26, FR-30 at minimum. SM looking at UJ-2 to drive stories would need to enumerate those manually.
- UJ-3 (free-form project) realizes "FR-4, FR-5, FR-22, FR-23 — and any dynamic-spawn FRs Hermes uses mid-flow" — same escape-hatch pattern.
- FR-32 cross-refs OQ-B but the OQ-B revisit ("can begin draft as soon as M3 lands") is M5-late; precedence rules might be needed earlier than M5 by anyone testing multi-tier memory in M3 dynamic-spawn scenarios. Worth a flag.
- The Release Plan in § 15 is excellent — every FR has a delivering milestone — but it does not surface FR coverage per UJ. A "milestone × UJ" view would help SM plan which UJ a given milestone makes testable.
- SM-3 cites "NFR-Performance" but NFR-Performance has no specific bound — see Done-ness finding [medium].

### Findings

- **[high]** UJ → FR mapping uses escape-hatch language (§ 2.4 UJ-2, UJ-3). "and FRs across the persona / bus / memory feature groups" defeats SM's ability to source-extract. UJ-2 in particular is the headline workflow and needs every realized FR enumerated. _Fix:_ in UJ-2 list FR-4, FR-5, FR-7, FR-8, FR-9, FR-12, FR-15, FR-25, FR-26, FR-30 (and any others the workflow touches); in UJ-3 enumerate the dynamic-spawn FRs Hermes is expected to use (likely FR-7, FR-8, FR-9, FR-12 as the spawn primitives).
- **[medium]** SM-3 references NFR-Performance which has no concrete bound (§ 7 SM-3). "Idling pair does not burn significant tokens" is a feel-based criterion. _Fix:_ tie SM-3 to whatever initial NFR-Performance ceiling lands from the previous finding.
- **[low]** OQ-B (memory tier precedence) is owned at M5 but cross-tier interactions may surface earlier (§ 8 OQ-B). _Fix:_ note that draft precedence is needed when M3 spawns Architect/PM personas that read project context; current language allows it.

## Shape fit — strong

The PRD's shape matches the product. This is a chain-top internal/power-user dev tool, single-operator (the user _is_ the operator), and the PRD is appropriately structured: substantive UJs (because the product has real workflows even for one user), full Glossary (because downstream chain depth makes vocabulary discipline non-optional), invented Integration & Dependencies section (because the bundle _is_ integration), invented Release Plan (because FR→milestone mapping is what downstream needs).

The PRD is not over-formalized: UJs are seven, not twenty; FRs are 37 across 11 feature groups, not 80 across 25. The PRD is not under-formalized: NFRs, Constraints & Guardrails (Safety / Privacy / Cost), and the Release Plan all show up where a thinner PRD might have skipped them.

The Fast path posture shows in good ways (no editorial polish ceremony, [ASSUMPTION] tags accepted as deferrals) rather than bad ways (no missing sections, no rushed FRs). The 5-8 page target for internal-tool stakes is exceeded (~14 pages by my count) but the length is earned by the 11 feature groups, not by padding — and chain-top status justifies the extra depth.

No findings.

## Mechanical notes

- **Glossary drift.** Light. The Glossary distinguishes "Workflow" (BMAD YAML recipe) but the PRD uses "workflow" lowercase as a generic noun in some FRs (FR-25 "the workspace begins executing it" — the "it" is a workflow, not a "Workflow" — fine, but watch FR-27 "A workflow in progress" — should be capitalized if Glossary-bound). Minor.
- **ID continuity.** FR-1 through FR-37 contiguous, no duplicates. UJ-1 through UJ-7. SM-1 through SM-7 + SM-C1 through SM-C3. AS-1 through AS-5. OQ-A through OQ-M (no gaps). Clean.
- **Cross-reference resolution.** Spot-checked: FR-21 → OQ-A (resolves), FR-32 → OQ-B (resolves), FR-13 → § 8 (resolves to OQ-D), FR-35 → OQ-C (resolves). UJ realization lists all reference valid FR IDs. Clean.
- **Assumptions Index roundtrip.** AS-1 through AS-5 — every inline [ASSUMPTION] (FR-1 macOS/Linux parity, FR-4 5s, FR-15 500ms, FR-16 1000 messages, FR-18 stall window default) appears in § 9. Also clean: FR-17 has "within N ms" without an [ASSUMPTION] tag — should be tagged or have its N replaced; FR-19, FR-20, FR-21 have "within N seconds" without [ASSUMPTION] tags. Recommend adding tags so the index reflects all open numerics.
- **UJ persona linkage.** All seven UJs name "Solo developer" or "Solo dev" — the primary persona from § 2.1. Linkage is by description, not by exact persona label ("The solo developer who is also an AI-tooling power user"). Adequate; consider one canonical persona label for cleaner cross-reference (e.g., "Solo Dev Power User" as the Glossary persona shorthand).
- **Required sections.** Essential Spine present (Vision, Target User, Glossary, Features, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index). Adapt-In additions all present and earned (NFRs, Constraints & Guardrails, Integration & Dependencies, Why Now, Platform, Release Plan).
- **Untagged placeholder counts.** FR-17, FR-19, FR-20, FR-21 use "within N" without an [ASSUMPTION] tag, so the Assumptions Index undercount those open numerics. Recommend adding tags.

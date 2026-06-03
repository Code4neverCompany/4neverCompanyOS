// Tests for the BMAD YAML loader (Story 4.1 / D-12).
//
// Coverage:
//   ✓ A well-formed YAML (synthesized inline) parses, validates, and
//     converts to engine-shaped phases with the synthetic fields
//     (`bmad_phase`, `phase_skills`, `governance_gate`) populated.
//   ✓ The real `_bmad/bmm/workflows/greenfield-fullstack.yaml` and
//     `_bmad/bmm/workflows/brownfield.yaml` both parse and produce the
//     expected phase count. This is the regression guard that catches
//     drift between the canonical BMAD YAMLs and the engine's Zod schema.
//   ✓ A deliberately malformed YAML throws a `WorkflowLoadError` with
//     a clear message in each failure mode (empty body, syntax error,
//     missing required field, unknown field via `.strict()`, wrong type).
//   ✓ The real-world `greenfield-fullstack.yaml` faithfully converts
//     to the engine's `WorkflowPhase` shape — the synthetic fields are
//     derived from phase context, not copied from the YAML.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertToEnginePhases, loadWorkflowFromYaml, WorkflowLoadError } from "./loader";

// `__dirname` is not available in pure ESM; the standard pattern is to
// derive it from `import.meta.url`. We use it to locate the real BMAD
// YAMLs in the repo root (so the regression guard always runs against
// the canonical source of truth, not a copy in the test fixture).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SAMPLE_GREENFIELD = `name: greenfield-fullstack
description: End-to-end BMAD workflow for greenfield projects.
version: "1.0"
phases:
  - id: brief
    label: Brief
    description: Analyst interrogates the idea and produces a project brief.
    personas:
      - name: Analyst
        backing_cli: claude
        lifecycle: ephemeral
        task_prompt: >
          You are the Analyst persona. Output the brief to
          vault/projects/{project_id}/bmad/01-brief.md
    artifact:
      path: vault/projects/{project_id}/bmad/01-brief.md
      description: Project brief (markdown)
    approval_required: true
  - id: implementation
    label: Implementation
    description: Dev and Frontend Designer implement the code skeleton.
    personas:
      - name: Dev
        backing_cli: claude
        lifecycle: persistent
        task_prompt: Implement the stories.
      - name: Frontend Designer
        backing_cli: aggy
        lifecycle: persistent
        task_prompt: Style the UI.
    artifact:
      path: vault/projects/{project_id}/bmad/05-implementation.md
      description: Implementation status summary
    approval_required: true
`;

const REAL_GREENFIELD_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "_bmad",
  "bmm",
  "workflows",
  "greenfield-fullstack.yaml",
);
const REAL_BROWNFIELD_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "_bmad",
  "bmm",
  "workflows",
  "brownfield.yaml",
);

function readRepoFile(path: string): string {
  return readFileSync(path, "utf8");
}

describe("loadWorkflowFromYaml — happy path (synthesized fixture)", () => {
  it("parses a minimal valid workflow and returns engine-shaped phases", () => {
    const result = loadWorkflowFromYaml(SAMPLE_GREENFIELD);
    expect(result.workflow.name).toBe("greenfield-fullstack");
    expect(result.phases).toHaveLength(2);

    const brief = result.phases[0];
    expect(brief.id).toBe("brief");
    expect(brief.label).toBe("Brief");
    expect(brief.artifact.path).toBe("vault/projects/{project_id}/bmad/01-brief.md");
    expect(brief.approval_required).toBe(true);
    // Synthetic engine-only field — always present after conversion.
    expect(brief.governance_gate).toBe(true);

    const analyst = brief.personas[0];
    expect(analyst.name).toBe("Analyst");
    expect(analyst.backing_cli).toBe("claude");
    expect(analyst.lifecycle).toBe("ephemeral");
    // Engine derives bmad_phase from phase.label; phase_skills default to []. The
    // pre-refactor hard-coded engine kept `phase_skills: []` for analysts that
    // were not in its hand-maintained map.
    expect(analyst.bmad_phase).toBe("Brief");
    expect(analyst.phase_skills).toEqual([]);
  });

  it("handles multiple personas in one phase and preserves the aggy enum", () => {
    const result = loadWorkflowFromYaml(SAMPLE_GREENFIELD);
    const implementation = result.phases[1];
    expect(implementation.id).toBe("implementation");
    expect(implementation.personas).toHaveLength(2);

    const dev = implementation.personas[0];
    expect(dev.name).toBe("Dev");
    expect(dev.backing_cli).toBe("claude");

    const designer = implementation.personas[1];
    expect(designer.name).toBe("Frontend Designer");
    expect(designer.backing_cli).toBe("aggy");
  });
});

describe("loadWorkflowFromYaml — real BMAD YAMLs parse cleanly", () => {
  it("greenfield-fullstack.yaml parses with 6 phases", () => {
    const body = readRepoFile(REAL_GREENFIELD_PATH);
    const result = loadWorkflowFromYaml(body);
    expect(result.workflow.name).toBe("greenfield-fullstack");
    expect(result.phases.map((p) => p.id)).toEqual([
      "brief",
      "plan",
      "architecture",
      "solutioning",
      "implementation",
      "qa",
    ]);

    const implementation = result.phases[4];
    // Implementation phase has 2 personas (Dev + Frontend Designer).
    expect(implementation.personas).toHaveLength(2);
    // Frontend Designer is the only aggy user in the workflow.
    expect(implementation.personas.some((p) => p.backing_cli === "aggy")).toBe(true);

    // QA phase has approval_required = true.
    const qa = result.phases[5];
    expect(qa.approval_required).toBe(true);
  });

  it("brownfield.yaml parses with 3 phases and the last phase has approval_required = false", () => {
    const body = readRepoFile(REAL_BROWNFIELD_PATH);
    const result = loadWorkflowFromYaml(body);
    expect(result.workflow.name).toBe("brownfield");
    expect(result.phases.map((p) => p.id)).toEqual(["ingest", "analyze", "refactor-plan"]);

    const refactorPlan = result.phases[2];
    expect(refactorPlan.approval_required).toBe(false);
  });
});

describe("loadWorkflowFromYaml — failure modes throw WorkflowLoadError", () => {
  it("rejects an empty body", () => {
    expect(() => loadWorkflowFromYaml("")).toThrow(WorkflowLoadError);
    expect(() => loadWorkflowFromYaml("   \n  ")).toThrow(/empty/i);
  });

  it("rejects a YAML syntax error", () => {
    const bad = "name: x\nphases:\n  - id: brief\n   label: oops"; // bad indent
    expect(() => loadWorkflowFromYaml(bad)).toThrow(WorkflowLoadError);
    expect(() => loadWorkflowFromYaml(bad)).toThrow(/YAML parse error/);
  });

  it("rejects a non-mapping top level (scalar)", () => {
    expect(() => loadWorkflowFromYaml("just a string")).toThrow(WorkflowLoadError);
    expect(() => loadWorkflowFromYaml("just a string")).toThrow(/must be a mapping/);
  });

  it("rejects an array at the top level", () => {
    expect(() => loadWorkflowFromYaml("- one\n- two")).toThrow(WorkflowLoadError);
  });

  it("rejects when approval_required is missing", () => {
    const body = `name: x
description: y
version: "1.0"
phases:
  - id: brief
    label: Brief
    description: d
    personas:
      - { name: a, backing_cli: claude, lifecycle: ephemeral, task_prompt: t }
    artifact: { path: p, description: d }
`;
    expect(() => loadWorkflowFromYaml(body)).toThrow(WorkflowLoadError);
  });

  it("rejects an unknown field at the top level via strict mode", () => {
    const body = `name: x
description: y
version: "1.0"
novelty: true
phases:
  - id: brief
    label: Brief
    description: d
    personas:
      - { name: a, backing_cli: claude, lifecycle: ephemeral, task_prompt: t }
    artifact: { path: p, description: d }
    approval_required: true
`;
    expect(() => loadWorkflowFromYaml(body)).toThrow(/novelty/);
  });

  it("rejects an invalid backing_cli enum value", () => {
    const body = `name: x
description: y
version: "1.0"
phases:
  - id: brief
    label: Brief
    description: d
    personas:
      - { name: a, backing_cli: gemini, lifecycle: ephemeral, task_prompt: t }
    artifact: { path: p, description: d }
    approval_required: true
`;
    expect(() => loadWorkflowFromYaml(body)).toThrow(/backing_cli|gemini/);
  });

  it("rejects an invalid lifecycle value", () => {
    const body = `name: x
description: y
version: "1.0"
phases:
  - id: brief
    label: Brief
    description: d
    personas:
      - { name: a, backing_cli: claude, lifecycle: once, task_prompt: t }
    artifact: { path: p, description: d }
    approval_required: true
`;
    expect(() => loadWorkflowFromYaml(body)).toThrow(/lifecycle/);
  });
});

describe("convertToEnginePhases — pure conversion", () => {
  it("synthesizes governance_gate, bmad_phase, and phase_skills", () => {
    // Same input shape as Zod output, so we can call convertToEnginePhases
    // directly without re-parsing.
    const result = convertToEnginePhases({
      name: "demo",
      description: "demo workflow",
      version: "1.0",
      phases: [
        {
          id: "p1",
          label: "Phase One",
          description: "first phase",
          personas: [
            {
              name: "Worker",
              backing_cli: "claude",
              lifecycle: "ephemeral",
              task_prompt: "do the thing",
            },
          ],
          artifact: { path: "vault/x.md", description: "the x" },
          approval_required: false,
        },
      ],
    });
    expect(result.phases[0].governance_gate).toBe(true);
    expect(result.phases[0].personas[0].bmad_phase).toBe("Phase One");
    expect(result.phases[0].personas[0].phase_skills).toEqual([]);
  });
});

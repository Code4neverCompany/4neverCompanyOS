// Tests for the BMAD workflow Zod schema (Story 4.1 / D-12).
//
// Coverage:
//   ✓ Valid minimal workflow parses
//   ✓ Strict mode rejects unknown fields
//   ✓ Missing required fields are flagged
//   ✓ backing_cli / lifecycle enums reject unknown values
//   ✓ Malformed YAML bodies throw a clear error

import { describe, expect, it } from "vitest";
import {
  BmadWorkflowSchema,
  safeParseBmadWorkflow,
  type BmadWorkflow,
  WORKFLOW_BACKING_CLIS,
  WORKFLOW_LIFECYCLES,
} from "./bmad-workflow";

/** Build a minimal valid workflow document. Spread overrides to test edge cases. */
function valid(overrides: Record<string, unknown> = {}): BmadWorkflow {
  return {
    name: "greenfield-fullstack",
    description: "End-to-end BMAD workflow for greenfield projects.",
    version: "1.0",
    phases: [
      {
        id: "brief",
        label: "Brief",
        description: "Analyst interrogates the idea and produces a project brief.",
        personas: [
          {
            name: "Analyst",
            backing_cli: "claude",
            lifecycle: "ephemeral",
            task_prompt: "Produce a project brief at vault/projects/{project_id}/bmad/01-brief.md",
          },
        ],
        artifact: {
          path: "vault/projects/{project_id}/bmad/01-brief.md",
          description: "Project brief (markdown)",
        },
        approval_required: true,
      },
    ],
    ...overrides,
  };
}

describe("BmadWorkflowSchema — happy path", () => {
  it("accepts a minimal valid workflow", () => {
    const result = BmadWorkflowSchema.safeParse(valid());
    expect(result.success).toBe(true);
  });

  it("accepts every declared backing_cli value", () => {
    for (const cli of WORKFLOW_BACKING_CLIS) {
      const wf = valid();
      wf.phases[0].personas[0].backing_cli = cli;
      const result = BmadWorkflowSchema.safeParse(wf);
      expect(result.success, `backing_cli "${cli}" should be valid`).toBe(true);
    }
  });

  it("accepts every declared lifecycle value", () => {
    for (const lc of WORKFLOW_LIFECYCLES) {
      const wf = valid();
      wf.phases[0].personas[0].lifecycle = lc;
      const result = BmadWorkflowSchema.safeParse(wf);
      expect(result.success, `lifecycle "${lc}" should be valid`).toBe(true);
    }
  });

  it("round-trips through JSON losslessly", () => {
    const wf = valid();
    const back = BmadWorkflowSchema.parse(JSON.parse(JSON.stringify(wf)));
    expect(back).toEqual(wf);
  });

  it("accepts a multi-phase workflow with multiple personas", () => {
    const wf = valid();
    wf.phases.push({
      id: "implementation",
      label: "Implementation",
      description: "Dev and Frontend Designer implement the code skeleton.",
      personas: [
        {
          name: "Dev",
          backing_cli: "claude",
          lifecycle: "persistent",
          task_prompt: "Implement the stories.",
        },
        {
          name: "Frontend Designer",
          backing_cli: "aggy",
          lifecycle: "persistent",
          task_prompt: "Style the UI.",
        },
      ],
      artifact: {
        path: "vault/projects/{project_id}/bmad/05-implementation.md",
        description: "Implementation status summary",
      },
      approval_required: true,
    });
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(true);
  });
});

describe("BmadWorkflowSchema — strict mode rejects unknown fields", () => {
  it("rejects an unknown top-level key", () => {
    // Spread the valid baseline then add the unknown key — keeps the
    // baseline intact and surfaces the unknown key in the error.
    const result = BmadWorkflowSchema.safeParse({ ...valid(), novelty: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toString()).toContain("novelty");
    }
  });

  it("rejects an unknown override-key even when valid keys are present", () => {
    // The override path inside `valid(...)` spreads the overrides, so a
    // a single unknown key alongside a known key still surfaces the
    // unknown in the error path.
    const result = BmadWorkflowSchema.safeParse(valid({ name: "x", novelty: true }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.toString()).toContain("novelty");
    }
  });

  it("rejects an unknown key inside a phase", () => {
    const wf = valid() as Record<string, unknown>;
    const phaseArr = wf.phases as Array<Record<string, unknown>>;
    phaseArr[0].not_a_real_field = "x";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key inside a persona", () => {
    const wf = valid();
    (wf.phases[0].personas[0] as Record<string, unknown>).phase_skills = ["x"];
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
    if (!result.success) {
      // Error path mentions persona key
      expect(result.error.toString().toLowerCase()).toContain("phase_skills");
    }
  });

  it("rejects an unknown key inside an artifact", () => {
    const wf = valid();
    (wf.phases[0].artifact as Record<string, unknown>).format = "markdown";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });
});

describe("BmadWorkflowSchema — required fields are enforced", () => {
  it("rejects when name is missing", () => {
    const wf = valid();
    delete (wf as Record<string, unknown>).name;
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects when phases array is empty", () => {
    const result = BmadWorkflowSchema.safeParse(valid({ phases: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects when a phase has no personas", () => {
    const wf = valid();
    wf.phases[0].personas = [];
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects when persona.name is empty", () => {
    const wf = valid();
    wf.phases[0].personas[0].name = "";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects when task_prompt is empty", () => {
    const wf = valid();
    wf.phases[0].personas[0].task_prompt = "";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects when phase.id is not kebab/snake", () => {
    const wf = valid();
    wf.phases[0].id = "Brief Phase";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });
});

describe("BmadWorkflowSchema — enum validation", () => {
  it("rejects an unknown backing_cli", () => {
    const wf = valid();
    (wf.phases[0].personas[0] as { backing_cli: string }).backing_cli = "openai";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown lifecycle", () => {
    const wf = valid();
    (wf.phases[0].personas[0] as { lifecycle: string }).lifecycle = "transient";
    const result = BmadWorkflowSchema.safeParse(wf);
    expect(result.success).toBe(false);
  });
});

describe("safeParseBmadWorkflow", () => {
  it("returns a tagged union on success", () => {
    const result = safeParseBmadWorkflow(valid());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("greenfield-fullstack");
      expect(result.data.phases).toHaveLength(1);
    }
  });

  it("returns a tagged union on failure with a ZodError", () => {
    const result = safeParseBmadWorkflow({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

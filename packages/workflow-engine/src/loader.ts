// BMAD workflow YAML loader (Story 4.1 / D-12).
//
// Reads a workflow's raw YAML body from the Tauri backend, parses it
// with `js-yaml`, validates the parsed shape against the Zod schema in
// `@c4n/core` (single source of truth for what a workflow YAML must
// look like), and converts the result into the engine's `WorkflowPhase[]`
// shape. The conversion adds two engine-only fields the YAML does not
// carry:
//   - `bmad_phase` (string) — derived from `phase.label`, injected into
//     the persona context so the spawned CLI knows which BMAD phase it's
//     running in.
//   - `phase_skills` (string[]) — empty by default; reserved for a
//     future BMAD YAML extension. The spawned CLI treats an empty list
//     as "no project-specific skills registered" which is a valid state.
//
// All public functions are pure (no I/O) once a YAML body is provided,
// which keeps `loader.test.ts` free of Tauri mocking.

import { load as parseYaml } from "js-yaml";
import {
  safeParseBmadWorkflow,
  type BmadPhase,
  type BmadPersona,
  type BmadWorkflow,
} from "@c4n/core";
import type { WorkflowPhase, WorkflowPhasePersona } from "./engine";

/** Result of a successful YAML → engine conversion. */
export interface LoadedWorkflow {
  /** Parsed workflow body, fully validated. */
  workflow: BmadWorkflow;
  /** Engine-shaped phase list (with synthetic `bmad_phase` / `phase_skills`). */
  phases: WorkflowPhase[];
}

/**
 * Parse a raw YAML body string into a `LoadedWorkflow`. Throws a
 * `WorkflowLoadError` (a `Error` subclass) on any failure mode:
 *   - empty body
 *   - YAML syntax error
 *   - Zod validation failure
 *   - YAML body is a scalar or array (not a mapping)
 *
 * The error message is the most useful one for the user — it includes
 * the YAML parse error (with line/column) or the Zod issue path. The
 * engine surfaces this string in the UI.
 */
export function loadWorkflowFromYaml(yamlBody: string): LoadedWorkflow {
  if (!yamlBody || yamlBody.trim().length === 0) {
    throw new WorkflowLoadError("workflow YAML body is empty");
  }

  let raw: unknown;
  try {
    raw = parseYaml(yamlBody);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new WorkflowLoadError(`YAML parse error: ${msg}`);
  }

  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    throw new WorkflowLoadError(
      "workflow YAML must be a mapping at the top level (got " +
        (raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw) +
        ")",
    );
  }

  const result = safeParseBmadWorkflow(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path?.join(".") ?? "(root)";
    throw new WorkflowLoadError(
      `workflow YAML validation failed at ${path}: ${issue?.message ?? "unknown"}`,
    );
  }

  return convertToEnginePhases(result.data);
}

/**
 * Convert a validated `BmadWorkflow` into the engine's `WorkflowPhase[]`
 * shape. Pure function — no I/O, no side effects. Exported so tests can
 * assert against it without re-parsing YAML.
 */
export function convertToEnginePhases(workflow: BmadWorkflow): LoadedWorkflow {
  const phases: WorkflowPhase[] = workflow.phases.map((p) => convertPhase(p));
  return { workflow, phases };
}

function convertPhase(phase: BmadPhase): WorkflowPhase {
  return {
    id: phase.id,
    label: phase.label,
    description: phase.description,
    personas: phase.personas.map((persona) => convertPersona(persona, phase)),
    artifact: {
      path: phase.artifact.path,
      description: phase.artifact.description,
    },
    approval_required: phase.approval_required,
    // Engine-only fields with safe defaults; the BMAD YAML does not carry
    // these yet. A future schema extension can surface `governance_gate`
    // in the YAML, but the default of `true` matches the pre-refactor
    // hard-coded behavior and is what the Paperclip integration assumes.
    governance_gate: true,
  };
}

function convertPersona(persona: BmadPersona, phase: BmadPhase): WorkflowPhasePersona {
  return {
    name: persona.name,
    backing_cli: persona.backing_cli,
    lifecycle: persona.lifecycle,
    task_prompt: persona.task_prompt,
    // Engine-only fields — derived from phase context. The spawned CLI
    // uses bmad_phase to inject the right BMAD skill into the persona's
    // system context.
    bmad_phase: phase.label,
    phase_skills: [],
  };
}

/**
 * Thrown by `loadWorkflowFromYaml` for any failure mode. The `cause`
 * field (when present) carries the underlying `ZodError` so callers can
 * branch on it if they want; most callers just want `.message`.
 */
export class WorkflowLoadError extends Error {
  public override readonly name = "WorkflowLoadError";
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

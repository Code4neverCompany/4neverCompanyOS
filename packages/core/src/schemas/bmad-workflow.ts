// Zod schemas for BMAD workflow YAMLs (Story 4.1 / D-12).
//
// The BMAD Method ships a small set of workflow YAMLs under
// `_bmad/bmm/workflows/*.yaml`. Each YAML describes a sequence of
// phases, and each phase spawns one or more personas and waits for an
// artifact before advancing. These schemas are the single source of
// truth for what a valid workflow YAML looks like at runtime — the
// `WorkflowEngine` parses every YAML it loads with `BmadWorkflowSchema`
// so a typo in the catalog (unknown phase id, wrong enum, etc.) is
// caught at load time, not when the run hits it mid-flight.
//
// Strictness policy: every object uses `.strict()` so an unknown key
// (e.g. a typo on `lifecycle`) fails validation loudly. The `backing_cli`
// enum mirrors the YAMLs exactly: `claude` and `aggy`. Note this is
// distinct from the bus-envelope glossary's `BACKING_CLIS`
// (`claude-code`/`agy`/`agent`) — workflow YAMLs use the shorter form
// because that's what the personas are spawned with downstream.

import { z } from "zod";

/**
 * Backing-CLI identifiers that may appear in a workflow YAML.
 *
 * The TS persona-spawn path (`spawn_dynamic_persona`) maps these onto
 * the binary to launch, so the set is a closed enum. `aggy` is the
 * Antigravity CLI's short name as it appears in the BMAD docs.
 */
export const WORKFLOW_BACKING_CLIS = ["claude", "aggy"] as const;
export type WorkflowBackingCli = (typeof WORKFLOW_BACKING_CLIS)[number];

/** Persona lifecycle — determines whether the spawned CLI persists
 * across phases (stateful) or exits when the phase ends. */
export const WORKFLOW_LIFECYCLES = ["persistent", "ephemeral"] as const;
export type WorkflowLifecycle = (typeof WORKFLOW_LIFECYCLES)[number];

/**
 * One persona entry inside a workflow phase. The YAML keys mirror the
 * schema exactly; the engine layer augments `bmad_phase` and
 * `phase_skills` from phase-level context (see `loader.ts`).
 */
export const BmadPersonaSchema = z
  .object({
    /** Display name of the persona (e.g. "Analyst"). */
    name: z.string().min(1, "persona.name must be non-empty"),
    /** Backing CLI to run the persona on. */
    backing_cli: z.enum(WORKFLOW_BACKING_CLIS),
    /** Whether the spawned CLI lives across phases. */
    lifecycle: z.enum(WORKFLOW_LIFECYCLES),
    /**
     * Prompt sent verbatim to the spawned CLI. May include template
     * tokens `{project_id}` and `{project_name}` that the engine
     * substitutes at run time.
     */
    task_prompt: z.string().min(1, "persona.task_prompt must be non-empty"),
  })
  .strict();

/** The artifact that a phase must drop into the vault before advancing. */
export const BmadArtifactSchema = z
  .object({
    /** Vault-relative path the engine will poll for. */
    path: z.string().min(1, "artifact.path must be non-empty"),
    /** Human description for UI / approval cards. */
    description: z.string().min(1, "artifact.description must be non-empty"),
  })
  .strict();

/** One BMAD phase. Maps 1:1 to `WorkflowPhase` in the engine, plus
 * engine-only fields (governance_gate, bmad_phase, phase_skills)
 * that the loader injects from phase context. */
export const BmadPhaseSchema = z
  .object({
    /** Stable phase id (e.g. "brief", "plan"). Snake-cased; unique within a workflow. */
    id: z
      .string()
      .min(1)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "phase.id must be lowercase kebab/snake"),
    /** Display label (e.g. "Brief"). */
    label: z.string().min(1, "phase.label must be non-empty"),
    /** One-line description for chooser / approval cards. */
    description: z.string().min(1, "phase.description must be non-empty"),
    /** At least one persona must run the phase. */
    personas: z.array(BmadPersonaSchema).min(1, "phase.personas must be non-empty"),
    artifact: BmadArtifactSchema,
    /** When true, the engine waits for user approval before advancing. */
    approval_required: z.boolean(),
  })
  .strict();

/**
 * The full BMAD workflow document. The catalog (id/name/description)
 * comes from `list_workflows`; the YAML body provides the phase list.
 * The `name` field in the YAML overrides the catalog's name when
 * present so a user-edited YAML can be renamed without touching Rust.
 */
export const BmadWorkflowSchema = z
  .object({
    name: z.string().min(1, "workflow.name must be non-empty"),
    description: z.string().min(1, "workflow.description must be non-empty"),
    /** Semantic version string. Not used by the engine today; reserved
     * for future schema-evolution checks. */
    version: z.string().min(1, "workflow.version must be non-empty"),
    phases: z.array(BmadPhaseSchema).min(1, "workflow.phases must be non-empty"),
  })
  .strict();

/** Inferred TypeScript type for a workflow YAML. */
export type BmadWorkflow = z.infer<typeof BmadWorkflowSchema>;
/** Inferred TypeScript type for a single phase. */
export type BmadPhase = z.infer<typeof BmadPhaseSchema>;
/** Inferred TypeScript type for a single persona. */
export type BmadPersona = z.infer<typeof BmadPersonaSchema>;

/**
 * Parse + validate a workflow YAML body. Throws `ZodError` on malformed
 * input — callers should wrap in a try/catch and surface a clear
 * error to the user (the engine does this in `loader.ts`).
 */
export function parseBmadWorkflow(yamlBody: string): BmadWorkflow {
  return BmadWorkflowSchema.parse(yamlBody);
}

/**
 * Same as `parseBmadWorkflow` but returns a `safeParse` result so the
 * caller can branch on `success` without try/catch boilerplate.
 */
export function safeParseBmadWorkflow(
  yamlBody: unknown,
): { success: true; data: BmadWorkflow } | { success: false; error: z.ZodError } {
  return BmadWorkflowSchema.safeParse(yamlBody);
}

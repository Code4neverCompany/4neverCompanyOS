// @c4n/vault-layout — canonical vault path helpers.
//
// Architecture: OQ-N (vault directory layout) + D-7 (per-persona scope) + FR-30 (project vault)
// Implementing stories: M1 Story 1.6 (this spec) + 1.7 (vault location wizard)
//
// Source-of-truth spec: docs/vault-layout.md
// This module exports typed helpers so other packages can compute paths
// without hardcoding strings — change the spec in one place, rebuild,
// and every consumer picks up the new convention.

import { posix as pathPosix } from "node:path";

/** Spec version this code was authored against. Matches docs/vault-layout.md. */
export const VAULT_LAYOUT_VERSION = "1.0";

export const PACKAGE_NAME = "@c4n/vault-layout" as const;

/** Subdirectory name for per-persona scoped directories. */
export const PERSONAS_DIR = "personas";

/** Subdirectory name for per-project state. */
export const PROJECTS_DIR = "projects";

/** Subdirectory under each persona dir for daily log files. */
export const LOG_DIR = "log";

/** Subdirectory under each persona dir for reusable capabilities. */
export const SKILLS_DIR = "skills";

/** Subdirectory under each persona dir for persona-scoped knowledge. */
export const MEMORY_DIR = "memory";

/** Subdirectory under each project for BMAD planning artifacts. */
export const BMAD_DIR = "bmad";

/** Subdirectory under each project for ephemeral-agent output. */
export const REVIEWS_DIR = "reviews";

/** Filename of the canonical persona definition (D-6 source-of-truth). */
export const PERSONA_FILE = "persona.md";

/** Filename of the per-persona runtime metadata. */
export const PERSONA_META_FILE = ".persona-meta.json";

/** Filename for the per-persona persona-sync conflict log (D-6). */
export const CONFLICT_LOG_FILE = "conflict-log.md";

/** Filename for the per-persona vault-scoping audit (D-7). */
export const OUT_OF_SCOPE_WRITES_LOG_FILE = "out-of-scope-writes.log";

/** Filename of the project-level BMAD workflow run state (Story 4.4). */
export const WORKFLOW_STATE_FILE = ".workflow-state.json";

/** Filename of the project-level cross-persona decision log. */
export const PROJECT_DECISION_LOG_FILE = ".decision-log.md";

/** Filename of the optional auto-generated project context. */
export const PROJECT_CONTEXT_FILE = ".project-context.md";

/** Filename at vault root storing the spec version this vault was created under. */
export const VAULT_VERSION_FILE = ".vault-layout-version";

// ─── Path helpers ─────────────────────────────────────────────────

/**
 * Resolves the directory for a specific persona under the given vault root.
 * Use POSIX joins so the same code works on Win/Mac/Linux when computing
 * vault-relative paths; convert to OS-specific paths only at the filesystem
 * boundary inside the persona-supervisor / persona-sync packages.
 */
export function personaDir(vault: string, personaId: string): string {
  return pathPosix.join(vault, PERSONAS_DIR, personaId);
}

/** Path to the persona.md canonical file for a given persona. */
export function personaFile(vault: string, personaId: string): string {
  return pathPosix.join(personaDir(vault, personaId), PERSONA_FILE);
}

/** Path to the per-persona runtime metadata file. */
export function personaMetaFile(vault: string, personaId: string): string {
  return pathPosix.join(personaDir(vault, personaId), PERSONA_META_FILE);
}

/** Path to today's per-persona JSON-lines log file. */
export function personaLogFile(vault: string, personaId: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return pathPosix.join(personaDir(vault, personaId), LOG_DIR, `${iso}.jsonl`);
}

/** Path to today's telemetry-events sibling log (M2 Story 2.16). */
export function personaTelemetryLogFile(
  vault: string,
  personaId: string,
  date = new Date(),
): string {
  const iso = date.toISOString().slice(0, 10);
  return pathPosix.join(personaDir(vault, personaId), LOG_DIR, `${iso}-telemetry.jsonl`);
}

/** Path to the per-persona persona-sync conflict log. */
export function personaConflictLogFile(vault: string, personaId: string): string {
  return pathPosix.join(personaDir(vault, personaId), CONFLICT_LOG_FILE);
}

/** Path to the per-persona out-of-scope-writes audit log. */
export function personaOutOfScopeLogFile(vault: string, personaId: string): string {
  return pathPosix.join(personaDir(vault, personaId), OUT_OF_SCOPE_WRITES_LOG_FILE);
}

/** Path to a project's root vault directory. */
export function projectDir(vault: string, projectId: string): string {
  return pathPosix.join(vault, PROJECTS_DIR, projectId);
}

/** Path to a project's BMAD artifacts directory. */
export function projectBmadDir(vault: string, projectId: string): string {
  return pathPosix.join(projectDir(vault, projectId), BMAD_DIR);
}

/** Path to a project's ephemeral-review output area. */
export function projectReviewsDir(vault: string, projectId: string): string {
  return pathPosix.join(projectDir(vault, projectId), REVIEWS_DIR);
}

/** Path to a project's workflow-state file (Story 4.4 pause/resume). */
export function projectWorkflowStateFile(vault: string, projectId: string): string {
  return pathPosix.join(projectDir(vault, projectId), WORKFLOW_STATE_FILE);
}

/** Path to a project's cross-persona decision log. */
export function projectDecisionLogFile(vault: string, projectId: string): string {
  return pathPosix.join(projectDir(vault, projectId), PROJECT_DECISION_LOG_FILE);
}

/** Path to the spec-version marker at vault root. */
export function vaultVersionFile(vault: string): string {
  return pathPosix.join(vault, VAULT_VERSION_FILE);
}

// ─── Validation ───────────────────────────────────────────────────

/** kebab-case slug validator (lowercase letters, digits, dashes; no leading/trailing dash). */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Validate that a persona ID is a legal kebab-case slug.
 * Throws TypeError if not. Used by persona spawn paths to reject malformed IDs early.
 */
export function assertValidPersonaId(personaId: string): void {
  if (!SLUG_RE.test(personaId)) {
    throw new TypeError(
      `Invalid persona ID "${personaId}": must be kebab-case (lowercase letters, digits, dashes).`,
    );
  }
}

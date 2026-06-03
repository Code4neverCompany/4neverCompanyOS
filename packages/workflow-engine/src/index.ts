// @c4n/workflow-engine — BMAD YAML workflow executor (D-12).
//
// Story 4.1: workflow bodies are no longer hardcoded — the engine
// reads YAML at runtime. The parser/validator lives in ./loader.ts;
// the state machine + Tauri dispatch lives in ./engine.ts.

export * from "./engine";
export * from "./loader";
export type {
  WorkflowPhase,
  WorkflowPhasePersona,
  WorkflowRunState,
  WorkflowMetadata,
} from "./engine";
export const PACKAGE_NAME = "@c4n/workflow-engine" as const;

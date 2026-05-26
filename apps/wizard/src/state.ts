// Shared wizard state contract. Each step reads/writes a slice via the
// `onNext(patch)` callback.

export interface WizardState {
  /** Story 1.7 */
  vaultPath?: string;
  vaultScaffolded?: boolean;

  /** Story 1.8 — set once the Anthropic key has been validated and stored. */
  anthropicAuthenticated?: boolean;

  /** Story 1.9 — set once Claude Code is verifiably authenticated. */
  claudeCodeAuthenticated?: boolean;
}

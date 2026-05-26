// Wizard final step — confirmation. The desktop shell launches from here in
// the real flow; for now we just show the success state.

import type { WizardState } from "../state";

export function DoneStep({ state }: { state: WizardState }) {
  return (
    <div className="step done-step">
      <h2>You're all set</h2>
      <p>
        4neverCompany OS is configured. Your vault lives at <code>{state.vaultPath}</code>. Close
        this wizard and open the main app to start your first project.
      </p>
      <p className="step-help">
        Powered by Paperclip · Hermes Agent · BMAD Method · Tauri · Zellij · Claude Code. Full
        credits in Settings → About once the main app launches.
      </p>
    </div>
  );
}

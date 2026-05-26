// Wizard final step — confirmation. The desktop shell launches from here in
// the real flow; for now we just show the success state.

import { Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import type { WizardState } from "../state";

export function DoneStep({ state }: { state: WizardState }) {
  return (
    <HUDFrame className="wizard-card">
      <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
        <div
          style={{
            fontSize: 56,
            color: "var(--fn-gold)",
            textShadow: "var(--glow-gold)",
            lineHeight: 1,
          }}
        >
          ◈
        </div>
      </div>

      <div className="title-block" style={{ textAlign: "center" }}>
        <Eyebrow style={{ textAlign: "center" }}>Setup complete</Eyebrow>
        <h2 style={{ textAlign: "center" }}>You&apos;re all set</h2>
      </div>

      <p className="body-copy" style={{ textAlign: "center" }}>
        4neverCompany OS is configured. Your vault lives at{" "}
        <span className="chip-code">{state.vaultPath}</span>. Close this wizard and open the main
        app to start your first project.
      </p>

      <p className="help-copy" style={{ textAlign: "center" }}>
        Powered by Paperclip · Hermes Agent · BMAD Method · Tauri · Zellij · Claude Code. Full
        credits in Settings → About once the main app launches.
      </p>
    </HUDFrame>
  );
}

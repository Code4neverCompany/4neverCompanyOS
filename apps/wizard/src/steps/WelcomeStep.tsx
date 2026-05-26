// Wizard step 1 — welcome screen. Sets expectations and starts the flow.

import type { WizardState } from "../state";

export function WelcomeStep({ onNext }: { onNext: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="step welcome-step">
      <h2>Welcome to 4neverCompany OS</h2>
      <p>
        We'll set up your workspace in three steps: pick a location for your{" "}
        <strong>local vault</strong>, configure your <strong>Anthropic API key</strong> so
        Claude Code can run, and verify <strong>Claude Code</strong> is authenticated.
      </p>
      <p className="step-help">
        This wizard does not send your credentials anywhere. Anthropic keys go into Claude
        Code's own credential store. The workspace never sees or proxies the actual secret
        values.
      </p>
      <div className="step-actions">
        <button className="primary" onClick={() => onNext({})}>
          Get started
        </button>
      </div>
    </div>
  );
}

// Wizard step 1 — welcome screen. Sets expectations and starts the flow.
// Visual: full-screen HUD card with monogram lockup + tagline (LoginScreen
// pattern from the design system); copy stays neutral per design decision
// 2026-05-26 (low-friction first-run, brand voice reserved for the shell).

import { Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import monogramUrl from "@c4n/ui-tokens/assets/logo/monogram.png";
import type { WizardState } from "../state";

export function WelcomeStep({ onNext }: { onNext: (patch: Partial<WizardState>) => void }) {
  return (
    <HUDFrame className="wizard-card">
      <div className="welcome-logo">
        <img src={monogramUrl} alt="" className="monogram" />
        <div className="wordmark">4never</div>
        <div className="tagline">INNOVATE · CODE · CREATE · EVOLVE</div>
      </div>

      <div className="title-block">
        <Eyebrow>First-run setup</Eyebrow>
        <h2>Welcome to 4neverCompany OS</h2>
      </div>

      <p className="body-copy">
        We&apos;ll set up your workspace in three steps: pick a location for your{" "}
        <strong>local vault</strong>, configure your <strong>Anthropic API key</strong> so Claude
        Code can run, and verify <strong>Claude Code</strong> is authenticated.
      </p>
      <p className="help-copy">
        This wizard does not send your credentials anywhere. Anthropic keys go into Claude
        Code&apos;s own credential store. The workspace never sees or proxies the actual secret
        values.
      </p>

      <div className="actions">
        <Btn variant="primary" onClick={() => onNext({})}>
          Get started →
        </Btn>
      </div>
    </HUDFrame>
  );
}

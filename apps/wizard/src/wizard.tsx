// First-run wizard — multi-step state machine.
// State machine: welcome → vault → anthropic → claude → summary → done.
// Each step is its own component under ./steps/.
//
// Visual baseline (2026-05-26): the wizard shell uses the @c4n/ui-tokens
// design system (4never HUD aesthetic). The welcome step gets a hex-grid
// backdrop + scanline (LoginScreen-pattern); subsequent steps stay inside
// the same HUDFrame card with a thin top header showing progress.

import { useState } from "react";
import { Eyebrow } from "@c4n/ui-tokens";
import monogramUrl from "@c4n/ui-tokens/assets/logo/monogram.png";
import { WelcomeStep } from "./steps/WelcomeStep";
import { VaultStep } from "./steps/VaultStep";
import { AnthropicStep } from "./steps/AnthropicStep";
import { ClaudeCodeStep } from "./steps/ClaudeCodeStep";
import { SummaryStep } from "./steps/SummaryStep";
import { DoneStep } from "./steps/DoneStep";
import type { WizardState } from "./state";

const STEPS = ["welcome", "vault", "anthropic", "claude", "summary", "done"] as const;
type StepName = (typeof STEPS)[number];

export function Wizard() {
  const [step, setStep] = useState<StepName>("welcome");
  const [state, setState] = useState<WizardState>({});

  const stepIndex = STEPS.indexOf(step);
  const totalSteps = STEPS.length;
  const isWelcome = step === "welcome";

  const goNext = (patch: Partial<WizardState> = {}) => {
    setState((s) => ({ ...s, ...patch }));
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  return (
    <div className="wizard-shell">
      {!isWelcome && (
        <header className="wizard-header">
          <img
            src={monogramUrl}
            alt=""
            style={{
              height: 24,
              width: "auto",
              filter: "drop-shadow(0 0 6px rgba(255,196,0,0.4))",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 13,
              color: "var(--fn-purple)",
              letterSpacing: "-0.02em",
            }}
          >
            4neverCompany OS
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
              letterSpacing: "0.15em",
              paddingLeft: 12,
              marginLeft: 2,
              borderLeft: "1px solid var(--border-neutral)",
            }}
          >
            SETUP
          </span>
          <Eyebrow color="muted" style={{ marginLeft: 12 }}>
            Step {stepIndex} of {totalSteps - 1}
          </Eyebrow>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${(stepIndex / (totalSteps - 1)) * 100}%` }}
            />
          </div>
        </header>
      )}

      <div className="wizard-body">
        {isWelcome && <div className="hex-backdrop" />}
        {isWelcome && <div className="scanline" />}

        {step === "welcome" && <WelcomeStep onNext={goNext} />}
        {step === "vault" && <VaultStep state={state} onNext={goNext} onBack={goBack} />}
        {step === "anthropic" && <AnthropicStep state={state} onNext={goNext} onBack={goBack} />}
        {step === "claude" && <ClaudeCodeStep state={state} onNext={goNext} onBack={goBack} />}
        {step === "summary" && <SummaryStep state={state} onNext={goNext} onBack={goBack} />}
        {step === "done" && <DoneStep state={state} />}
      </div>
    </div>
  );
}

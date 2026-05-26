// First-run wizard — multi-step state machine.
// State machine: welcome → vault → anthropic → claude → summary → done.
// Each step is its own component under ./steps/.

import { useState } from "react";
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
    <main className="wizard">
      <header className="wizard-header">
        <h1>4neverCompany OS — Setup</h1>
        <Progress current={stepIndex} total={totalSteps} />
      </header>

      <section className="wizard-step">
        {step === "welcome" && <WelcomeStep onNext={goNext} />}
        {step === "vault" && <VaultStep state={state} onNext={goNext} onBack={goBack} />}
        {step === "anthropic" && (
          <AnthropicStep state={state} onNext={goNext} onBack={goBack} />
        )}
        {step === "claude" && (
          <ClaudeCodeStep state={state} onNext={goNext} onBack={goBack} />
        )}
        {step === "summary" && (
          <SummaryStep state={state} onNext={goNext} onBack={goBack} />
        )}
        {step === "done" && <DoneStep state={state} />}
      </section>
    </main>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  // Show "Step N of M" with a thin bar. Hidden on the welcome step.
  if (current === 0) return null;
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="wizard-progress">
      <div className="wizard-progress-label">
        Step {current + 1} of {total}
      </div>
      <div className="wizard-progress-bar">
        <div className="wizard-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

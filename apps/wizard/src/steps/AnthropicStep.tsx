// Wizard Story 1.8 — collect an Anthropic API key, validate it, and store it.
//
// Validation: fetch https://api.anthropic.com/v1/models with the key. A 200
// response confirms the key is real; anything else (401, 403, 5xx, network
// failure) is surfaced as a clean error with the option to retry.
//
// Storage: we store the key via the workspace's keychain abstraction
// (@c4n/credential-storage). Per Architecture D-9 / OQ-G this overlaps with
// Claude Code's own credential pickup: Claude Code reads ANTHROPIC_API_KEY
// from env, or its standard config file; on this same machine the user can
// also point Claude Code at the keychain entry. The wizard owns the
// keychain copy; Claude Code reads it back on launch (Story 1.9).

import { set as setCredential } from "@c4n/credential-storage";
import { useState } from "react";
import { Btn, Eyebrow, HUDFrame, Input } from "@c4n/ui-tokens";
import type { WizardState } from "../state";

interface Props {
  state: WizardState;
  onNext: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

type Status = "idle" | "validating" | "valid" | "error";

const ANTHROPIC_MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_API_VERSION = "2023-06-01";

export function AnthropicStep({ state, onNext, onBack }: Props) {
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function validateAndStore() {
    setError(null);
    if (!key.trim()) {
      setError("Paste your Anthropic API key first.");
      return;
    }
    setStatus("validating");
    try {
      const resp = await fetch(ANTHROPIC_MODELS_URL, {
        method: "GET",
        headers: {
          "x-api-key": key.trim(),
          "anthropic-version": ANTHROPIC_API_VERSION,
        },
      });
      if (resp.status === 401) {
        setStatus("error");
        setError("Anthropic rejected this key (401). Double-check it and try again.");
        return;
      }
      if (!resp.ok) {
        setStatus("error");
        setError(`Anthropic returned ${resp.status}. Try again, or check your network.`);
        return;
      }
      // Key works. Persist it to the keychain under service=anthropic, account=api-key.
      await setCredential("anthropic", "api-key", key.trim());
      setStatus("valid");
      onNext({ anthropicAuthenticated: true });
    } catch (e) {
      setStatus("error");
      setError(`Validation failed: ${String(e)}`);
    }
  }

  // Allow proceeding with a previously-validated key without re-entering it.
  function continueWithStored() {
    onNext({ anthropicAuthenticated: true });
  }

  return (
    <HUDFrame className="wizard-card">
      <div className="title-block">
        <Eyebrow>Step 2 · Anthropic</Eyebrow>
        <h2>Add your Anthropic API key</h2>
      </div>

      <p className="body-copy">
        Claude Code (the Dev persona&apos;s backing CLI) needs an Anthropic API key. Generate one at{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          console.anthropic.com/settings/keys
        </a>
        . The key is stored locally in your OS keychain. It is never sent anywhere by the workspace
        beyond the one validation call to <span className="chip-code">api.anthropic.com</span>{" "}
        below.
      </p>

      <div className="row">
        <Input
          label="API key"
          type={reveal ? "text" : "password"}
          value={key}
          onChange={(e) => setKey(e.currentTarget.value)}
          placeholder="sk-ant-…"
          disabled={status === "validating"}
          autoComplete="off"
          spellCheck={false}
          style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
        />
        <Btn
          variant="ghost"
          onClick={() => setReveal((r) => !r)}
          disabled={status === "validating"}
        >
          {reveal ? "Hide" : "Show"}
        </Btn>
      </div>

      {status === "valid" && (
        <div className="alert success">
          ✓ Key validated against Anthropic and saved to your keychain.
        </div>
      )}
      {status === "error" && error && <div className="alert error">{error}</div>}

      <div className="actions">
        <Btn variant="ghost" onClick={onBack} disabled={status === "validating"}>
          ← Back
        </Btn>
        {state.anthropicAuthenticated && !key && (
          <Btn variant="secondary" onClick={continueWithStored}>
            Use already-saved key →
          </Btn>
        )}
        <Btn variant="primary" onClick={validateAndStore} disabled={status === "validating"}>
          {status === "validating" ? "Validating…" : "Validate and save →"}
        </Btn>
      </div>
    </HUDFrame>
  );
}

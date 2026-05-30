// Wizard Story 2.1 — authenticate the Antigravity CLI (`agy`) via Google OAuth.
//
// Flow:
//   1. On mount, call `check_antigravity_security` — this reads the RCE-fix
//      gate from docs/pinned-versions.md. If the pinned `agy` build is not
//      `cleared`, we surface a [BLOCKED] message with the upgrade link and
//      never offer the OAuth button (the Rust side also refuses to launch).
//   2. If cleared, the "Connect Antigravity" button runs `agy auth login`,
//      which opens Google OAuth in the system browser. `agy` handles the
//      callback and stores the credentials in its own store (Architecture
//      D-9) — the workspace never touches the Google token.
//   3. After login returns, we confirm with `agy auth status` before
//      declaring the step complete.

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import type { WizardState } from "../state";

interface Props {
  state: WizardState;
  onNext: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

interface AntigravitySecurity {
  status: string;
  cleared: boolean;
  reason: string;
  upgrade_url: string;
}

type Status = "checking-gate" | "blocked" | "idle" | "authenticating" | "ok" | "error";

export function AntigravityStep({ state, onNext, onBack }: Props) {
  const [status, setStatus] = useState<Status>("checking-gate");
  const [gate, setGate] = useState<AntigravitySecurity | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await invoke<AntigravitySecurity>("check_antigravity_security");
        if (cancelled) return;
        setGate(g);
        setStatus(g.cleared ? "idle" : "blocked");
      } catch (e) {
        if (cancelled) return;
        // Failing to read the gate is itself a block — fail safe.
        setGate(null);
        setError(String(e));
        setStatus("blocked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    setError(null);
    setStatus("authenticating");
    try {
      // Opens Google OAuth in the system browser and waits for the callback.
      await invoke<string>("launch_antigravity_auth");
      // Confirm agy actually landed credentials before moving on.
      const statusOut = await invoke<string>("check_antigravity_auth_status");
      setDetail(statusOut);
      setStatus("ok");
      onNext({ antigravityAuthenticated: true });
    } catch (e) {
      setStatus("error");
      setError(String(e));
    }
  }

  return (
    <HUDFrame className="wizard-card">
      <div className="title-block">
        <Eyebrow>Step 4 · Antigravity</Eyebrow>
        <h2>Connect Antigravity (Frontend Designer)</h2>
      </div>

      <p className="body-copy">
        The Frontend Designer persona is backed by Google&apos;s Antigravity CLI (
        <span className="chip-code">agy</span>). This step signs you in through Google OAuth in your
        system browser. Antigravity stores the credentials in its own secure store — the workspace
        never sees your Google token.
      </p>

      {status === "checking-gate" && (
        <p className="help-copy">Checking Antigravity&apos;s security status…</p>
      )}

      {status === "blocked" && (
        <>
          <div className="alert blocked">
            [BLOCKED] {gate?.reason ?? error ?? "Antigravity is not cleared to launch."}
          </div>
          <p className="help-copy">
            The pinned <span className="chip-code">agy</span> build is gated until its known RCE is
            confirmed fixed. You can finish setup without Antigravity and connect the Frontend
            Designer later.
            {gate?.upgrade_url && (
              <>
                {" "}
                Upgrade details:{" "}
                <a href={gate.upgrade_url} target="_blank" rel="noreferrer">
                  {gate.upgrade_url}
                </a>
                .
              </>
            )}
          </p>
        </>
      )}

      {status === "ok" && (
        <div className="alert success">
          ✓ Antigravity authenticated.
          {detail && (
            <>
              <br />
              <code style={{ color: "var(--fn-cyan)" }}>{detail}</code>
            </>
          )}
        </div>
      )}

      {status === "error" && error && <div className="alert error">{error}</div>}

      <div className="actions">
        <Btn variant="ghost" onClick={onBack} disabled={status === "authenticating"}>
          ← Back
        </Btn>

        {status === "blocked" ? (
          <Btn variant="secondary" onClick={() => onNext({ antigravityAuthenticated: false })}>
            Skip for now →
          </Btn>
        ) : status === "ok" ? (
          <Btn variant="primary" onClick={() => onNext({ antigravityAuthenticated: true })}>
            Continue →
          </Btn>
        ) : (
          <>
            {!state.antigravityAuthenticated && (
              <Btn
                variant="ghost"
                onClick={() => onNext({ antigravityAuthenticated: false })}
                disabled={status === "authenticating"}
              >
                Skip
              </Btn>
            )}
            <Btn
              variant="primary"
              onClick={connect}
              disabled={status === "authenticating" || status === "checking-gate"}
            >
              {status === "authenticating" ? "Waiting for browser…" : "Connect Antigravity →"}
            </Btn>
          </>
        )}
      </div>
    </HUDFrame>
  );
}

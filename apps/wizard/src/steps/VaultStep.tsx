// Wizard Story 1.7 — pick the Obsidian vault location and scaffold it.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import type { WizardState } from "../state";

interface Props {
  state: WizardState;
  onNext: (patch: Partial<WizardState>) => void;
  onBack: () => void;
}

export function VaultStep({ state, onNext, onBack }: Props) {
  const [path, setPath] = useState(state.vaultPath ?? "");
  const [scaffolding, setScaffolding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the default location from the Rust side on first paint, unless the
  // user already picked one (e.g. came back from a later step).
  useEffect(() => {
    if (state.vaultPath) return;
    invoke<string>("choose_default_vault_location")
      .then(setPath)
      .catch((e) => setError(String(e)));
  }, [state.vaultPath]);

  async function browse() {
    setError(null);
    try {
      // Tauri 2 dialog plugin: open a directory picker.
      const picked = await open({
        directory: true,
        multiple: false,
        defaultPath: path,
        title: "Choose vault location",
      });
      if (typeof picked === "string") {
        setPath(picked);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function confirm() {
    setError(null);
    if (!path) {
      setError("Pick a vault location first.");
      return;
    }
    setScaffolding(true);
    try {
      const written = await invoke<string>("scaffold_vault", { path });
      onNext({ vaultPath: written, vaultScaffolded: true });
    } catch (e) {
      setError(String(e));
    } finally {
      setScaffolding(false);
    }
  }

  return (
    <div className="step vault-step">
      <h2>Choose your vault location</h2>
      <p>
        The vault holds your persona definitions, BMAD artifacts, per-project logs, and any
        skills or memory you accumulate. You can move it later by editing{" "}
        <code>~/.4nevercompanyos/config.toml</code>.
      </p>

      <div className="row">
        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.currentTarget.value)}
          placeholder="Vault location"
          disabled={scaffolding}
          className="path-input"
        />
        <button onClick={browse} disabled={scaffolding}>
          Browse…
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="step-actions">
        <button onClick={onBack} disabled={scaffolding}>
          Back
        </button>
        <button className="primary" onClick={confirm} disabled={scaffolding}>
          {scaffolding ? "Creating vault…" : "Use this location"}
        </button>
      </div>
    </div>
  );
}

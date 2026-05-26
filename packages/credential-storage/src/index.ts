// @c4n/credential-storage — thin TS facade over the Rust crate at
// crates/credential-storage, invoked through Tauri commands defined in
// apps/wizard/src-tauri/src/commands.rs (and later apps/desktop equivalents).
//
// Architecture: D-9.
// Implementing story: M1 Story 1.10.
//
// We do NOT store Anthropic or Google credentials through this facade —
// those live in Claude Code's and Antigravity CLI's own credential stores
// per Anthropic's third-party-routing policy. This facade is for
// Supermemory + GitHub + any future workspace-owned secret.

import { invoke } from "@tauri-apps/api/core";

export const PACKAGE_NAME = "@c4n/credential-storage" as const;

/**
 * Typed error variants returned by the underlying Rust crate. Matches
 * the `CmdError.kind` discriminator on the Rust side.
 */
export type CredentialErrorKind = "not-found" | "permission-denied" | "other";

export class CredentialError extends Error {
  constructor(
    public readonly kind: CredentialErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CredentialError";
  }
}

interface RawCmdError {
  kind: CredentialErrorKind;
  message: string;
}

function toCredentialError(raw: unknown): CredentialError {
  if (
    typeof raw === "object" &&
    raw !== null &&
    "kind" in raw &&
    "message" in raw &&
    typeof (raw as RawCmdError).kind === "string" &&
    typeof (raw as RawCmdError).message === "string"
  ) {
    const r = raw as RawCmdError;
    return new CredentialError(r.kind, r.message);
  }
  return new CredentialError("other", String(raw));
}

/**
 * Store a secret in the OS keychain under the given service + account.
 * Overwrites any existing entry. The Rust side auto-prefixes the service
 * with "com.c4nfornever." so workspace entries stay grouped.
 */
export async function set(service: string, account: string, secret: string): Promise<void> {
  try {
    await invoke<void>("store_credential", { service, account, secret });
  } catch (e) {
    throw toCredentialError(e);
  }
}

/**
 * Retrieve a secret. Throws CredentialError with `kind === "not-found"`
 * when no entry exists — callers should branch on that.
 */
export async function get(service: string, account: string): Promise<string> {
  try {
    return await invoke<string>("get_credential", { service, account });
  } catch (e) {
    throw toCredentialError(e);
  }
}

/**
 * Delete a secret. Throws CredentialError with `kind === "not-found"` if
 * no entry exists — callers can choose to ignore that case.
 */
export async function deleteCredential(service: string, account: string): Promise<void> {
  try {
    await invoke<void>("delete_credential", { service, account });
  } catch (e) {
    throw toCredentialError(e);
  }
}

/**
 * Try to get a secret; return `null` instead of throwing when it doesn't
 * exist. Other error kinds still propagate.
 */
export async function tryGet(service: string, account: string): Promise<string | null> {
  try {
    return await get(service, account);
  } catch (e) {
    if (e instanceof CredentialError && e.kind === "not-found") return null;
    throw e;
  }
}

// git-operations — thin wrappers around git CLI for github-sync package.
// All functions are async and return typed results.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, relative } from "node:path";
import { readdirSync, lstatSync } from "node:fs";

const execFileAsync = promisify(execFile);

async function git(
  cwd: string,
  args: string[],
  options?: { env?: Record<string, string> },
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, ...options });
  return stdout.trim();
}

async function gitWithToken(
  cwd: string,
  args: string[],
): Promise<string> {
  const env = { ...process.env, GIT_ASKPASS: "echo", GIT_TERMINAL_PROMPT: "0" };
  return git(cwd, args, { env });
}

// ─── Repo detection ─────────────────────────────────────────────────────────

export async function isGitRepo(vaultRoot: string): Promise<boolean> {
  try {
    await git(vaultRoot, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

// ─── Branch ─────────────────────────────────────────────────────────────────

export async function getCurrentBranch(vaultRoot: string): Promise<string | null> {
  try {
    return await git(vaultRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return null;
  }
}

// ─── Remote ─────────────────────────────────────────────────────────────────

export async function getRemoteUrl(
  vaultRoot: string,
  remote: string,
): Promise<string | null> {
  try {
    return await git(vaultRoot, ["remote", "get-url", remote]);
  } catch {
    return null;
  }
}

export async function addRemote(
  vaultRoot: string,
  remote: string,
  url: string,
): Promise<void> {
  const existing = await getRemoteUrl(vaultRoot, remote);
  if (existing) {
    await git(vaultRoot, ["remote", "set-url", remote, url]);
  } else {
    await git(vaultRoot, ["remote", "add", remote, url]);
  }
}

// ─── Init ───────────────────────────────────────────────────────────────────

export async function initGitRepo(vaultRoot: string): Promise<void> {
  const repo = await isGitRepo(vaultRoot);
  if (!repo) {
    await git(vaultRoot, ["init"]);
  }
}

// ─── Tracked files ───────────────────────────────────────────────────────────

export async function getTrackedFiles(vaultRoot: string): Promise<string[]> {
  try {
    const stdout = await git(vaultRoot, ["ls-files", "-z"]);
    if (!stdout) return [];
    return stdout.split("\0").filter(Boolean);
  } catch {
    return [];
  }
}

export async function getAllFiles(vaultRoot: string): Promise<string[]> {
  const files: string[] = [];
  scanDir(vaultRoot, vaultRoot, files);
  return files;
}

function scanDir(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(root, full);
    try {
      if (lstatSync(full).isDirectory()) {
        if (rel === ".git") continue;
        scanDir(root, full, out);
      } else {
        out.push(rel.replace(/\\/g, "/"));
      }
    } catch {
      // skip inaccessible
    }
  }
}

// ─── Staging ────────────────────────────────────────────────────────────────

export async function stageFiles(
  vaultRoot: string,
  files: string[],
): Promise<void> {
  if (files.length === 0) return;
  await git(vaultRoot, ["add", "--force", ...files]);
}

// ─── Commit ─────────────────────────────────────────────────────────────────

export async function commit(
  vaultRoot: string,
  message: string,
): Promise<void> {
  await git(vaultRoot, ["commit", "-m", message]);
}

// ─── Push ────────────────────────────────────────────────────────────────────

export async function push(
  vaultRoot: string,
  remote: string,
  _token: string,
): Promise<void> {
  await gitWithToken(
    vaultRoot,
    ["push", remote, "HEAD", "--force"],
  );
}

// ─── Pull ────────────────────────────────────────────────────────────────────

export async function pull(
  vaultRoot: string,
  remote: string,
  _token: string,
): Promise<void> {
  await gitWithToken(
    vaultRoot,
    ["pull", "--rebase", remote, "HEAD"],
  );
}

// ─── Ahead/behind ───────────────────────────────────────────────────────────

export async function getAheadBehind(
  vaultRoot: string,
  remote: string,
): Promise<[ahead: number, behind: number]> {
  try {
    await git(vaultRoot, ["fetch", remote]);
  } catch {
    return [0, 0];
  }
  try {
    const aheadStr = await git(vaultRoot, [
      "rev-list",
      "--left-only",
      "--count",
      `HEAD...${remote}/HEAD`,
    ]);
    const behindStr = await git(vaultRoot, [
      "rev-list",
      "--right-only",
      "--count",
      `HEAD...${remote}/HEAD`,
    ]);
    return [parseInt(aheadStr, 10) || 0, parseInt(behindStr, 10) || 0];
  } catch {
    return [0, 0];
  }
}

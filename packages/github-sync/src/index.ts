// @c4n/github-sync — Opt-in GitHub sync for vault configs, BMAD artifacts,
// skills, and personas. Powers multi-machine continuity (FR-33/34 / UJ-7).
//
// Architecture: FR-33/34
// Implementing stories: M5 Story 5.4 (push) + 5.5 (pull / cross-machine)
//
// Sync is git-based: push = git push to an HTTPS remote authenticated via
// a GitHub PAT stored in OS keychain. No gh CLI required.
//
// ─────────────────────────────────────────────────────────────────────────────
// Credential keys
// ─────────────────────────────────────────────────────────────────────────────

export const GITHUB_SERVICE = "github" as const;
export const GITHUB_ACCOUNT = "pat" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Sync policy (FR-33 default — overridable per-category)
// ─────────────────────────────────────────────────────────────────────────────

export type SyncCategory =
  | "persona-files"       // personas/*/persona.md
  | "persona-skills"      // personas/*/skills/*.md
  | "persona-memory"      // personas/*/memory/*.md  (opt-out)
  | "persona-meta"        // personas/*/.persona-meta.json
  | "bmad-artifacts"     // projects/*/bmad/**
  | "project-personas"    // projects/*/personas/**
  | "project-reviews"     // projects/*/reviews/**
  | "project-context"     // projects/*/.project-context.md
  | "decision-log";       // projects/*/.decision-log.md

export const DEFAULT_SYNC_CATEGORIES: SyncCategory[] = [
  "persona-files",
  "persona-skills",
  "persona-meta",
  "bmad-artifacts",
  "project-personas",
  "project-reviews",
  "project-context",
  "decision-log",
];

export const OPT_OUT_CATEGORIES: SyncCategory[] = ["persona-memory"];

export interface SyncPolicy {
  categories: Record<SyncCategory, boolean>;
}

export function defaultSyncPolicy(): SyncPolicy {
  const categories: Record<SyncCategory, boolean> = {} as Record<SyncCategory, boolean>;
  for (const cat of DEFAULT_SYNC_CATEGORIES) categories[cat] = true;
  for (const cat of OPT_OUT_CATEGORIES) categories[cat] = false;
  return { categories };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync result
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  pushed: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Path patterns (relative to vault root)
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS: Record<SyncCategory, string[]> = {
  "persona-files":  ["personas/*/persona.md"],
  "persona-skills": ["personas/*/skills/*.md"],
  "persona-memory":  ["personas/*/memory/*.md"],
  "persona-meta":    ["personas/*/.persona-meta.json"],
  "bmad-artifacts": ["projects/*/bmad/**"],
  "project-personas":["projects/*/personas/**"],
  "project-reviews": ["projects/*/reviews/**"],
  "project-context": ["projects/*/.project-context.md"],
  "decision-log":    ["projects/*/.decision-log.md"],
};

const NEVER_SYNC = [
  "personas/*/log/**",
  "personas/*/conflict-log.md",
  "personas/*/out-of-scope-writes.log",
  "personas/*/claude.md",
  "personas/*/agy.md",
  "personas/*/agent.md",
  "projects/*/.workflow-state.json",
];

// ─────────────────────────────────────────────────────────────────────────────
// GitHub REST API types
// ─────────────────────────────────────────────────────────────────────────────

interface GithubCreateRepoResponse {
  full_name: string;
  default_branch: string;
  html_url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GithubSyncService
// ─────────────────────────────────────────────────────────────────────────────

export class GithubSyncService {
  constructor(private readonly vaultRoot: string) {}

  // ── Init ──────────────────────────────────────────────────────────────────

  /**
   * Create a new private GitHub repo and configure the vault as a git repo
   * with the new remote. Does NOT do an initial push.
   *
   * Requires GITHUB_SERVICE / GITHUB_ACCOUNT credential to be set.
   */
  async initRepo(
    githubToken: string,
    repoName: string,
    isPrivate = true,
  ): Promise<{ repoUrl: string; defaultBranch: string }> {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoName,
        private: isPrivate,
        auto_init: false,
        description: "4neverCompany OS workspace vault",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${body}`);
    }

    const repo = (await response.json()) as GithubCreateRepoResponse;

    // Init git repo and add remote
    const { initGitRepo, addRemote } = await import("./git-operations");
    await initGitRepo(this.vaultRoot);
    const httpsUrl = `https://${githubToken}@github.com/${repo.full_name}.git`;
    await addRemote(this.vaultRoot, "origin", httpsUrl);

    return {
      repoUrl: repo.html_url,
      defaultBranch: repo.default_branch,
    };
  }

  // ── Push ─────────────────────────────────────────────────────────────────

  /**
   * Stage and push tracked files matching the sync policy to the configured
   * GitHub remote. Creates the commit automatically with a generated message.
   */
  async push(
    githubToken: string,
    remote = "origin",
    policy: SyncPolicy,
  ): Promise<SyncResult> {
    const { getTrackedFiles, stageFiles, commit, push: gitPush, getRemoteUrl } =
      await import("./git-operations");

    const remoteUrl = await getRemoteUrl(this.vaultRoot, remote);
    if (!remoteUrl) {
      return { ok: false, pushed: 0, errors: ["No remote configured. Run initRepo first."] };
    }

    const errors: string[] = [];

    // Stage files matching policy
    const trackedFiles = await getTrackedFiles(this.vaultRoot);
    const toStage = trackedFiles.filter((f) => matchesSyncPolicy(f, policy));
    const excluded = trackedFiles.filter(
      (f) => matchesNeverSync(f) && matchesSyncPolicy(f, policy),
    );

    if (excluded.length > 0) {
      errors.push(`Some files matched both sync and never-sync patterns: ${excluded.join(", ")}`);
    }

    if (toStage.length === 0) {
      return { ok: true, pushed: 0, errors: [] };
    }

    await stageFiles(this.vaultRoot, toStage);

    const timestamp = new Date().toISOString();
    const commitMsg = `4neverCompany OS sync ${timestamp}\n\nCategories: ${Object.entries(policy.categories)
      .filter(([, on]) => on)
      .map(([cat]) => cat)
      .join(", ")}`;

    try {
      await commit(this.vaultRoot, commitMsg);
    } catch (e) {
      return { ok: false, pushed: 0, errors: [`Commit failed: ${e}`] };
    }

    try {
      await gitPush(this.vaultRoot, remote, githubToken);
    } catch (e) {
      return { ok: false, pushed: 0, errors: [`Push failed: ${e}`] };
    }

    return { ok: true, pushed: toStage.length, errors };
  }

  // ── Pull ──────────────────────────────────────────────────────────────────

  /**
   * Pull from the configured GitHub remote into the vault.
   */
  async pull(githubToken: string, remote = "origin"): Promise<SyncResult> {
    const { pull: gitPull, getRemoteUrl } = await import("./git-operations");

    const remoteUrl = await getRemoteUrl(this.vaultRoot, remote);
    if (!remoteUrl) {
      return { ok: false, pushed: 0, errors: ["No remote configured. Run initRepo first."] };
    }

    try {
      await gitPull(this.vaultRoot, remote, githubToken);
      return { ok: true, pushed: 0, errors: [] };
    } catch (e) {
      return { ok: false, pushed: 0, errors: [`Pull failed: ${e}`] };
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /**
   * Check whether the vault is a git repo with a configured remote.
   */
  async status(): Promise<{
    isRepo: boolean;
    remoteConfigured: boolean;
    ahead: number;
    behind: number;
    currentBranch: string | null;
  }> {
    const { isGitRepo, getRemoteUrl, getAheadBehind, getCurrentBranch } =
      await import("./git-operations");

    const repo = await isGitRepo(this.vaultRoot);
    if (!repo) {
      return { isRepo: false, remoteConfigured: false, ahead: 0, behind: 0, currentBranch: null };
    }

    const remoteUrl = await getRemoteUrl(this.vaultRoot, "origin");
    const [ahead, behind] = await getAheadBehind(this.vaultRoot, "origin");
    const branch = await getCurrentBranch(this.vaultRoot);

    return {
      isRepo: true,
      remoteConfigured: !!remoteUrl,
      ahead,
      behind,
      currentBranch: branch,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function matchesSyncPolicy(filePath: string, policy: SyncPolicy): boolean {
  for (const [category, patterns] of Object.entries(PATTERNS)) {
    if (policy.categories[category as SyncCategory] !== true) continue;
    for (const pattern of patterns) {
      if (matchGlob(filePath, pattern)) return true;
    }
  }
  return false;
}

function matchesNeverSync(filePath: string): boolean {
  for (const pattern of NEVER_SYNC) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const parts = filePath.split("/");
  const patternParts = pattern.split("/");
  let pi = 0;
  for (const part of parts) {
    if (pi >= patternParts.length) return false;
    const pp = patternParts[pi];
    if (pp === "**") {
      if (pi === patternParts.length - 1) return true;
      const next = patternParts[pi + 1];
      const idx = parts.indexOf(next, pi + 1);
      if (idx === -1) return false;
      pi += 1;
      continue;
    }
    if (pp === "*") { pi++; continue; }
    if (pp !== part) return false;
    pi++;
  }
  return pi === patternParts.length;
}

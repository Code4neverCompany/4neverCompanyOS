# 4neverCompany OS — Local Vault

This directory is the workspace's local memory. It holds:

```
<vault>/
├── personas/{persona-id}/        per-persona scope (D-7)
│   ├── persona.md                canonical persona definition (D-6 source-of-truth)
│   ├── claude.md|agy.md|agent.md auto-projected from persona.md
│   ├── log/YYYY-MM-DD.jsonl      daily structured logs
│   ├── skills/*.md, memory/*.md  per-persona capability + recall
│   ├── conflict-log.md           sync-loser audit
│   ├── out-of-scope-writes.log   vault-scoping audit
│   └── .persona-meta.json        runtime metadata
└── projects/{project-id}/        per-project state
    ├── bmad/                      BMAD planning artifacts
    ├── personas/{persona-id}/     optional per-project overlay
    ├── reviews/                   ephemeral-agent output
    └── .project-context.md, .decision-log.md, .workflow-state.json
```

**Don't edit `.persona-meta.json`, `.workflow-state.json`, or `.vault-layout-version` by hand** — the workspace owns those files and rewrites them. `persona.md`, `skills/*.md`, `memory/*.md` are yours to edit; the workspace propagates changes to the CLI-specific tool configs via persona-sync.

Full spec: see `docs/vault-layout.md` in the 4neverCompany OS repository.

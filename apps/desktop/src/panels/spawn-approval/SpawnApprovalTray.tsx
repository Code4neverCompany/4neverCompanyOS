// Story 3.8 (NEVAAA-38) + UX improvements (NEVAAA-58) — User approval tray
// for Hermes spawn proposals.
//
// Hermes emits `spawn_proposal` bus events (Story 3.7 / NEVAAA-33) to propose
// spawning a new dynamic persona. This component subscribes to that event type
// and renders a floating approval tray: each proposal card shows the proposed
// persona name, role, task description, lifecycle, and budget estimate.
//
// UX improvements from NEVAAA-58:
//   - Confirmation dialogs on Approve / Veto / Modify actions
//   - Dismiss button (closes silently, no bus event)
//   - Artifact preview (expandable task description)
//   - Richer persona context (backing CLI badge, role label)
//   - Handles 3+ pending proposals gracefully
//
// Proposals expire after 5 minutes client-side (auto-vetoed with timeout reason).

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useCallback, useRef } from "react";
import { Badge, Btn, Divider, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import { BusSubscription } from "../../lib/BusSubscription";
import { type BusEnvelope } from "@c4n/core";
import { BACKING_CLIS } from "@c4n/core/glossary";

const PROPOSAL_TIMEOUT_MS = 5 * 60 * 1000;

const CLI_ROLE_LABELS: Record<string, string> = {
  "claude-code": "Developer",
  agy: "Agent",
  agent: "Agent",
};

function getRoleLabel(personaType: string): string {
  return CLI_ROLE_LABELS[personaType] ?? "Agent";
}

export interface SpawnProposalRecord {
  id: string;
  received_at_ms: number;
  name: string;
  persona_type: string;
  task_description: string;
  lifecycle: string;
  budget_estimate: number | null;
  proposed_by: string;
  vault_dir?: string;
  session_name?: string;
  artifact_preview?: string;
}

interface SpawnApprovalTrayProps {
  onModify?: (proposal: SpawnProposalRecord) => void;
  onSpawned?: (persona: DynamicPersonaInfo) => void;
}

interface DynamicPersonaInfo {
  name: string;
  slug: string;
  backing_cli: string;
  lifecycle: string;
  session_name: string;
  running: boolean;
  bus_identity: string;
  vault_dir: string;
}

type ConfirmAction = "approve" | "veto" | "modify" | null;

interface ConfirmDialogProps {
  action: ConfirmAction;
  proposal: SpawnProposalRecord;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

function ConfirmDialog({ action, proposal, onConfirm, onCancel, isLoading }: ConfirmDialogProps) {
  const labels: Record<Exclude<ConfirmAction, null>, { title: string; body: string; confirmLabel: string; variant: "primary" | "danger" | "secondary" }> = {
    approve: {
      title: "Approve Spawn Proposal?",
      body: `Spawn "${proposal.name}" (${getRoleLabel(proposal.persona_type)})? This will launch a ${proposal.lifecycle} persona.`,
      confirmLabel: "Spawn",
      variant: "primary",
    },
    veto: {
      title: "Reject Spawn Proposal?",
      body: `Veto "${proposal.name}"? This emits a rejection event.`,
      confirmLabel: "Veto",
      variant: "danger",
    },
    modify: {
      title: "Modify Spawn Proposal?",
      body: `Open the authoring form to modify "${proposal.name}" before spawning.`,
      confirmLabel: "Open Form",
      variant: "secondary",
    },
  };
  const cfg = labels[action!];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <HUDFrame
        style={{ maxWidth: 440, width: "90%", padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Eyebrow color="gold" style={{ marginBottom: 12 }}>
          {cfg.title}
        </Eyebrow>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--fg-2)",
            lineHeight: 1.6,
            margin: "0 0 20px",
          }}
        >
          {cfg.body}
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Btn>
          <Btn variant={cfg.variant} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? "…" : cfg.confirmLabel}
          </Btn>
        </div>
      </HUDFrame>
    </div>
  );
}

interface ProposalCardProps {
  proposal: SpawnProposalRecord;
  onApprove: (p: SpawnProposalRecord) => void;
  onVeto: (p: SpawnProposalRecord) => void;
  onModify: (p: SpawnProposalRecord) => void;
  onDismiss: (p: SpawnProposalRecord) => void;
  isVetoing: boolean;
  isApproving: boolean;
  confirmAction: ConfirmAction;
  onConfirmAction: (action: ConfirmAction) => void;
}

function ProposalCard({
  proposal,
  onApprove,
  onVeto,
  onModify,
  onDismiss,
  isVetoing,
  isApproving,
  confirmAction,
  onConfirmAction,
}: ProposalCardProps) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const elapsed = Date.now() - proposal.received_at_ms;
    return Math.max(0, PROPOSAL_TIMEOUT_MS - elapsed);
  });

  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1000;
        return Math.max(0, next);
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timeLeft <= 0]);

  useEffect(() => {
    if (timeLeft === 0) {
      onVeto(proposal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, proposal.id]);

  const mins = Math.floor(timeLeft / 60000);
  const secs = Math.floor((timeLeft % 60000) / 1000);
  const timeLabel = `${mins}:${secs.toString().padStart(2, "0")}`;
  const isUrgent = timeLeft < 60000;

  const descLines = proposal.task_description.split("\n");
  const isLongDesc = descLines.length > 4 || proposal.task_description.length > 240;
  const previewText = isLongDesc
    ? proposal.task_description.slice(0, 240) + "…"
    : proposal.task_description;

  const backingCli = BACKING_CLIS.includes(proposal.persona_type as typeof BACKING_CLIS[number])
    ? proposal.persona_type
    : null;

  const lifecycleColor = proposal.lifecycle === "persistent" ? "online" : "warn";

  return (
    <>
      <HUDFrame style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--fn-white)",
                }}
              >
                {proposal.name}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge color={backingCli ? "cyan" : "muted"}>
                  {backingCli ? `⬡ ${backingCli}` : `⬡ ${proposal.persona_type}`}
                </Badge>
                <Badge color="purple">{getRoleLabel(proposal.persona_type)}</Badge>
                <Badge color={lifecycleColor}>{proposal.lifecycle.toUpperCase()}</Badge>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: isUrgent ? "var(--fn-red)" : "var(--fg-3)",
                }}
              >
                ⏱ {timeLabel}
              </div>
            </div>
          </div>

          <Divider style={{ opacity: 0.4 }} />

          {/* Task description / artifact preview */}
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Eyebrow color="muted" style={{ fontSize: 9 }}>
                TASK / ARTIFACT PREVIEW
              </Eyebrow>
              {isLongDesc && (
                <button
                  onClick={() => setDescriptionExpanded((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--fn-cyan)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {descriptionExpanded ? "▲ collapse" : "▼ expand"}
                </button>
              )}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--fg-2)",
                lineHeight: 1.5,
                background: "rgba(255,255,255,0.03)",
                borderRadius: 2,
                padding: "8px 10px",
                whiteSpace: descriptionExpanded ? "pre-wrap" : "pre",
                overflow: "hidden",
                maxHeight: descriptionExpanded ? "none" : 72,
              }}
            >
              {descriptionExpanded ? proposal.task_description : previewText}
            </div>
          </div>

          {/* Budget + metadata row */}
          <div
            style={{
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--fg-3)",
            }}
          >
            {proposal.budget_estimate != null && (
              <span>
                Budget:{" "}
                <span style={{ color: proposal.budget_estimate > 0 ? "var(--fn-gold)" : "var(--fg-3)" }}>
                  ${proposal.budget_estimate.toFixed(2)} USD
                </span>
              </span>
            )}
            {proposal.session_name && <span>Session: {proposal.session_name}</span>}
            <span>By: {proposal.proposed_by}</span>
          </div>

          <Divider style={{ opacity: 0.4 }} />

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <Btn
              variant="ghost"
              onClick={() => onDismiss(proposal)}
              disabled={isVetoing || isApproving}
              title="Dismiss silently — no event emitted"
            >
              Dismiss
            </Btn>
            <Btn
              variant="danger"
              onClick={() => onConfirmAction("veto")}
              disabled={isVetoing || isApproving}
            >
              {isVetoing ? "…" : "Veto"}
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => onConfirmAction("modify")}
              disabled={isVetoing || isApproving}
            >
              Modify
            </Btn>
            <Btn
              variant="primary"
              onClick={() => onConfirmAction("approve")}
              disabled={isVetoing || isApproving}
            >
              {isApproving ? "…" : "Approve"}
            </Btn>
          </div>
        </div>
      </HUDFrame>

      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          proposal={proposal}
          onConfirm={() => {
            if (confirmAction === "approve") onApprove(proposal);
            else if (confirmAction === "veto") onVeto(proposal);
            else if (confirmAction === "modify") onModify(proposal);
          }}
          onCancel={() => onConfirmAction(null)}
          isLoading={isVetoing || isApproving}
        />
      )}
    </>
  );
}

export function SpawnApprovalTray({ onModify, onSpawned }: SpawnApprovalTrayProps) {
  const [proposals, setProposals] = useState<SpawnProposalRecord[]>([]);
  const [vetoingIds, setVetoingIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [confirmingProposalId, setConfirmingProposalId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const subscriptionRef = useRef<BusSubscription | null>(null);

  const loadInitialProposals = useCallback(async () => {
    try {
      const stored = await invoke<SpawnProposalRecord[]>("list_pending_proposals");
      const now = Date.now();
      const active = stored.filter((p) => now - p.received_at_ms < PROPOSAL_TIMEOUT_MS);
      setProposals(active);
    } catch (e) {
      console.warn("[SpawnApprovalTray] failed to load pending proposals:", e);
    }
  }, []);

  useEffect(() => {
    loadInitialProposals();

    const sub = new BusSubscription({
      onEvent: (envelope: BusEnvelope) => {
        if (envelope.type !== "spawn_proposal") return;
        const payload = envelope.payload as {
          name: string;
          persona_type: string;
          task_description: string;
          lifecycle: string;
          budget_estimate?: number;
        };
        const record: SpawnProposalRecord = {
          id: envelope.id,
          received_at_ms: envelope.ts,
          name: payload.name,
          persona_type: payload.persona_type,
          task_description: payload.task_description,
          lifecycle: payload.lifecycle,
          budget_estimate: payload.budget_estimate ?? null,
          proposed_by: envelope.source,
        };
        setProposals((prev) => {
          if (prev.some((p) => p.id === record.id)) return prev;
          return [record, ...prev];
        });
      },
    });

    sub.start().catch((e) => console.warn("[SpawnApprovalTray] subscription start failed:", e));
    subscriptionRef.current = sub;

    return () => {
      sub.dispose().catch((e) => console.warn("[SpawnApprovalTray] dispose failed:", e));
    };
  }, [loadInitialProposals]);

  const handleApprove = useCallback(
    async (proposal: SpawnProposalRecord) => {
      setApprovingIds((prev) => new Set(prev).add(proposal.id));
      setConfirmingProposalId(null);
      setConfirmAction(null);
      try {
        const persona = await invoke<DynamicPersonaInfo>("spawn_dynamic_persona", {
          name: proposal.name,
          backingCli: proposal.persona_type,
          lifecycle: proposal.lifecycle,
          taskPrompt: null,
        });
        await invoke("dismiss_spawn_proposal", { id: proposal.id });
        setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
        onSpawned?.(persona);
      } catch (e) {
        console.error("[SpawnApprovalTray] approve failed:", e);
      } finally {
        setApprovingIds((prev) => {
          const next = new Set(prev);
          next.delete(proposal.id);
          return next;
        });
      }
    },
    [onSpawned],
  );

  const handleVeto = useCallback(async (proposal: SpawnProposalRecord) => {
    setVetoingIds((prev) => new Set(prev).add(proposal.id));
    setConfirmingProposalId(null);
    setConfirmAction(null);
    try {
      await invoke("dismiss_spawn_proposal", { id: proposal.id });
      await invoke("bus_publish", {
        eventType: "persona.spawn.vetoed",
        payload: {
          proposal_id: proposal.id,
          vetoed_at_ms: Date.now(),
        },
      });
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    } catch (e) {
      console.error("[SpawnApprovalTray] veto failed:", e);
    } finally {
      setVetoingIds((prev) => {
        const next = new Set(prev);
        next.delete(proposal.id);
        return next;
      });
    }
  }, []);

  const handleModify = useCallback(
    (proposal: SpawnProposalRecord) => {
      setConfirmingProposalId(null);
      setConfirmAction(null);
      onModify?.(proposal);
    },
    [onModify],
  );

  const handleDismiss = useCallback((proposal: SpawnProposalRecord) => {
    setConfirmingProposalId(null);
    setConfirmAction(null);
    setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
  }, []);

  const openConfirmDialog = useCallback((proposalId: string, action: ConfirmAction) => {
    setConfirmingProposalId(proposalId);
    setConfirmAction(action);
  }, []);

  if (proposals.length === 0) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <Eyebrow color="gold">
          {proposals.length > 1
            ? `⏱ ${proposals.length} Pending Approvals`
            : "⏱ Pending Approval"}
        </Eyebrow>
      </div>
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          onApprove={handleApprove}
          onVeto={handleVeto}
          onModify={handleModify}
          onDismiss={handleDismiss}
          isVetoing={vetoingIds.has(p.id)}
          isApproving={approvingIds.has(p.id)}
          confirmAction={
            confirmingProposalId === p.id ? confirmAction : null
          }
          onConfirmAction={(action) => {
            if (action === null) {
              setConfirmingProposalId(null);
              setConfirmAction(null);
            } else {
              openConfirmDialog(p.id, action);
            }
          }}
        />
      ))}
    </div>
  );
}

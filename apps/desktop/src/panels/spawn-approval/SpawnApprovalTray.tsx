// Story 3.8 (NEVAAA-38) — User approval tray for Hermes spawn proposals.
//
// Hermes emits `spawn_proposal` bus events (Story 3.7 / NEVAAA-33) to propose
// spawning a new dynamic persona. This component subscribes to that event type
// and renders a floating approval tray: each proposal card shows the proposed
// persona name, role, task description, lifecycle, and budget estimate.
// User actions: Approve (calls spawn_dynamic_persona), Veto (dismisses + emits
// persona.spawn.vetoed on the bus), Modify (calls onModify so the parent can
// pre-fill the authoring form).
//
// Proposals expire after 5 minutes client-side (auto-vetoed with timeout reason).

import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useCallback, useRef } from "react";
import { Badge, Btn, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import { BusSubscription } from "../../lib/BusSubscription";
import { type BusEnvelope } from "@c4n/core";

const PROPOSAL_TIMEOUT_MS = 5 * 60 * 1000;

export interface SpawnProposalRecord {
  id: string;
  received_at_ms: number;
  name: string;
  persona_type: string;
  task_description: string;
  lifecycle: string;
  budget_estimate: number | null;
  proposed_by: string;
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

function ProposalCard({
  proposal,
  onApprove,
  onVeto,
  onModify,
  isVetoing,
  isApproving,
}: {
  proposal: SpawnProposalRecord;
  onApprove: (p: SpawnProposalRecord) => void;
  onVeto: (p: SpawnProposalRecord) => void;
  onModify: (p: SpawnProposalRecord) => void;
  isVetoing?: boolean;
  isApproving?: boolean;
}) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const elapsed = Date.now() - proposal.received_at_ms;
    return Math.max(0, PROPOSAL_TIMEOUT_MS - elapsed);
  });

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

  return (
    <HUDFrame style={{ padding: 18, marginBottom: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
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
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--fn-cyan)",
                marginTop: 2,
              }}
            >
              {proposal.persona_type} · {proposal.lifecycle}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <Badge color={proposal.lifecycle === "persistent" ? "online" : "warn"}>
              {proposal.lifecycle.toUpperCase()}
            </Badge>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: timeLeft < 60000 ? "var(--fn-red)" : "var(--fg-3)",
              }}
            >
              ⏱ {timeLabel}
            </div>
          </div>
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
          }}
        >
          {proposal.task_description}
        </div>

        {proposal.budget_estimate != null && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
            Budget estimate:{" "}
            <span
              style={{ color: proposal.budget_estimate > 0 ? "var(--fn-gold)" : "var(--fg-3)" }}
            >
              ${proposal.budget_estimate.toFixed(2)} USD
            </span>
          </div>
        )}

        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)" }}>
          Proposed by: {proposal.proposed_by}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="danger" onClick={() => onVeto(proposal)} disabled={isVetoing}>
            {isVetoing ? "Vetoing…" : "Veto"}
          </Btn>
          <Btn variant="secondary" onClick={() => onModify(proposal)} disabled={isVetoing || isApproving}>
            Modify
          </Btn>
          <Btn variant="primary" onClick={() => onApprove(proposal)} disabled={isVetoing || isApproving}>
            {isApproving ? "Spawning…" : "Approve"}
          </Btn>
        </div>
      </div>
    </HUDFrame>
  );
}

export function SpawnApprovalTray({ onModify, onSpawned }: SpawnApprovalTrayProps) {
  const [proposals, setProposals] = useState<SpawnProposalRecord[]>([]);
  const [vetoingIds, setVetoingIds] = useState<Set<string>>(new Set());
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
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
      onModify?.(proposal);
    },
    [onModify],
  );

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
          {proposals.length > 1 ? `⏱ ${proposals.length} Pending Approvals` : "⏱ Pending Approval"}
        </Eyebrow>
      </div>
      {proposals.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          onApprove={handleApprove}
          onVeto={handleVeto}
          onModify={handleModify}
          isVetoing={vetoingIds.has(p.id)}
          isApproving={approvingIds.has(p.id)}
        />
      ))}
    </div>
  );
}

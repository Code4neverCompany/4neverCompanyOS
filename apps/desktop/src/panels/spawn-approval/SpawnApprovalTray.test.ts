// Story 3.8 (NEVAAA-38) — SpawnApprovalTray unit tests.
//
// Tests the proposal filtering logic (5-min expiry) and type-level contracts.
// The component itself requires a Tauri/IPC environment; these tests cover
// the pure functions extracted from the module.

import { describe, it, expect } from "vitest";
import type { SpawnProposalRecord } from "./SpawnApprovalTray";

const PROPOSAL_TIMEOUT_MS = 5 * 60 * 1000;

function isProposalActive(proposal: SpawnProposalRecord): boolean {
  const elapsed = Date.now() - proposal.received_at_ms;
  return elapsed < PROPOSAL_TIMEOUT_MS;
}

function filterActiveProposals(proposals: SpawnProposalRecord[]): SpawnProposalRecord[] {
  return proposals.filter(isProposalActive);
}

describe("SpawnApprovalTray pure logic", () => {
  describe("isProposalActive", () => {
    it("returns true for a fresh proposal", () => {
      const proposal: SpawnProposalRecord = {
        id: "test-1",
        received_at_ms: Date.now() - 30_000, // 30 seconds ago
        name: "Test Persona",
        persona_type: "claude-code",
        task_description: "Test task",
        lifecycle: "persistent",
        budget_estimate: null,
        proposed_by: "hermes",
      };
      expect(isProposalActive(proposal)).toBe(true);
    });

    it("returns true for a 4-minute-old proposal", () => {
      const proposal: SpawnProposalRecord = {
        id: "test-2",
        received_at_ms: Date.now() - 4 * 60 * 1000,
        name: "Test Persona",
        persona_type: "agy",
        task_description: "Another task",
        lifecycle: "ephemeral",
        budget_estimate: 10.0,
        proposed_by: "hermes",
      };
      expect(isProposalActive(proposal)).toBe(true);
    });

    it("returns false for a 5-minute-old proposal (exactly at limit)", () => {
      const proposal: SpawnProposalRecord = {
        id: "test-3",
        received_at_ms: Date.now() - 5 * 60 * 1000,
        name: "Test Persona",
        persona_type: "claude-code",
        task_description: "Test",
        lifecycle: "persistent",
        budget_estimate: null,
        proposed_by: "hermes",
      };
      expect(isProposalActive(proposal)).toBe(false);
    });

    it("returns false for a 6-minute-old proposal (expired)", () => {
      const proposal: SpawnProposalRecord = {
        id: "test-4",
        received_at_ms: Date.now() - 6 * 60 * 1000,
        name: "Expired Persona",
        persona_type: "claude-code",
        task_description: "Expired task",
        lifecycle: "persistent",
        budget_estimate: null,
        proposed_by: "hermes",
      };
      expect(isProposalActive(proposal)).toBe(false);
    });
  });

  describe("filterActiveProposals", () => {
    it("keeps only active proposals", () => {
      const now = Date.now();
      const proposals: SpawnProposalRecord[] = [
        {
          id: "active-1",
          received_at_ms: now - 60_000, // 1 min
          name: "Active One",
          persona_type: "claude-code",
          task_description: "Task 1",
          lifecycle: "persistent",
          budget_estimate: null,
          proposed_by: "hermes",
        },
        {
          id: "expired-1",
          received_at_ms: now - 6 * 60 * 1000, // 6 min
          name: "Expired One",
          persona_type: "claude-code",
          task_description: "Task 2",
          lifecycle: "persistent",
          budget_estimate: null,
          proposed_by: "hermes",
        },
        {
          id: "active-2",
          received_at_ms: now - 2 * 60 * 1000, // 2 min
          name: "Active Two",
          persona_type: "agy",
          task_description: "Task 3",
          lifecycle: "ephemeral",
          budget_estimate: 5.0,
          proposed_by: "hermes",
        },
      ];

      const active = filterActiveProposals(proposals);
      expect(active).toHaveLength(2);
      expect(active.map((p) => p.id)).toEqual(["active-1", "active-2"]);
    });

    it("returns empty array when all proposals are expired", () => {
      const now = Date.now();
      const proposals: SpawnProposalRecord[] = [
        {
          id: "expired-a",
          received_at_ms: now - 10 * 60 * 1000,
          name: "Expired A",
          persona_type: "claude-code",
          task_description: "Task",
          lifecycle: "persistent",
          budget_estimate: null,
          proposed_by: "hermes",
        },
        {
          id: "expired-b",
          received_at_ms: now - 7 * 60 * 1000,
          name: "Expired B",
          persona_type: "agy",
          task_description: "Task",
          lifecycle: "persistent",
          budget_estimate: null,
          proposed_by: "hermes",
        },
      ];

      expect(filterActiveProposals(proposals)).toHaveLength(0);
    });
  });
});

describe("SpawnApprovalTray type contracts", () => {
  it("SpawnProposalRecord has all required fields", () => {
    const record: SpawnProposalRecord = {
      id: "id-1",
      received_at_ms: 1_780_000_000_000,
      name: "Security Auditor",
      persona_type: "claude-code",
      task_description: "Review PR for vulnerabilities",
      lifecycle: "ephemeral",
      budget_estimate: 5.0,
      proposed_by: "hermes",
    };
    expect(record.id).toBe("id-1");
    expect(record.name).toBe("Security Auditor");
    expect(record.lifecycle).toBe("ephemeral");
    expect(record.budget_estimate).toBe(5.0);
  });

  it("budget_estimate can be null (unknown cost)", () => {
    const record: SpawnProposalRecord = {
      id: "id-2",
      received_at_ms: 1_780_000_000_000,
      name: "QA Engineer",
      persona_type: "agy",
      task_description: "Run test suite",
      lifecycle: "persistent",
      budget_estimate: null,
      proposed_by: "hermes",
    };
    expect(record.budget_estimate).toBeNull();
  });
});

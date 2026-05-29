// @c4n/supermemory-client — agent session memory injection and flush pipelines.
//
// Injection: called at agent spawn — queries supermemory for persona-scoped
//   relevant context and returns a formatted prompt block.
// Flush:     called at agent stall/complete — takes extracted facts from the
//   session and persists them to supermemory under the persona's namespace.

import { SupermemoryClient } from "./client.js";
import type { InjectedContext, SessionFacts } from "./types.js";

/** Build the space name for a persona (namespacing convention). */
function personaSpace(personaId: string): string {
  return `persona:${personaId}`;
}

/** Build the space name for a project. */
function projectSpace(projectId: string): string {
  return `project:${projectId}`;
}

/**
 * Inject relevant memories into a spawning agent's session context.
 *
 * @param client   Initialized SupermemoryClient.
 * @param personaId  The persona being spawned (e.g. "dev", "architect").
 * @param taskSummary  Short description of the current task (used as search query).
 * @param projectId  Optional project scope; adds a second search space if provided.
 * @param limit    Max memories to inject (default 8).
 */
export async function injectSessionContext(
  client: SupermemoryClient,
  personaId: string,
  taskSummary: string,
  projectId?: string,
  limit = 8,
): Promise<InjectedContext> {
  const spaces = [personaSpace(personaId)];
  if (projectId !== undefined) spaces.push(projectSpace(projectId));

  const memories = await client.search(taskSummary, { limit, spaces });

  const promptBlock =
    memories.length === 0
      ? ""
      : [
          "## Recalled context (from previous sessions)",
          "",
          ...memories.map(
            (m, i) =>
              `${i + 1}. ${m.content.trim()} _(confidence: ${(m.score * 100).toFixed(0)}%)_`,
          ),
          "",
          "> These memories were retrieved by semantic similarity to the current task.",
          "> Treat them as background context, not authoritative ground truth.",
        ].join("\n");

  return { personaId, memories, promptBlock };
}

/**
 * Flush session facts to supermemory at session stall or completion.
 *
 * @param client     Initialized SupermemoryClient.
 * @param session    Facts extracted from the completed/stalled session.
 */
export async function flushSessionFacts(
  client: SupermemoryClient,
  session: SessionFacts,
): Promise<void> {
  const spaces = [personaSpace(session.personaId)];
  if (session.projectId !== undefined) spaces.push(projectSpace(session.projectId));

  const metadata: Record<string, unknown> = {
    persona: session.personaId,
    sessionAt: session.sessionAt,
  };
  if (session.projectId !== undefined) metadata["project"] = session.projectId;

  await Promise.all(
    session.facts.map((fact) =>
      client.add(fact, {
        spaces,
        metadata,
      }),
    ),
  );
}

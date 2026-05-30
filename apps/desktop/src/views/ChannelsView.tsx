// Channels view — Story 2.10 (NEVAAA-30) acceptance criteria:
//   "New panel/tab … showing a scrolling feed of bus events" with
//   per-event timestamp, source agent, event type, truncated payload
//   preview; a filter bar (by agent + by event type); a pause/resume
//   toggle; and filter/pause state that survives panel collapse/expand
//   within a session.
//
// The live data comes from the Story 2.9 bus relay via the session-scoped
// busChannelStore singleton. Because that store lives at module scope, the
// feed, filter, and pause state all persist across this component
// unmounting (collapse) and remounting (expand) as the user navigates the
// side rail — the subscription keeps draining in the background.

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Badge, Btn, Eyebrow, HUDFrame, StatusDot } from "@c4n/ui-tokens";
import { BUS_EVENT_TYPES, type BusEventType } from "@c4n/core";
import {
  collectAgents,
  connectionStatus,
  eventMatchesFilter,
  formatTimestamp,
  payloadPreview,
  type ChannelFilter,
} from "../lib/busChannelFeed";
import { busChannelStore } from "../lib/busChannelStore";

/** Accent color per event type — keeps the feed scannable at a glance. */
const TYPE_COLOR: Record<BusEventType, string> = {
  "progress.signal": "var(--fn-cyan)",
  "agent.lifecycle": "#6BFF8C",
  "agent.message": "var(--fg-2)",
  "stall.detected": "#FF8FA3",
  "stall.resumed": "#6BFF8C",
  spawn_proposal: "var(--fn-gold)",
  "workflow.phase.advanced": "#B8A0FF",
};

export function ChannelsView() {
  const state = useSyncExternalStore(busChannelStore.subscribe, busChannelStore.getSnapshot);

  // Open the subscription on first mount; the store keeps it alive for the
  // session, so this is a no-op on subsequent remounts (panel re-expand).
  useEffect(() => {
    busChannelStore.ensureStarted();
  }, []);

  const { events, paused, filter, connection } = state;
  const status = connectionStatus(connection);

  const agents = useMemo(() => collectAgents(events.map((e) => e.envelope)), [events]);
  const visible = useMemo(
    () => events.filter((e) => eventMatchesFilter(e.envelope, filter)),
    [events, filter],
  );

  const setFilter = (next: Partial<ChannelFilter>) =>
    busChannelStore.setFilter({ ...filter, ...next });

  return (
    <main
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <Eyebrow>Bus · live traffic</Eyebrow>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 32,
              color: "var(--fn-white)",
              letterSpacing: "-0.02em",
              margin: "6px 0 0",
            }}
          >
            Channel <span style={{ color: "var(--fn-gold)" }}>View</span>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot color={status.dot} />
          <Badge color={status.badge}>{status.label}</Badge>
        </div>
      </div>

      <FilterBar
        agents={agents}
        filter={filter}
        paused={paused}
        total={events.length}
        showing={visible.length}
        onAgentChange={(agent) => setFilter({ agent })}
        onTypeChange={(type) => setFilter({ type })}
        onTogglePause={() => busChannelStore.togglePaused()}
        onClear={() => busChannelStore.clear()}
      />

      <Feed events={visible} paused={paused} />
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────

function FilterBar({
  agents,
  filter,
  paused,
  total,
  showing,
  onAgentChange,
  onTypeChange,
  onTogglePause,
  onClear,
}: {
  agents: string[];
  filter: ChannelFilter;
  paused: boolean;
  total: number;
  showing: number;
  onAgentChange: (agent: string | null) => void;
  onTypeChange: (type: string | null) => void;
  onTogglePause: () => void;
  onClear: () => void;
}) {
  return (
    <HUDFrame style={{ padding: "12px 16px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <FilterSelect
          label="Agent"
          value={filter.agent ?? ""}
          onChange={(v) => onAgentChange(v === "" ? null : v)}
          options={agents.map((a) => ({ value: a, label: a }))}
        />
        <FilterSelect
          label="Type"
          value={filter.type ?? ""}
          onChange={(v) => onTypeChange(v === "" ? null : v)}
          options={BUS_EVENT_TYPES.map((t) => ({ value: t, label: t }))}
        />

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-3)" }}>
          {showing === total ? `${total} events` : `${showing} / ${total} events`}
        </span>
        <Btn variant={paused ? "primary" : "secondary"} onClick={onTogglePause}>
          {paused ? "Resume ▶" : "Pause ⏸"}
        </Btn>
        <Btn variant="ghost" onClick={onClear}>
          Clear
        </Btn>
      </div>
    </HUDFrame>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "rgba(10,11,20,0.85)",
          border: "1px solid var(--border-neutral)",
          color: "var(--fg-1)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 2,
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ────────────────────────────────────────────────────────────────────

function Feed({
  events,
  paused,
}: {
  events: ReadonlyArray<import("../lib/busChannelStore").FeedEvent>;
  paused: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Track whether the user is pinned to the bottom so we only auto-scroll
  // when they haven't scrolled up to inspect history.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || paused || !pinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [events, paused]);

  return (
    <HUDFrame
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "hidden",
      }}
    >
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ flex: 1, overflow: "auto", padding: "4px 0" }}
      >
        {events.length === 0 ? <EmptyFeed /> : events.map((e) => <FeedRow key={e.seq} event={e} />)}
      </div>
    </HUDFrame>
  );
}

function FeedRow({ event }: { event: import("../lib/busChannelStore").FeedEvent }) {
  const { envelope } = event;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "108px 140px 130px 1fr",
        gap: 12,
        alignItems: "baseline",
        padding: "5px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--fg-3)" }}>{formatTimestamp(envelope.ts)}</span>
      <span
        style={{
          color: "var(--fn-white)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {envelope.source}
      </span>
      <span style={{ color: TYPE_COLOR[envelope.type] ?? "var(--fg-2)" }}>{envelope.type}</span>
      <span
        style={{
          color: "var(--fg-2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {payloadPreview(envelope)}
      </span>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 32 }}>
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <Eyebrow color="cyan">Listening</Eyebrow>
        <p style={{ color: "var(--fg-3)", fontSize: 13, lineHeight: 1.5, margin: "8px 0 0" }}>
          No bus traffic yet. Spawn a persona or open a project — lifecycle, progress, message, and
          stall events will scroll in here live.
        </p>
      </div>
    </div>
  );
}

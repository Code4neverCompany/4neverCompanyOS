# Manual integration test — bus survives a Paperclip restart

Story 2.11 (NEVAAA-31). Verifies the bus relay and its desktop UI bridge
reconnect cleanly after Paperclip restarts, **without** restarting the desktop
app. Closes M2 alongside Story 2.10 (NEVAAA-30).

## What's under test

```
Paperclip SSE (HTTP/TLS)
      │
      ▼
feeder::run_feeder  ──drives──▶  Relay::run(connect, RetryPolicy::default())
      │                                   │ ConnectionState (watch)        │ BusEnvelope (broadcast)
      │                                   ▼                                ▼
      │                         bus_connection_subscribe            bus_subscribe
      │                                   │                                │
      ▼                                   ▼                                ▼
  reconnect w/ backoff            ChannelsView status bar          ChannelsView live feed
  (initial 500 ms → ×2 → cap 30 s)  "reconnecting… (attempt N)"
```

- **Reconnect + backoff** lives in `crates/bus-relay/src/relay.rs`
  (`Relay::run` + `RetryPolicy::default()`: `initial_delay` 500 ms, `multiplier`
  2, `max_delay` 30 s, `max_reconnects` None → retries forever).
- **Connection state** is published on a `tokio::sync::watch` channel
  (`Relay::connection_state`) and bridged to the webview by
  `bus_connection_subscribe` (`apps/desktop/src-tauri/src/ipc/mod.rs`).
- **UI** consumes it via `BusConnection` → `busChannelStore` →
  `ChannelsView` status bar (`connectionStatus` in `busChannelFeed.ts`).

## Acceptance criteria → how to verify

| AC                                                                       | Check                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------- |
| Relay detects disconnect, reconnects with exponential backoff (max 30 s) | Steps 4–6; watch the desktop log backoff sequence |
| After reconnect, bus traffic resumes within 5 s                          | Step 7; first envelope after restart lands < 5 s  |
| UI panel shows "reconnecting…" during the gap, then resumes live feed    | Step 5 status bar → Step 7 status bar             |
| Reconnect attempt count shown in panel status bar                        | Step 5: `reconnecting… (attempt N)`               |
| Manual integration test documented                                       | this file                                         |

## Prerequisites

- Windows 11 dev box with the desktop app built (see `CLAUDE.md` for the VS Dev
  Shell + `cargo tauri dev` setup).
- A Paperclip instance exposing the SSE event endpoint
  (`text/event-stream`). Note its URL and bearer token.
- The feeder reads its config from the environment **before** launching the
  desktop app (`apps/desktop/src-tauri/src/ipc/feeder.rs`):
  - `C4N_PAPERCLIP_SSE_URL` — the SSE endpoint (required; unset ⇒ relay idle).
  - `C4N_PAPERCLIP_TOKEN` — bearer token (optional).

## Procedure

1. **Configure + launch.** Export the env vars, then start the desktop app:

   ```bash
   export C4N_PAPERCLIP_SSE_URL="https://<paperclip-host>/events"
   export C4N_PAPERCLIP_TOKEN="<token>"   # omit if the endpoint is unauthenticated
   cargo tauri dev                         # from apps/desktop/src-tauri
   ```

   The desktop log should show
   `bus-relay feeder: starting Paperclip SSE supervision loop`.

2. **Open the Channel View.** Navigate to the **Bus · live traffic** panel.
   The status bar should read **live** (green dot). Trigger some bus activity
   (spawn a persona, emit a progress signal) and confirm events scroll in.

3. **Note the baseline.** Leave the panel open. The status pill = `live`.

4. **Restart Paperclip.** Stop the Paperclip process (or its SSE service),
   leaving the desktop app running untouched. The SSE stream drops (clean EOF
   or transport error).

5. **Observe the gap.** Within ~1 s the status bar flips to
   **`reconnecting… (attempt 1)`** (amber dot). As Paperclip stays down the
   attempt count climbs (`attempt 2`, `attempt 3`, …) and the backoff between
   attempts roughly doubles each cycle (500 ms → 1 s → 2 s → … capped at 30 s).
   The desktop log mirrors this with
   `bus-relay: Paperclip stream disconnected; reconnecting`. The feed itself
   stays frozen (no new envelopes) but **retains** the events already received —
   the panel is not cleared and the app is never restarted.

6. **Confirm the cap.** If you leave Paperclip down long enough, verify the
   inter-attempt delay stops growing at 30 s (it never exceeds `max_delay`).

7. **Bring Paperclip back.** Restart the Paperclip SSE service. On the next
   reconnect attempt the relay connects, the status bar returns to **live**
   (green), and new bus traffic resumes scrolling. **The first post-restart
   envelope should appear within 5 s** of Paperclip becoming reachable again
   (the worst case is one backoff window; with the 30 s cap, schedule the
   restart shortly after an attempt to stay within 5 s, or restart while the
   backoff is still small).

8. **No app restart required.** Confirm throughout that the desktop window was
   never closed/reopened — only Paperclip restarted.

## Pass criteria

- Status bar transitions `live → reconnecting… (attempt N) → live` with no app
  restart.
- Attempt count increments per cycle; backoff grows and caps at 30 s.
- Feed resumes within 5 s of Paperclip becoming reachable, with previously
  received events still present.

## Automated coverage backing this scenario

The pure reconnect + state-transition logic is unit-tested so this manual pass
only has to confirm the live wiring:

- `crates/bus-relay/src/relay.rs`
  - `connection_state_starts_connecting` — resting state.
  - `run_emits_connection_state_transitions` — `Connected` + `Reconnecting`
    (1-based attempt) across disconnect cycles.
  - `run_reconnects_after_each_disconnect`,
    `run_retries_on_connect_failure_then_recovers` — backoff supervision loop.
- `apps/desktop/src-tauri/src/ipc/mod.rs`
  - `connection_state_serializes_to_tagged_wire_shape` — wire shape.
  - `connection_state_stream_delivers_current_then_transitions` — current state
    then live transitions over the bridge.
  - `connection_state_unsubscribe_stops_task` — teardown.
- `apps/desktop/src/lib/busChannelFeed.test.ts`
  - `connectionStatus` — status-bar label/colors incl. the attempt count.

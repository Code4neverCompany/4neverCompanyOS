// Story 1.16c — PTY tail bridge.
//
// Wraps a single xterm.js Terminal that displays the live output of a
// supervised persona (Dev, Hermes, future personas) by tailing the
// supervisor's `.pty.raw` tap file via the Tauri `tail_persona_pty`
// Channel command.
//
// Architecture context:
//   - Zellij owns the spawned process (per D-2 + Story 1.11).
//   - The persona-supervisor (D-11, Story 1.16a) PTY-wraps the child and
//     appends raw PTY bytes to `<vault>/personas/<id>/log/<date>.pty.raw`.
//   - The desktop's `tail_persona_pty` command opens a Tauri Channel and
//     streams new bytes from that file at 80ms intervals.
//   - This class consumes the Channel and feeds bytes into xterm.js,
//     giving a full-fidelity TUI display (color, cursor positioning,
//     scrollback) embedded in the Tauri webview.
//
// Display-only in 1.16c. Bidirectional input (write back into the PTY
// via `.pty.in` + supervisor watcher) ships in 1.16d. Until then users
// can still interact via `zellij attach <session>` in their own terminal.
//
// React + StrictMode notes:
//   - The Rust side dedupes per persona_id: starting a new tail cancels
//     any existing one. This makes double-mounts (StrictMode dev) safe.
//   - We still call dispose() on unmount as a courtesy so the tokio
//     task exits promptly instead of waiting for the next mount.

import { invoke, Channel } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import type { ITerminalOptions } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";

// xterm.css is imported once globally from `styles.css` so multiple
// PtyTail instances share the same stylesheet.

/**
 * Default xterm.js options tuned for the 4never HUD aesthetic. Colors
 * pull from the design tokens where ANSI maps cleanly; mono font matches
 * the rest of the shell's code-display surfaces.
 */
const DEFAULT_TERMINAL_OPTIONS: ITerminalOptions = {
  fontFamily: "var(--font-mono), 'JetBrains Mono', 'Fira Code', Consolas, monospace",
  fontSize: 12,
  lineHeight: 1.25,
  cursorBlink: false,
  cursorStyle: "block",
  scrollback: 10_000,
  convertEol: false,
  allowProposedApi: true,
  theme: {
    background: "#0A0B14",
    foreground: "#E8EAEF",
    cursor: "#FFC400",
    cursorAccent: "#0A0B14",
    selectionBackground: "rgba(255, 196, 0, 0.25)",
    // ANSI palette — kept close to xterm.js defaults so TUI apps look
    // right, with cyan/yellow/magenta nudged toward the 4never accents
    // (gold/cyan/purple) for visual coherence with the rest of the shell.
    black: "#0A0B14",
    red: "#FF5577",
    green: "#6BFF8C",
    yellow: "#FFC400",
    blue: "#5DADE2",
    magenta: "#A855F7",
    cyan: "#5EE5D0",
    white: "#E8EAEF",
    brightBlack: "#3F4150",
    brightRed: "#FF7A95",
    brightGreen: "#8FFFA8",
    brightYellow: "#FFD942",
    brightBlue: "#7BC3F0",
    brightMagenta: "#C084FC",
    brightCyan: "#80F0DC",
    brightWhite: "#FFFFFF",
  },
};

export interface PtyTailOptions {
  /**
   * Persona identity — matches the supervisor's `persona_id` arg. The
   * tap file resolves to `<vault>/personas/<personaId>/log/<date>.pty.raw`.
   */
  personaId: string;
  /**
   * Optional xterm.js overrides merged on top of the 4never defaults.
   */
  terminalOptions?: ITerminalOptions;
}

/**
 * A PtyTail attaches an xterm.js Terminal to a DOM container and streams
 * the supervisor's `.pty.raw` bytes into it. Lifecycle:
 *
 * ```ts
 * const tail = new PtyTail({ personaId: "hermes" });
 * await tail.mount(containerRef.current!);
 * // …user navigates away…
 * await tail.dispose();
 * ```
 *
 * The class is intentionally non-React so it survives StrictMode
 * remount-without-effect-runs and can be reused by both ProjectsView
 * (Dev terminal) and MemoryView (Hermes terminal) without prop-drilling
 * xterm's imperative API through React state.
 */
export class PtyTail {
  readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly personaId: string;
  private channel: Channel<number[] | Uint8Array> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mounted = false;
  private disposed = false;

  constructor(opts: PtyTailOptions) {
    this.personaId = opts.personaId;
    this.terminal = new Terminal({
      ...DEFAULT_TERMINAL_OPTIONS,
      ...opts.terminalOptions,
    });
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
  }

  /**
   * Attach the terminal to a DOM container and start tailing the tap
   * file. Safe to call multiple times — subsequent calls are no-ops if
   * already mounted (or already disposed).
   */
  async mount(container: HTMLElement): Promise<void> {
    if (this.mounted || this.disposed) return;
    this.mounted = true;

    this.terminal.open(container);
    this.fit();

    // Re-fit on container resize so cols/rows track the layout.
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.fit());
      this.resizeObserver.observe(container);
    }

    // Open the byte channel. Tauri 2 may deliver the Vec<u8> as a JSON
    // number array OR a Uint8Array depending on transport — both branch
    // through the same `terminal.write(Uint8Array)` path.
    this.channel = new Channel<number[] | Uint8Array>();
    this.channel.onmessage = (chunk) => {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      // xterm.js's write() accepts Uint8Array and interprets it as raw
      // bytes (ANSI escapes preserved). Don't decode to UTF-8 first —
      // multi-byte sequences may straddle chunk boundaries.
      this.terminal.write(bytes);
    };

    try {
      await invoke("tail_persona_pty", {
        personaId: this.personaId,
        onChunk: this.channel,
      });
    } catch (e) {
      // Most common cause: workspace config not yet written (first-run
      // wizard incomplete). Surface a hint inside the terminal itself
      // so the user sees what's wrong without scrolling around.
      const msg = `\r\n\x1b[31m[PtyTail] could not start tail: ${String(e)}\x1b[0m\r\n`;
      this.terminal.write(msg);
    }
  }

  /**
   * Recompute cols/rows from the current container size. Called
   * automatically on container resize; also exposed for callers that
   * change layout (panel toggle, etc.).
   */
  fit(): void {
    try {
      this.fitAddon.fit();
    } catch {
      // fit() throws if the terminal isn't attached or has zero
      // dimensions yet — safe to ignore.
    }
  }

  /**
   * Stop the tail task and dispose the underlying xterm.js Terminal.
   * Safe to call multiple times.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    if (this.mounted) {
      try {
        await invoke("stop_persona_pty_tail", { personaId: this.personaId });
      } catch {
        // Backend already torn down (app exiting) — non-fatal.
      }
    }
    this.mounted = false;

    this.channel = null;
    this.terminal.dispose();
  }
}

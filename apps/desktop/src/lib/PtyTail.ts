// Story 1.16c + 1.16d — bidirectional PTY bridge.
//
// Wraps a single xterm.js Terminal connected to a supervised persona
// (Dev, Hermes, future personas) in both directions:
//
//   - DISPLAY (1.16c): tails the supervisor's `.pty.raw` tap file via
//     the `tail_persona_pty` Tauri Channel; feeds bytes into xterm.js
//     for full-fidelity TUI rendering.
//   - INPUT (1.16d): xterm.js's `onData` callback fires for every
//     keystroke (including ANSI-encoded special keys); we forward the
//     bytes through `write_persona_pty_in`, which appends them to
//     `current.pty.in`. The supervisor's watcher task drains them into
//     the child's stdin at ~50ms cadence.
//
// Architecture context:
//   - Zellij owns the spawned process (per D-2 + Story 1.11).
//   - The persona-supervisor (D-11, Story 1.16a) PTY-wraps the child and
//     appends raw PTY bytes to `<vault>/personas/<id>/log/<date>.pty.raw`.
//   - Input flows through `<vault>/personas/<id>/log/current.pty.in`
//     (per-supervisor-instance, truncated at startup).
//
// React + StrictMode notes:
//   - The Rust side dedupes per persona_id: starting a new tail cancels
//     any existing one. This makes double-mounts (StrictMode dev) safe.
//   - We still call dispose() on unmount as a courtesy so the tokio
//     task exits promptly instead of waiting for the next mount.
//   - onData fire-and-forget: we don't `await` the write, so a slow
//     filesystem can't stall the terminal's input loop. Lost keystrokes
//     surface in the Rust logs (`tracing::warn!` on write failure).

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
   * Attach the terminal to a DOM container, start tailing the tap
   * file, and wire keystrokes to the supervisor. Safe to call multiple
   * times — subsequent calls are no-ops if already mounted (or already
   * disposed).
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

    // Story 1.16d: keystroke path. xterm.js's onData fires for every
    // user input — printable chars, Backspace, arrow keys (encoded as
    // ESC[A/B/C/D), Ctrl-C (\x03), Esc-sequences, paste content, etc.
    // We forward the raw bytes to the supervisor via .pty.in.
    //
    // Fire-and-forget: don't `await` the invoke so a slow disk can't
    // stall xterm.js's input pump. The Tauri command is sync + cheap
    // (open + append + flush), so backpressure here is unlikely.
    this.terminal.onData((data) => {
      if (this.disposed) return;
      const bytes = Array.from(new TextEncoder().encode(data));
      void invoke("write_persona_pty_in", {
        personaId: this.personaId,
        bytes,
      }).catch(() => {
        // Swallow per-keystroke errors — the user will notice if input
        // isn't reaching the child (visible in the terminal's echo).
        // Bulk failures show up in the Rust tracing layer.
      });
    });
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

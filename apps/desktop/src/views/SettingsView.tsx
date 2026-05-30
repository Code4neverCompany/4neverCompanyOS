// Settings view — Story 1.19.
//
// The third in-product attribution surface (alongside the wizard's
// DoneStep credit and the app-launch splash). This is the FULL, canonical
// "Powered by…" block: every bundled component with its license + pinned
// version, every integrated tool with its license, plus a pointer to the
// repo-root LICENSES.md for full license texts.
//
// All data comes from @c4n/core's renderAttributionMarkdown() — the single
// source-of-truth shared by all three surfaces (AC: "all three surfaces
// render the same canonical attribution text").
//
// Layout mirrors MemoryView.tsx's ViewShell + HUDFrame pattern (Story 1.16c)
// for visual consistency across the desktop shell's views.
//
// Story 5.2 adds the Supermemory settings panel (Memory → Supermemory) above
// the About panel.

import { renderAttributionMarkdown } from "@c4n/core";
import { Badge, Eyebrow, HUDFrame } from "@c4n/ui-tokens";
import { SupermemorySettings } from "./SupermemorySettings";
import { GithubSettings } from "./GithubSettings";
import { BudgetSettings } from "./BudgetSettings";

// The public repo's LICENSES.md — the canonical full-text license file.
// Shown as selectable reference text (not a click-to-open) so this view
// needs no external-opener dependency. M2 polish can make it clickable
// once @tauri-apps/plugin-opener's JS companion is wired in.
const LICENSES_REPO_PATH = "LICENSES.md";
const LICENSES_URL = "https://github.com/Code4neverCompany/4neverCompanyOS/blob/main/LICENSES.md";

export function SettingsView() {
  const { bundled, integrated } = renderAttributionMarkdown();

  return (
    <ViewShell eyebrow="Settings" title="4neverCompany" titleAccent="OS">
      <SupermemorySettings />

      <div style={{ height: 18 }} />

      <BudgetSettings />

      <div style={{ height: 18 }} />

      <GithubSettings />

      <div style={{ height: 18 }} />

      <HUDFrame style={{ padding: 24 }}>
        <Eyebrow color="cyan">About</Eyebrow>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            margin: "6px 0 4px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 22,
              color: "var(--fn-white)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            4neverCompany OS
          </h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fn-cyan)" }}>
            v0.0.1
          </span>
          <Badge color="warn">ALPHA</Badge>
        </div>
        <p style={{ color: "var(--fg-3)", fontSize: 13, margin: "0 0 18px", maxWidth: 620 }}>
          A packaged desktop bundle of Paperclip, the Hermes Agent, and the BMad Method. The
          components below are credited per their license terms.
        </p>

        <AttributionTable
          heading="Bundled with"
          subtitle="Shipped inside the installer — permissive licenses, full attribution."
          rows={bundled}
          showVersion
        />

        <div style={{ height: 18 }} />

        <AttributionTable
          heading="Integrated with"
          subtitle="Installed via each tool's own official channel; you authenticate with your own credentials. We integrate, not redistribute."
          rows={integrated}
          showVersion={false}
        />

        <LicensesFooter />
      </HUDFrame>
    </ViewShell>
  );
}

// ────────────────────────────────────────────────────────────────────
// View shell — same shape as MemoryView.tsx. (A future refactor may lift
// this into a shared views/ViewShell once a third view needs it.)
function ViewShell({
  eyebrow,
  title,
  titleAccent,
  children,
}: {
  eyebrow: string;
  title: string;
  titleAccent: string;
  children: React.ReactNode;
}) {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        position: "relative",
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 0,
      }}
    >
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
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
          {title} <span style={{ color: "var(--fn-gold)" }}>{titleAccent}</span>
        </h1>
      </div>
      {children}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────

type Row = {
  name: string;
  license: string;
  source: string;
  copyright?: string;
  version?: string;
};

function AttributionTable({
  heading,
  subtitle,
  rows,
  showVersion,
}: {
  heading: string;
  subtitle: string;
  rows: readonly Row[];
  showVersion: boolean;
}) {
  return (
    <section>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fn-gold)",
          marginBottom: 4,
        }}
      >
        {heading}
      </div>
      <p style={{ color: "var(--fg-3)", fontSize: 12, margin: "0 0 10px", maxWidth: 620 }}>
        {subtitle}
      </p>
      <div
        style={{
          border: "1px solid var(--border-neutral)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        {rows.map((row, i) => (
          <div
            key={row.name}
            style={{
              display: "grid",
              gridTemplateColumns: showVersion ? "1.4fr 1fr 0.8fr" : "1.6fr 1.2fr",
              gap: 12,
              padding: "8px 12px",
              alignItems: "baseline",
              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ color: "var(--fn-white)", fontWeight: 600 }}>{row.name}</span>
              {row.copyright && (
                <span style={{ color: "var(--fg-3)", marginLeft: 8, fontSize: 11 }}>
                  {row.copyright}
                </span>
              )}
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--fg-3)",
                  marginTop: 2,
                  wordBreak: "break-all",
                }}
              >
                {row.source}
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", color: "var(--fg-2)" }}>
              {row.license}
            </div>
            {showVersion && (
              <div style={{ fontFamily: "var(--font-mono)", color: "var(--fn-cyan)" }}>
                {row.version}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────

function LicensesFooter() {
  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 14,
        borderTop: "1px solid var(--border-neutral)",
        fontSize: 12,
        color: "var(--fg-3)",
      }}
    >
      Full license texts:{" "}
      <code style={{ color: "var(--fn-cyan)", fontFamily: "var(--font-mono)" }}>
        {LICENSES_REPO_PATH}
      </code>{" "}
      at the project root ·{" "}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--fg-2)",
          userSelect: "all",
          wordBreak: "break-all",
        }}
      >
        {LICENSES_URL}
      </span>
    </div>
  );
}

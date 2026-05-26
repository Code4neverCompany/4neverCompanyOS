// Top-level shell. M1 starts here: this component will eventually host
// Paperclip's React UI (via PaperclipHost from src/paperclip-host/)
// and inject the workspace panels via createPortal into Paperclip's
// named slots. For now (M0 scaffolding), it renders a placeholder.

export function App() {
  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>4neverCompany OS</h1>
      <p>
        Desktop shell scaffolding. M1 stories will replace this placeholder with the Paperclip-host
        + workspace-injected panels per Architecture D-13.
      </p>
      <p>
        <small>
          Story 1.2 (monorepo scaffolding) complete. Next: Story 1.6 (vault directory layout spec) →
          M1 stories.
        </small>
      </p>
    </main>
  );
}

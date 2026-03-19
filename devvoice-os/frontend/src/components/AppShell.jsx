export default function AppShell({ header, banner, core, dock, side }) {
  return (
    <main className="jarvis-shell">
      <div className="jarvis-backdrop" />
      <div className="jarvis-grid" />
      <div className="jarvis-layout">
        {header}
        {banner}
        <div className="jarvis-main">
          {core}
          {side}
        </div>
        {dock}
      </div>
    </main>
  );
}

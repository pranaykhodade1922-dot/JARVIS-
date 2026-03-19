import StatusChip from "./StatusChip.jsx";

export default function HeaderBar({ state, isScreenSharing }) {
  return (
    <header className="hud-header">
      <div className="hud-brand">
        <p className="hud-kicker">DevVoice OS</p>
        <h1>JARVIS</h1>
        <p className="hud-subtitle">Voice-First Screen Intelligence System</p>
      </div>

      <div className="hud-header-side">
        <StatusChip state={state} />
        <div className={`share-chip ${isScreenSharing ? "active" : ""}`}>
          {isScreenSharing ? "Screen Linked" : "Screen Offline"}
        </div>
      </div>
    </header>
  );
}

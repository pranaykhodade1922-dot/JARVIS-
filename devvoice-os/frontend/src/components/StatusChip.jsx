const STATUS_LABELS = {
  idle: "Idle",
  listening: "Listening",
  screen_shared: "Screen Shared",
  analyzing: "Analyzing",
  speaking: "Speaking",
  error: "Error",
};

export default function StatusChip({ state }) {
  return (
    <div className={`status-chip ${state}`}>
      <span className="status-chip-dot" />
      <span>{STATUS_LABELS[state] || state}</span>
    </div>
  );
}

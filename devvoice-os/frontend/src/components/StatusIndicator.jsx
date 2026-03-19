const STATUS_COPY = {
  Idle: "Ready",
  Listening: "Listening",
  Processing: "Processing",
  Analyzing: "Analyzing Screen",
  Executing: "Executing",
  Speaking: "Speaking"
};

export default function StatusIndicator({ status, isListening }) {
  const label = STATUS_COPY[status] || status;

  return (
    <div className={`status-indicator ${isListening ? "live" : ""}`}>
      <span className="status-dot" />
      <div>
        <p>Status</p>
        <strong>{label}</strong>
      </div>
    </div>
  );
}

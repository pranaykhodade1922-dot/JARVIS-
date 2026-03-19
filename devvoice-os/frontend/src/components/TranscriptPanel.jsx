export default function TranscriptPanel({
  wakeTranscript,
  commandTranscript,
  interimTranscript,
  wakeHint,
}) {
  return (
    <section className="stream-card">
      <div className="response-card-head">
        <p className="section-label">Voice Trace</p>
        <span className="mini-chip">Live</span>
      </div>
      <p className="history-entry-label">Wake Transcript</p>
      <p className="stream-primary">{wakeTranscript || "No wake phrase heard yet."}</p>
      <p className="history-entry-label" style={{ marginTop: "12px" }}>
        Command Transcript
      </p>
      <p className="stream-primary">{commandTranscript || "No command captured yet."}</p>
      <p className="stream-secondary">{interimTranscript || wakeHint}</p>
    </section>
  );
}

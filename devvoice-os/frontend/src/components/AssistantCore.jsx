const CORE_COPY = {
  idle: "Awaiting command",
  listening: "Listening for voice input",
  screen_shared: "Screen connected and ready",
  analyzing: "Analyzing captured frame",
  speaking: "Delivering response",
  error: "Recovery mode",
};

export default function AssistantCore({
  state,
  transcript,
  interimTranscript,
  response,
}) {
  const transcriptText = transcript || interimTranscript || "No speech captured yet.";
  const responseText =
    response?.responseText ||
    "Share a screen and ask Jarvis to analyze a page, explain code, or summarize a visible topic.";

  return (
    <section className="assistant-core panel-frame">
      <div className="core-visual">
        <div className={`orb-shell ${state}`}>
          <div className="orb-ring ring-a" />
          <div className="orb-ring ring-b" />
          <div className="orb-core" />
          <div className="orb-scan" />
        </div>
        <div className="core-status-copy">
          <p className="section-label">Mode</p>
          <strong>{CORE_COPY[state] || state}</strong>
        </div>
      </div>

      <div className="core-stream">
        <article className="stream-card">
          <p className="section-label">Transcript</p>
          <p className="stream-primary">{transcriptText}</p>
          {interimTranscript && transcript ? (
            <p className="stream-secondary">{interimTranscript}</p>
          ) : null}
        </article>

        <article className="stream-card response-card">
          <div className="response-card-head">
            <p className="section-label">Assistant Response</p>
            {response?.title ? <span className="mini-chip">{response.title}</span> : null}
          </div>
          <p className="stream-primary">{responseText}</p>
          {response?.suggestedFollowUp ? (
            <p className="stream-secondary">{response.suggestedFollowUp}</p>
          ) : null}
          {response?.contentType ? (
            <div className="response-metadata">
              <span>{response.contentType}</span>
              <span>{response.intent}</span>
              <span>{response.resolvedTranscript === "true" ? "Resolved" : "Needs Review"}</span>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

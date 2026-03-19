const STATE_META = {
  idle: { label: "Idle", detail: "Voice loop is paused." },
  passive: { label: "Passive", detail: "Listening for hello jarvis, hey jarvis, or jarvis." },
  listening: { label: "Listening", detail: "Listening only for the spoken command." },
  processing: { label: "Processing", detail: "Backend and Gemini are handling the request." },
  speaking: { label: "Speaking", detail: "Reply is being spoken before passive mode resumes." },
  error: { label: "Error", detail: "The assistant hit an error and is recovering." },
};

export default function AssistantStatus({
  state,
  isListening,
  isScreenShared,
  backendHealthy,
  backendModel,
}) {
  const meta = STATE_META[state] || STATE_META.idle;

  return (
    <div className="assistant-status">
      <div className="assistant-status-main">
        <span className={`assistant-status-dot ${isListening ? "live" : ""}`} />
        <div>
          <p>Status</p>
          <strong>{meta.label}</strong>
        </div>
      </div>
      <span className={`screen-share-badge ${isScreenShared ? "active" : ""}`}>
        {isScreenShared ? "Screen Shared" : "Screen Offline"}
      </span>
      <span className={`screen-share-badge ${backendHealthy ? "active" : ""}`}>
        {backendHealthy ? `Backend OK ${backendModel ? `• ${backendModel}` : ""}` : "Backend Offline"}
      </span>
      <span className="mini-chip">{meta.detail}</span>
    </div>
  );
}

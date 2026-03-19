export default function ResponsePanel({ response, history }) {
  return (
    <section className="stream-card response-card">
      <div className="response-card-head">
        <p className="section-label">Assistant Response</p>
        <span className="mini-chip">{response?.intent || "waiting"}</span>
      </div>
      <p className="stream-primary">
        {response?.reply || "Assistant output appears here after a command or screen analysis request."}
      </p>
      {response?.followUp ? <p className="stream-secondary">{response.followUp}</p> : null}
      <div className="response-metadata">
        <span>{response?.resolved ? "Resolved" : "Needs Attention"}</span>
        <span>{response?.route || "pending"}</span>
        <span>{response?.provider?.gemini?.active ? "Gemini Active" : "Gemini Inactive"}</span>
      </div>
      <div className="history-list">
        {history.length ? (
          history.map((item) => (
            <article className="history-entry" key={item.id}>
              <p className="history-entry-label">Command</p>
              <p className="history-entry-main">{item.command}</p>
              <p className="history-entry-label">Reply</p>
              <p className="history-entry-sub">{item.reply}</p>
            </article>
          ))
        ) : (
          <p className="history-empty">No commands executed yet.</p>
        )}
      </div>
    </section>
  );
}

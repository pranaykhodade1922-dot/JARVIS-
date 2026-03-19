export default function CommandHistory({ history }) {
  return (
    <article className="panel history-panel">
      <div className="panel-header">
        <h2>Command History</h2>
        <span className="panel-tag">{history.length} items</span>
      </div>
      <div className="panel-body history-body">
        {history.length ? (
          history.map((item) => (
            <div className="history-item" key={item.timestamp}>
              <p className="history-transcript">{item.transcript}</p>
              <p className="history-response">{item.responseText}</p>
            </div>
          ))
        ) : (
          <p className="empty-state">The last five interactions will appear here.</p>
        )}
      </div>
    </article>
  );
}

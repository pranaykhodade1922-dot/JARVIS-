export default function HistoryPanel({ history }) {
  return (
    <aside className="history-panel panel-frame">
      <div className="history-head">
        <p className="section-label">Recent Actions</p>
        <span className="mini-chip">{history.length}</span>
      </div>

      <div className="history-list">
        {history.length ? (
          history.map((item) => (
            <article className="history-entry" key={item.timestamp}>
              <p className="history-entry-label">Command</p>
              <p className="history-entry-main">{item.transcript}</p>
              <p className="history-entry-label">Response</p>
              <p className="history-entry-sub">{item.responseText}</p>
            </article>
          ))
        ) : (
          <p className="history-empty">Recent commands will appear here.</p>
        )}
      </div>
    </aside>
  );
}

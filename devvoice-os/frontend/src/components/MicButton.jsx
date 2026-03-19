export default function MicButton({ isListening, onClick, disabled }) {
  return (
    <button className={`mic-button ${isListening ? "active" : ""}`} onClick={onClick} disabled={disabled}>
      <span className="mic-core" />
      <span>{isListening ? "Stop Listening" : "Start Listening"}</span>
    </button>
  );
}

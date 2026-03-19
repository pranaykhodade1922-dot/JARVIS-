const CONTROLS = [
  { id: "startPassive", label: "Start Passive" },
  { id: "stopAssistant", label: "Stop Voice" },
  { id: "shareScreen", label: "Share Screen" },
  { id: "stopSharing", label: "Stop Share" },
  { id: "analyzeScreen", label: "Analyze Screen" },
];

export default function ControlDock({ handlers, disabledMap = {} }) {
  return (
    <section className="control-dock panel-frame">
      {CONTROLS.map((control) => (
        <button
          key={control.id}
          type="button"
          className="dock-button"
          onClick={handlers[control.id]}
          disabled={Boolean(disabledMap[control.id])}
        >
          <span className="dock-button-mark" />
          <span>{control.label}</span>
        </button>
      ))}
    </section>
  );
}

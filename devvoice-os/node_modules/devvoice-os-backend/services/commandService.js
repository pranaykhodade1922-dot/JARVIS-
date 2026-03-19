const COMMAND_MAP = [
  {
    type: "stop",
    patterns: ["stop", "stop listening", "stop jarvis", "stop assistant"],
    reply: "Stopping voice capture and speech output.",
    action: { type: "stop_assistant" },
  },
  {
    type: "repeat",
    patterns: ["repeat", "say that again", "repeat that", "repeat last answer"],
    reply: "Repeating the last assistant reply.",
    action: { type: "repeat_last_reply" },
  },
  {
    type: "help",
    patterns: ["help", "what can you do", "show help"],
    reply:
      "You can ask any question, use your microphone, analyze your screen, or use commands like stop, repeat, and clear memory.",
    action: { type: "show_help" },
  },
  {
    type: "clear_memory",
    patterns: ["clear memory", "clear history", "clear chat", "clear conversation"],
    reply: "Clearing the local conversation history.",
    action: { type: "clear_history" },
  },
];

const SCREEN_TASKS = {
  DESCRIBE: "describe_screen",
  SOLVE: "solve_question_from_screen",
};

const DESCRIBE_SCREEN_PATTERNS = [
  "analyze my screen",
  "analyze this screen",
  "what is on my screen",
  "what s on my screen",
  "describe my screen",
  "describe this screen",
  "explain this screen",
  "look at my screen",
  "inspect my screen",
];

const SOLVE_SCREEN_PATTERNS = [
  "solve the question on my screen",
  "answer the question on my screen",
  "read my screen and solve it",
  "read my shared screen and solve it",
  "check my shared screen and give me the answer",
  "check my shared screen and give me answer",
  "solve this coding question from screen",
  "solve this coding question on screen",
  "tell me the answer to the question on screen",
  "solve the coding question on my screen",
  "answer the coding question on my screen",
  "give me the answer from my screen",
];

const normalize = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const detectScreenTask = (value = "") => {
  const normalized = normalize(value);
  if (!normalized) {
    return null;
  }

  if (SOLVE_SCREEN_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return SCREEN_TASKS.SOLVE;
  }

  const mentionsScreen = /\b(screen|shared screen|screenshot|display|window)\b/.test(normalized);
  const asksToSolve =
    /\b(solve|answer|fix|complete|write code|give me answer|give answer|coding question|question|problem)\b/.test(
      normalized,
    );
  if (mentionsScreen && asksToSolve) {
    return SCREEN_TASKS.SOLVE;
  }

  if (DESCRIBE_SCREEN_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return SCREEN_TASKS.DESCRIBE;
  }

  const asksToDescribe = /\b(analyze|describe|what is on|what s on|look at|inspect|explain)\b/.test(normalized);
  if (mentionsScreen && asksToDescribe) {
    return SCREEN_TASKS.DESCRIBE;
  }

  return null;
};

export function isExplicitCommand(value = "") {
  const normalized = normalize(value);
  return Boolean(detectScreenTask(normalized))
    || COMMAND_MAP.some((command) => command.patterns.some((pattern) => normalized === pattern));
}

export function resolveCommand(value = "") {
  const normalized = normalize(value);
  const screenTask = detectScreenTask(normalized);

  if (screenTask) {
    return {
      matched: true,
      reply:
        screenTask === SCREEN_TASKS.SOLVE
          ? "Screen question solving requested. Share your screen so I can read the visible question and answer it directly."
          : "Screen analysis requested. Share your screen so I can inspect the current frame.",
      action: {
        type: "analyze_screen",
        task: screenTask,
        prompt: value,
      },
      type: "screen_analysis",
    };
  }

  const match = COMMAND_MAP.find((command) => command.patterns.some((pattern) => normalized === pattern));

  if (!match) {
    return {
      matched: false,
      reply: "",
      action: null,
      type: "unknown",
    };
  }

  return {
    matched: true,
    reply: match.reply,
    action: match.action,
    type: match.type,
  };
}

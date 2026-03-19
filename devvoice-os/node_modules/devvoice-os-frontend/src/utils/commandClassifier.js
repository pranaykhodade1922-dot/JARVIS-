const COMMAND_PATTERNS = [
  "stop",
  "stop listening",
  "stop assistant",
  "repeat",
  "repeat that",
  "repeat last answer",
  "help",
  "show help",
  "clear memory",
  "clear history",
  "clear chat",
  "clear conversation",
];

const WAKE_WORDS = ["jarvis", "hello jarvis", "hey jarvis"];

export const SCREEN_TASKS = {
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
  "what is on screen",
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

export const normalizeText = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const containsWakeWord = (value = "") => {
  const normalized = normalizeText(value);
  return WAKE_WORDS.some((wakeWord) => normalized.includes(wakeWord));
};

export const stripWakeWord = (value = "") => {
  const normalized = normalizeText(value);
  return WAKE_WORDS.reduce((current, wakeWord) => current.replace(wakeWord, " "), normalized)
    .replace(/\s+/g, " ")
    .trim();
};

export const getScreenTaskFromText = (value = "") => {
  const normalized = normalizeText(value);
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

export const isScreenIntent = (value = "") => Boolean(getScreenTaskFromText(value));

export const isExplicitCommand = (value = "") => {
  const normalized = normalizeText(value);
  return COMMAND_PATTERNS.includes(normalized) || Boolean(getScreenTaskFromText(normalized));
};

const JSON_OBJECT_PATTERN = /\{[\s\S]*\}/;

export const createScreenAnalysisFallback = (overrides = {}) => ({
  title: "Screen Analysis",
  contentType: "unknown",
  response: "I could not clearly analyze the screen. Please zoom in or share the content more clearly.",
  resolved: false,
  suggestedFollowUp: "Would you like to try again with a clearer screen?",
  ...overrides,
});

const tryParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const parseModelJson = (rawText, fallback = createScreenAnalysisFallback()) => {
  if (typeof rawText !== "string" || !rawText.trim()) {
    return fallback;
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const direct = tryParseJson(cleaned);
  if (direct) {
    return direct;
  }

  const extractedBlock = cleaned.match(JSON_OBJECT_PATTERN)?.[0];
  const extracted = extractedBlock ? tryParseJson(extractedBlock) : null;
  if (extracted) {
    return extracted;
  }

  return fallback;
};

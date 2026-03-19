const FILLER_LINE_PATTERNS = [
  /^sure[,.!\s]/i,
  /^here(?:'s| is)\b/i,
  /^let me know\b/i,
  /^in conclusion\b/i,
  /^to summarize\b/i,
  /^summary[:\s]/i,
  /^overall[:,\s]/i,
  /^i can help\b/i,
  /^brief explanation[:\s]/i,
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripMarkdownDecorators = (value = "") => {
  let output = String(value || "").replace(/\r/g, "").trim();

  output = output
    .replace(/^```[a-zA-Z0-9_-]*\s*/gm, "")
    .replace(/```$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return output;
};

const stripFillerLines = (lines = []) =>
  lines.filter((line) => !FILLER_LINE_PATTERNS.some((pattern) => pattern.test(line)));

const splitIntoDisplayLines = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return [];
  }

  const rawLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const expanded = [];
  for (const line of rawLines) {
    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      expanded.push(line);
      continue;
    }

    expanded.push(...sentences);
  }

  return expanded;
};

export const normalizePlainTextResponse = (
  value,
  {
    maxLines = 6,
    maxChars = 360,
  } = {},
) => {
  const stripped = stripMarkdownDecorators(value);
  const lines = stripFillerLines(splitIntoDisplayLines(stripped));

  if (!lines.length) {
    return "No answer.";
  }

  const selected = [];
  let charCount = 0;

  for (const line of lines) {
    const cleanedLine = line.replace(/\s+/g, " ").trim();
    if (!cleanedLine) {
      continue;
    }

    const projected = charCount ? charCount + 1 + cleanedLine.length : cleanedLine.length;
    if (selected.length >= maxLines || projected > maxChars) {
      break;
    }

    selected.push(cleanedLine);
    charCount = projected;
  }

  const result = selected.join("\n").trim();
  return result || "No answer.";
};

export const normalizeSpeechText = (value) =>
  normalizePlainTextResponse(value, {
    maxLines: 3,
    maxChars: 220,
  });

export const sanitizeCodeText = (value = "") =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/^```[a-zA-Z0-9_-]*\s*/i, "")
    .replace(/```$/i, "")
    .trim();

export const stripLeadingLabel = (value = "", label = "") => {
  if (!label) {
    return String(value || "").trim();
  }

  const pattern = new RegExp(`^${escapeRegExp(label)}\\s*[:\\-]?\\s*`, "i");
  return String(value || "").replace(pattern, "").trim();
};

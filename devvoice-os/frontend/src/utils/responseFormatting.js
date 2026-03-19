const FILLER_LINE_PATTERNS = [
  /^sure[,.!\s]/i,
  /^here(?:'s| is)\b/i,
  /^let me know\b/i,
  /^in conclusion\b/i,
  /^to summarize\b/i,
  /^summary[:\s]/i,
  /^overall[:,\s]/i,
];

export const cleanPlainText = (value, { maxLines = 6, maxChars = 360 } = {}) => {
  let output = String(value || "")
    .replace(/\r/g, "")
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

  if (!output) {
    return "";
  }

  const rawLines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const expanded = [];
  for (const line of rawLines) {
    const parts = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((item) => item.trim())
      .filter(Boolean);

    expanded.push(...(parts.length ? parts : [line]));
  }

  const filtered = expanded.filter((line) => !FILLER_LINE_PATTERNS.some((pattern) => pattern.test(line)));
  const selected = [];
  let charCount = 0;

  for (const line of filtered) {
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

  return selected.join("\n").trim();
};

export const cleanSpeechText = (value) =>
  cleanPlainText(value, {
    maxLines: 3,
    maxChars: 220,
  });

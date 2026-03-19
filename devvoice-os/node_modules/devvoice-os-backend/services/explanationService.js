const truncate = (text, limit = 280) =>
  text.length > limit ? `${text.slice(0, limit).trim()}...` : text;

export const buildExplanation = ({ contentType, screenText, hasImage }) => {
  const trimmedText = screenText.trim();

  if (!trimmedText && hasImage) {
    return "I received the screenshot, but OCR is not connected yet. Add visible text from the screen and I can classify and explain it.";
  }

  if (!trimmedText) {
    return "I could not find any screen text to analyze yet. Paste visible text or attach a screenshot for the next OCR step.";
  }

  switch (contentType) {
    case "error":
      return `This looks like a programming error. The main issue appears to be: "${truncate(trimmedText, 180)}". Check the exact file, import, variable name, or syntax near the failing line, then rerun after fixing the root cause.`;
    case "code":
      return `This appears to be source code. In simple terms, it defines logic the program will run. The visible snippet shows programming structure such as declarations, imports, or return values, so you should read it top to bottom and track what inputs become outputs.`;
    case "concept":
      return `This looks like a programming concept. In beginner-friendly terms, it is explaining an idea rather than running code. A simple way to study it is to connect the definition to one small real example and then compare it with a similar concept.`;
    case "documentation":
      return `This looks like documentation or reference material. In simple language, it is giving instructions or explaining how something should be used. The key points visible are: "${truncate(trimmedText, 220)}".`;
    default:
      return `I can see some screen content, but I cannot classify it confidently yet. Visible text summary: "${truncate(trimmedText, 220)}".`;
  }
};

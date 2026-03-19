const ERROR_PATTERNS = [
  "modulenotfounderror",
  "syntaxerror",
  "typeerror",
  "referenceerror",
  "stack trace",
  "exception",
  "traceback",
];

const CODE_PATTERNS = [
  "function",
  "class",
  "def",
  "return",
  "import",
  "const",
  "let",
  "=>",
  "console.log",
  "export ",
];

const CONCEPT_PATTERNS = [
  "inheritance",
  "polymorphism",
  "dbms",
  "recursion",
  "algorithm",
  "data structure",
  "encapsulation",
  "abstraction",
];

const DOCUMENTATION_PATTERNS = [
  "documentation",
  "install",
  "installation",
  "getting started",
  "usage",
  "example",
  "examples",
  "api reference",
  "readme",
  "guide",
  "tutorial",
];

export const normalizeScreenText = (text = "") =>
  text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const classifyContent = (text = "") => {
  const normalizedText = normalizeScreenText(text);

  if (!normalizedText) {
    return "unknown";
  }

  if (ERROR_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
    return "error";
  }

  if (CODE_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
    return "code";
  }

  if (CONCEPT_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
    return "concept";
  }

  if (DOCUMENTATION_PATTERNS.some((pattern) => normalizedText.includes(pattern))) {
    return "documentation";
  }

  return normalizedText.length > 80 ? "documentation" : "unknown";
};

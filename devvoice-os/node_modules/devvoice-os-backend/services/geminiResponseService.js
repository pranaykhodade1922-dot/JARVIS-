const MAX_OVERLAP = 200;

const normalizeText = (value) => String(value || "").replace(/\r\n/g, "\n");

const normalizeFinishReasonValue = (value) => String(value || "UNKNOWN").trim().toUpperCase();

const extractTextFromPart = (part) => {
  if (!part) {
    return "";
  }

  if (typeof part.text === "string") {
    return part.text;
  }

  return "";
};

export const normalizeContents = (contents) => {
  if (typeof contents === "string") {
    return [
      {
        role: "user",
        parts: [{ text: contents }],
      },
    ];
  }

  if (Array.isArray(contents) && contents.every((item) => item?.role && Array.isArray(item?.parts))) {
    return contents;
  }

  if (Array.isArray(contents)) {
    return [
      {
        role: "user",
        parts: contents,
      },
    ];
  }

  throw new Error("Gemini contents must be a string or a parts array.");
};

export const extractCandidateText = (candidate) => {
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  return normalizeText(parts.map(extractTextFromPart).join("")).trim();
};

export const getPrimaryCandidate = (response) => {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  return candidates[0] || null;
};

export const readResponseText = (response) => {
  const directText = response?.text;
  if (typeof directText === "string") {
    return normalizeText(directText).trim();
  }

  return "";
};

export const extractResponseText = (response) => {
  const helperText = readResponseText(response);
  if (helperText) {
    return helperText;
  }

  const primaryCandidate = getPrimaryCandidate(response);
  if (primaryCandidate) {
    const primaryText = extractCandidateText(primaryCandidate);
    if (primaryText) {
      return primaryText;
    }
  }

  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  return normalizeText(candidates.map((candidate) => extractCandidateText(candidate)).filter(Boolean).join("\n\n")).trim();
};

export const getFinishReason = (response) => {
  const candidate = getPrimaryCandidate(response);
  return normalizeFinishReasonValue(candidate?.finishReason);
};

export const getUsageMetadata = (response) => response?.usageMetadata || {};

export const summarizeRawResponseShape = (response) => ({
  responseKeys: Object.keys(response || {}),
  candidateCount: Array.isArray(response?.candidates) ? response.candidates.length : 0,
  finishReason: getFinishReason(response),
  usageMetadata: getUsageMetadata(response),
  responseTextLength: readResponseText(response).length,
  candidates: (Array.isArray(response?.candidates) ? response.candidates : []).map((candidate, index) => ({
    index,
    finishReason: normalizeFinishReasonValue(candidate?.finishReason),
    safetyRatingsCount: Array.isArray(candidate?.safetyRatings) ? candidate.safetyRatings.length : 0,
    partsCount: Array.isArray(candidate?.content?.parts) ? candidate.content.parts.length : 0,
    textLength: extractCandidateText(candidate).length,
  })),
});

export const summarizeGeminiResponse = (response) => ({
  candidateCount: Array.isArray(response?.candidates) ? response.candidates.length : 0,
  finishReason: getFinishReason(response),
  usageMetadata: getUsageMetadata(response),
  hasTextHelper: readResponseText(response).length > 0,
  partsCount: Array.isArray(getPrimaryCandidate(response)?.content?.parts)
    ? getPrimaryCandidate(response).content.parts.length
    : 0,
});

const toFiniteInteger = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export const aggregateUsageMetadata = (usageHistory = []) =>
  usageHistory.reduce(
    (accumulator, usage) => ({
      promptTokenCount: accumulator.promptTokenCount + toFiniteInteger(usage?.promptTokenCount),
      candidatesTokenCount: accumulator.candidatesTokenCount + toFiniteInteger(usage?.candidatesTokenCount),
      thoughtsTokenCount: accumulator.thoughtsTokenCount + toFiniteInteger(usage?.thoughtsTokenCount),
      totalTokenCount: accumulator.totalTokenCount + toFiniteInteger(usage?.totalTokenCount),
      cachedContentTokenCount: accumulator.cachedContentTokenCount + toFiniteInteger(usage?.cachedContentTokenCount),
    }),
    {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 0,
      totalTokenCount: 0,
      cachedContentTokenCount: 0,
    },
  );

const mergeWithOverlap = (existingText, nextText) => {
  const existing = normalizeText(existingText);
  const next = normalizeText(nextText);

  if (!existing) {
    return next;
  }

  if (!next) {
    return existing;
  }

  const maxLength = Math.min(MAX_OVERLAP, existing.length, next.length);
  for (let length = maxLength; length > 0; length -= 1) {
    if (existing.slice(-length) === next.slice(0, length)) {
      return `${existing}${next.slice(length)}`;
    }
  }

  if (/\s$/.test(existing) || /^\s/.test(next)) {
    return `${existing}${next}`;
  }

  return `${existing}${next}`;
};

export const appendModelTurn = (contents, replyText) => [
  ...contents,
  {
    role: "model",
    parts: [{ text: replyText }],
  },
];

export const appendContinuationPrompt = (contents) => [
  ...contents,
  {
    role: "user",
    parts: [
      {
        text:
          "Continue exactly where you stopped. Do not restart, do not summarize the previous text, and do not repeat earlier sentences.",
      },
    ],
  },
];

export const assembleGeminiText = (segments) =>
  segments.reduce((combined, segment) => mergeWithOverlap(combined, segment), "").trim();

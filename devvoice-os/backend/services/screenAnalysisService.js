import {
  analyzeScreenshotWithGemini,
  buildGeminiErrorReply,
  getGeminiModel,
  isGeminiConfigured,
} from "./geminiService.js";
import { normalizeSystemCommand } from "./systemCommandService.js";

const VALID_CONTENT_TYPES = new Set([
  "code",
  "error",
  "concept",
  "documentation",
  "webpage",
  "terminal",
  "unknown",
]);

const inferContentType = (value = "") => {
  const text = value.toLowerCase();

  if (/traceback|exception|syntaxerror|typeerror|referenceerror|failed|stack/i.test(text)) {
    return "error";
  }
  if (/function|class|const |let |return|import |export |=>|react|node|npm/i.test(text)) {
    return "code";
  }
  if (/terminal|powershell|command prompt|cmd\.exe/i.test(text)) {
    return "terminal";
  }
  if (/docs|documentation|guide|readme|api reference/i.test(text)) {
    return "documentation";
  }
  if (/topic|concept|definition|overview|introduction/i.test(text)) {
    return "concept";
  }
  if (text.trim()) {
    return "webpage";
  }

  return "unknown";
};

export async function processScreenAnalysis({ imageBase64, command, source = "voice" }) {
  const normalizedCommand = normalizeSystemCommand(command || "analyze my screen");
  if (!imageBase64?.trim()) {
    const error = new Error("Request body must include imageBase64.");
    error.status = 400;
    error.code = "SCREEN_IMAGE_REQUIRED";
    throw error;
  }

  try {
    const payload = await analyzeScreenshotWithGemini({
      imageBase64,
      command: normalizedCommand,
    });
    const contentType = VALID_CONTENT_TYPES.has(payload.contentType)
      ? payload.contentType
      : inferContentType(payload.reply);

    return {
      ok: true,
      route: "/analyze-screen",
      state: "completed",
      command,
      normalizedCommand,
      source,
      intent: "screen_analysis",
      reply: payload.reply,
      response: payload.reply,
      resolved: payload.resolved !== false,
      followUp: payload.followUp || "",
      provider: {
        type: "gemini",
        gemini: {
          active: true,
          configured: true,
          model: getGeminiModel(),
        },
      },
      details: {
        title: payload.title || "Screen Analysis",
        contentType,
        ...(payload.details || {}),
      },
      error: null,
    };
  } catch (error) {
    const fallback = buildGeminiErrorReply(error);
    const wrapped = new Error(fallback.reply);
    wrapped.status = fallback.status;
    wrapped.code = fallback.code;
    wrapped.payload = {
      ok: false,
      route: "/analyze-screen",
      state: "error",
      command,
      normalizedCommand,
      source,
      intent: "screen_analysis",
      reply: fallback.reply,
      response: fallback.reply,
      resolved: false,
      followUp: fallback.followUp,
      provider: {
        type: "gemini",
        gemini: {
          active: false,
          configured: isGeminiConfigured(),
          model: getGeminiModel(),
        },
      },
      details: {
        title: "Screen Analysis",
        contentType: "unknown",
      },
      error: {
        code: fallback.code,
        message: fallback.reply,
      },
    };
    throw wrapped;
  }
}

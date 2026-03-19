import axios from "axios";
import { parseModelJson } from "./responseParser.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const getGeminiModel = () => GEMINI_MODEL;
export const isGeminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

const createServiceError = (message, code, status, details = {}) => {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
};

const getApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw createServiceError(
      "GEMINI_API_KEY is missing in backend/.env, so Gemini cannot answer commands yet.",
      "GEMINI_KEY_MISSING",
      503,
    );
  }
  return apiKey;
};

const extractImagePayload = (imageInput = "") => {
  if (!imageInput?.trim()) {
    throw createServiceError("Screen capture payload was empty.", "SCREEN_IMAGE_EMPTY", 400);
  }

  const trimmed = imageInput.trim();
  const dataUrlMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  const mimeType = dataUrlMatch?.[1] || "image/png";
  const base64Data = (dataUrlMatch?.[2] || trimmed).replace(/\s+/g, "");

  let buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch (error) {
    throw createServiceError(
      `Screen capture payload could not be base64-decoded: ${error.message}`,
      "SCREEN_IMAGE_INVALID_BASE64",
      400,
    );
  }

  if (!buffer.length) {
    throw createServiceError("Screen capture payload decoded to empty bytes.", "SCREEN_IMAGE_EMPTY", 400);
  }

  return {
    mimeType,
    encodedData: buffer.toString("base64"),
  };
};

const sendGeminiRequest = async ({ contents, responseMimeType = "application/json", timeout = 45000 }) => {
  const apiKey = getApiKey();

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${apiKey}`,
      {
        contents,
        generationConfig: {
          responseMimeType,
          temperature: 0.3,
          maxOutputTokens: 900,
        },
      },
      {
        timeout,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw createServiceError("Gemini returned an empty response.", "GEMINI_EMPTY_RESPONSE", 502);
    }

    return text;
  } catch (error) {
    if (error.code && error.status) {
      throw error;
    }

    const status = Number(error?.response?.status || 502);
    const message =
      error?.response?.data?.error?.message || error?.message || "Gemini request failed unexpectedly.";
    console.error("[geminiService] request failed", {
      status,
      message,
      details: error?.response?.data || null,
    });
    throw createServiceError(message, "GEMINI_REQUEST_FAILED", status, error?.response?.data || {});
  }
};

const buildCommandPrompt = (command) => `
You are JARVIS, a concise voice assistant for a developer workstation.
Return strict JSON only.

User command: ${JSON.stringify(command)}

Rules:
- If the command is conversational, answer it directly and clearly.
- If the command asks for development help, answer with practical guidance.
- Do not claim screen analysis unless an image is provided.
- Keep the reply suitable for voice playback.
- Do not wrap JSON in markdown fences.

Return exactly:
{
  "intent": "",
  "reply": "",
  "resolved": true,
  "followUp": "",
  "details": {}
}
`.trim();

const buildScreenPrompt = (command) => `
You are DevVoice OS screen intelligence.
Analyze the screenshot carefully and return strict JSON only.

User command: ${JSON.stringify(command)}

You must identify exactly one contentType from:
code, error, concept, documentation, webpage, terminal, unknown

Rules:
- Explain only what is actually visible in the screenshot.
- If the image is blurry or unreadable, say that clearly.
- Keep the response suitable for voice playback.
- Do not wrap JSON in markdown fences.

Return exactly:
{
  "title": "",
  "contentType": "",
  "reply": "",
  "resolved": true,
  "followUp": "",
  "details": {}
}
`.trim();

export const buildGeminiErrorReply = (error) => {
  const status = Number(error?.status || 502);
  const message = error?.message || "Gemini is unavailable.";

  if (error?.code === "GEMINI_KEY_MISSING") {
    return {
      status,
      code: error.code,
      reply: message,
      followUp: "Add GEMINI_API_KEY to backend/.env and restart the backend.",
    };
  }

  if (status === 404 || /model/i.test(message)) {
    return {
      status: 502,
      code: "GEMINI_MODEL_INVALID",
      reply: `Gemini model "${GEMINI_MODEL}" is unavailable or invalid for this API key.`,
      followUp: "Set a valid GEMINI_MODEL in backend/.env and restart the backend.",
    };
  }

  return {
    status: status >= 400 ? status : 502,
    code: error?.code || "GEMINI_UNAVAILABLE",
    reply: message,
    followUp: "Check the backend logs for the Gemini request failure.",
  };
};

export async function generateCommandReply({ command }) {
  const rawText = await sendGeminiRequest({
    contents: [
      {
        role: "user",
        parts: [{ text: buildCommandPrompt(command) }],
      },
    ],
  });

  const parsed = parseModelJson(rawText, {
    intent: "assistant_general",
    reply: rawText,
    resolved: true,
    followUp: "",
    details: {},
  });

  return {
    intent: parsed.intent || "assistant_general",
    reply: parsed.reply || rawText,
    resolved: parsed.resolved !== false,
    followUp: parsed.followUp || "",
    details: parsed.details || {},
  };
}

export async function analyzeScreenshotWithGemini({ imageBase64, command }) {
  const { mimeType, encodedData } = extractImagePayload(imageBase64);

  const rawText = await sendGeminiRequest({
    contents: [
      {
        role: "user",
        parts: [
          { text: buildScreenPrompt(command) },
          {
            inlineData: {
              mimeType,
              data: encodedData,
            },
          },
        ],
      },
    ],
  });

  const parsed = parseModelJson(rawText, {
    title: "Screen Analysis",
    contentType: "unknown",
    reply: "The shared screen could not be interpreted reliably.",
    resolved: false,
    followUp: "Try sharing a clearer screen and ask again.",
    details: {},
  });

  return {
    title: parsed.title || "Screen Analysis",
    contentType: parsed.contentType || "unknown",
    reply: parsed.reply || "The shared screen could not be interpreted reliably.",
    resolved: parsed.resolved !== false,
    followUp: parsed.followUp || "",
    details: parsed.details || {},
  };
}

import {
  aggregateUsageMetadata,
  appendContinuationPrompt,
  appendModelTurn,
  assembleGeminiText,
  extractResponseText,
  getFinishReason,
  getUsageMetadata,
  normalizeContents,
  summarizeGeminiResponse,
  summarizeRawResponseShape,
} from "../services/geminiResponseService.js";
import { createAppError } from "../services/responseBuilder.js";
import { getBooleanEnv, getEnvValue } from "../services/envService.js";

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash";
const TRUNCATION_REASONS = new Set(["MAX_TOKENS", "TOKEN_LIMIT", "LENGTH"]);
const FAST_MODES = new Set(["fast", "voice_fast", "screen_fast"]);

const parseIntegerEnv = (key, fallback) => {
  const rawValue = Number.parseInt(getEnvValue(key, ""), 10);
  return Number.isFinite(rawValue) && rawValue > 0 ? rawValue : fallback;
};

const parseFloatEnv = (key, fallback) => {
  const rawValue = Number.parseFloat(getEnvValue(key, ""));
  return Number.isFinite(rawValue) ? rawValue : fallback;
};

const withTimeout = async (promise, timeoutMs, label) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(createAppError(504, "GEMINI_TIMEOUT", `Gemini ${label} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildSdkResponseText = (response) => {
  try {
    return extractResponseText(response);
  } catch (error) {
    console.warn("[geminiProvider] failed to extract response text", {
      message: error?.message || "Unknown extraction error.",
    });
    return "";
  }
};

const buildStructuredMeta = ({ model, mode, result }) => ({
  model,
  mode,
  finishReason: result.finishReason,
  usage: result.usage,
  usageHistory: result.usageHistory,
  continuationStepsUsed: result.continuationStepsUsed,
  truncated: result.truncated,
  textLength: result.reply.length,
  rawResponseShape: result.rawResponseShape,
  detailMode: result.detailMode || null,
});

export class GeminiProvider {
  constructor() {
    this.name = "gemini";
    this.apiKey = getEnvValue("GEMINI_API_KEY", "");
    this.textModel = getEnvValue("GEMINI_TEXT_MODEL", DEFAULT_TEXT_MODEL);
    this.visionModel = getEnvValue("GEMINI_VISION_MODEL", DEFAULT_VISION_MODEL);
    this.enabled = getBooleanEnv("GEMINI_ENABLED", true);
    this.maxOutputTokens = parseIntegerEnv("GEMINI_MAX_OUTPUT_TOKENS", 8192);
    this.maxContinuationSteps = parseIntegerEnv("GEMINI_CONTINUATION_STEPS", 3);
    this.temperature = parseFloatEnv("GEMINI_TEMPERATURE", 0.2);
    this.timeoutMs = parseIntegerEnv("GEMINI_TIMEOUT_MS", 120000);
  }

  isConfigured() {
    return this.enabled && Boolean(this.apiKey);
  }

  async healthCheck() {
    let sdkInstalled = true;
    let message = "";

    try {
      await this.getClient();
    } catch (error) {
      sdkInstalled = false;
      message = error?.message || "Gemini SDK unavailable.";
    }

    return {
      ok: this.isConfigured() && sdkInstalled,
      configured: this.isConfigured(),
      enabled: this.enabled,
      sdkInstalled,
      reachable: null,
      textModel: this.textModel,
      visionModel: this.visionModel,
      maxOutputTokens: this.maxOutputTokens,
      maxContinuationSteps: this.maxContinuationSteps,
      timeoutMs: this.timeoutMs,
      message,
    };
  }

  async getClient() {
    try {
      const { GoogleGenAI } = await import("@google/genai");
      return new GoogleGenAI({
        apiKey: this.apiKey,
      });
    } catch {
      throw createAppError(
        503,
        "GEMINI_SDK_MISSING",
        "The @google/genai package is not installed. Run npm install to enable Gemini.",
      );
    }
  }

  buildGenerationConfig() {
    return {
      temperature: this.temperature,
      maxOutputTokens: this.maxOutputTokens,
    };
  }

  buildRuntimeConfig(options = {}) {
    const detailMode = String(options.detailMode || "").trim().toLowerCase();
    const fastMode = FAST_MODES.has(detailMode);

    return {
      detailMode: fastMode ? detailMode : detailMode || "detailed",
      maxOutputTokens: fastMode
        ? Math.min(this.maxOutputTokens, parseIntegerEnv("GEMINI_FAST_MAX_OUTPUT_TOKENS", 1024))
        : this.maxOutputTokens,
      maxContinuationSteps: fastMode ? 0 : this.maxContinuationSteps,
      temperature: fastMode ? Math.min(this.temperature, 0.1) : this.temperature,
    };
  }

  async callGenerateContent(client, model, contents, label, runtimeConfig) {
    const startedAt = Date.now();
    const config = {
      temperature: runtimeConfig.temperature,
      maxOutputTokens: runtimeConfig.maxOutputTokens,
    };
    console.log("[geminiProvider] request sent", {
      label,
      model,
      startedAt: new Date(startedAt).toISOString(),
      detailMode: runtimeConfig.detailMode,
      generationConfig: config,
    });
    const response = await withTimeout(
      client.models.generateContent({
        model,
        contents,
        config,
      }),
      this.timeoutMs,
      label,
    );

    console.log("[geminiProvider] generateContent completed", {
      label,
      model,
      durationMs: Date.now() - startedAt,
      generationConfig: config,
      responseShape: summarizeGeminiResponse(response),
    });

    return response;
  }

  async generateCompleteResponse({ model, contents, mode, options = {} }) {
    if (!this.apiKey) {
      throw createAppError(503, "GEMINI_KEY_MISSING", "GEMINI_API_KEY is not configured.");
    }

    const client = await this.getClient();
    const runtimeConfig = this.buildRuntimeConfig(options);
    let conversation = normalizeContents(contents);
    const segments = [];
    const usageHistory = [];
    let lastFinishReason = "UNKNOWN";
    let lastRawResponseShape = null;

    for (let step = 0; step <= runtimeConfig.maxContinuationSteps; step += 1) {
      const response = await this.callGenerateContent(client, model, conversation, `${mode}:${step}`, runtimeConfig);
      const responseText = buildSdkResponseText(response);
      const finishReason = getFinishReason(response);
      const usageMetadata = getUsageMetadata(response);
      const rawResponseShape = summarizeRawResponseShape(response);

      console.log("[geminiProvider] response diagnostics", {
        mode,
        model,
        step,
        detailMode: runtimeConfig.detailMode,
        finishReason,
        responseText,
        usageMetadata,
        rawResponseShape,
      });

      lastFinishReason = finishReason;
      lastRawResponseShape = rawResponseShape;
      usageHistory.push(usageMetadata);

      if (!responseText) {
        throw createAppError(502, "GEMINI_EMPTY_RESPONSE", "Gemini returned no readable text.", {
          provider: this.name,
          mode,
          meta: {
            model,
            finishReason,
            usage: usageMetadata,
            rawResponseShape,
            detailMode: runtimeConfig.detailMode,
          },
        });
      }

      segments.push(responseText);

      if (!TRUNCATION_REASONS.has(finishReason)) {
        const reply = assembleGeminiText(segments);
        return {
          ok: true,
          provider: this.name,
          reply,
          mode,
          finishReason,
          truncated: false,
          continuationStepsUsed: step,
          usageHistory,
          usage: aggregateUsageMetadata(usageHistory),
          rawResponseShape,
          detailMode: runtimeConfig.detailMode,
        };
      }

      conversation = appendContinuationPrompt(appendModelTurn(conversation, responseText));
    }

    throw createAppError(
      502,
      "GEMINI_TRUNCATED_RESPONSE",
      `Gemini stopped after ${runtimeConfig.maxContinuationSteps + 1} attempts because finishReason remained ${lastFinishReason}.`,
      {
        provider: this.name,
        mode,
        meta: {
          model,
          finishReason: lastFinishReason,
          usage: aggregateUsageMetadata(usageHistory),
          usageHistory,
          rawResponseShape: lastRawResponseShape,
          continuationStepsUsed: runtimeConfig.maxContinuationSteps,
          detailMode: runtimeConfig.detailMode,
        },
      },
    );
  }

  normalizeProviderResult({ model, mode, result }) {
    return {
      ok: true,
      provider: this.name,
      reply: result.reply,
      mode,
      meta: buildStructuredMeta({
        model,
        mode,
        result,
      }),
    };
  }

  wrapGeminiError(model, mode, error) {
    if (error?.code && error?.status) {
      error.provider = error.provider || this.name;
      error.mode = error.mode || mode;
      error.meta = {
        model,
        ...(error.meta || {}),
      };
      throw error;
    }

    const message = error?.message || "Gemini request failed.";
    if (/not found|not supported|unsupported/i.test(message)) {
      throw createAppError(
        503,
        "GEMINI_MODEL_UNSUPPORTED",
        `Gemini model "${model}" is unsupported for this API key or SDK version.`,
        {
          provider: this.name,
          mode,
          meta: {
            model,
          },
        },
      );
    }

    throw createAppError(502, "GEMINI_REQUEST_FAILED", message, {
      provider: this.name,
      mode,
      meta: {
        model,
      },
    });
  }

  async generateText(prompt, options = {}) {
    try {
      const result = await this.generateCompleteResponse({
        model: this.textModel,
        contents: prompt,
        mode: "text",
        options,
      });

      return this.normalizeProviderResult({
        model: this.textModel,
        mode: "text",
        result,
      });
    } catch (error) {
      this.wrapGeminiError(this.textModel, "text", error);
    }
  }

  async analyzeImage(image, prompt, options = {}) {
    try {
      const result = await this.generateCompleteResponse({
        model: this.visionModel,
        mode: "vision",
        options,
        contents: [
          {
            inlineData: {
              mimeType: image.mimeType,
              data: image.base64,
            },
          },
          {
            text: prompt,
          },
        ],
      });

      return this.normalizeProviderResult({
        model: this.visionModel,
        mode: "vision",
        result,
      });
    } catch (error) {
      this.wrapGeminiError(this.visionModel, "vision", error);
    }
  }
}

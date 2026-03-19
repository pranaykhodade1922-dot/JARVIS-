import { createAppError } from "../services/responseBuilder.js";
import { getBooleanEnv, getEnvValue } from "../services/envService.js";

const trimSlash = (value) => value.replace(/\/+$/, "");

export class OllamaProvider {
  constructor() {
    this.name = "ollama";
    this.baseUrl = trimSlash(getEnvValue("OLLAMA_BASE_URL", "http://localhost:11434"));
    this.textModel = getEnvValue("OLLAMA_TEXT_MODEL", "qwen2.5:1.5b");
    this.visionModel = getEnvValue("OLLAMA_VISION_MODEL", "llava:7b");
    this.visionEnabled = getBooleanEnv("OLLAMA_VISION_ENABLED", false);
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models.map((model) => model.name) : [];

      return {
        ok: true,
        configured: true,
        reachable: true,
        textModel: this.textModel,
        visionModel: this.visionModel,
        textModelAvailable: models.some((model) => model.startsWith(this.textModel)),
        visionEnabled: this.visionEnabled,
        visionModelAvailable: this.visionEnabled
          ? models.some((model) => model.startsWith(this.visionModel))
          : false,
      };
    } catch (error) {
      return {
        ok: false,
        configured: true,
        reachable: false,
        textModel: this.textModel,
        visionModel: this.visionModel,
        visionEnabled: this.visionEnabled,
        message: error?.message || "Ollama health check failed.",
      };
    }
  }

  async generateText(prompt) {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.textModel,
        prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (/requires more system memory/i.test(errorText)) {
        throw createAppError(
          503,
          "OLLAMA_LOW_MEMORY",
          `Ollama text model "${this.textModel}" cannot load because the laptop does not have enough free memory.`,
        );
      }
      throw createAppError(502, "OLLAMA_TEXT_FAILED", `Ollama text failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const reply = String(data?.response || "").trim();
    if (!reply) {
      throw createAppError(502, "OLLAMA_EMPTY_TEXT", "Ollama returned an empty text response.");
    }

    return {
      provider: this.name,
      model: this.textModel,
      reply,
      meta: {},
    };
  }

  async analyzeImage(image, prompt) {
    if (!this.visionEnabled) {
      throw createAppError(
        503,
        "OLLAMA_VISION_DISABLED",
        "Ollama vision is disabled on this low-memory system. Falling back to Gemini vision.",
      );
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.visionModel,
        prompt,
        images: [image.base64],
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (/requires more system memory/i.test(errorText)) {
        throw createAppError(
          503,
          "OLLAMA_LOW_MEMORY",
          `Ollama vision model "${this.visionModel}" cannot load because the laptop does not have enough free memory.`,
        );
      }
      throw createAppError(502, "OLLAMA_VISION_FAILED", `Ollama vision failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const reply = String(data?.response || "").trim();
    if (!reply) {
      throw createAppError(502, "OLLAMA_EMPTY_VISION", "Ollama returned an empty vision response.");
    }

    return {
      provider: this.name,
      model: this.visionModel,
      reply,
      meta: {},
    };
  }
}

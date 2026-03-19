import { createAppError } from "../services/responseBuilder.js";
import { getBooleanEnv, getEnvValue } from "../services/envService.js";

export class OpenAIProvider {
  constructor() {
    this.name = "openai";
    this.apiKey = getEnvValue("OPENAI_API_KEY", "");
    this.textModel = getEnvValue("OPENAI_TEXT_MODEL", "gpt-4o-mini");
    this.visionModel = getEnvValue("OPENAI_VISION_MODEL", "gpt-4o-mini");
    this.enabled = getBooleanEnv("OPENAI_ENABLED", false);
  }

  isConfigured() {
    return this.enabled && Boolean(this.apiKey);
  }

  async healthCheck() {
    return {
      ok: this.isConfigured(),
      configured: Boolean(this.apiKey),
      enabled: this.enabled,
      reachable: null,
      textModel: this.textModel,
      visionModel: this.visionModel,
      message: this.enabled ? "" : "OpenAI fallback is disabled until quota is available.",
    };
  }

  async request(model, messages) {
    if (!this.apiKey) {
      throw createAppError(503, "OPENAI_KEY_MISSING", "OPENAI_API_KEY is not configured.");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429 && /insufficient_quota/i.test(errorText)) {
        throw createAppError(
          503,
          "OPENAI_QUOTA_EXCEEDED",
          "OpenAI fallback is unavailable because the API quota is exhausted.",
        );
      }
      throw createAppError(502, "OPENAI_REQUEST_FAILED", `OpenAI request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const reply = String(data?.choices?.[0]?.message?.content || "").trim();
    if (!reply) {
      throw createAppError(502, "OPENAI_EMPTY_RESPONSE", "OpenAI returned an empty response.");
    }

    return reply;
  }

  async generateText(prompt) {
    const reply = await this.request(this.textModel, [
      {
        role: "user",
        content: prompt,
      },
    ]);

    return {
      provider: this.name,
      model: this.textModel,
      reply,
      meta: {},
    };
  }

  async analyzeImage(image, prompt) {
    const reply = await this.request(this.visionModel, [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: image.dataUrl,
            },
          },
        ],
      },
    ]);

    return {
      provider: this.name,
      model: this.visionModel,
      reply,
      meta: {},
    };
  }
}

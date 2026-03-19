import { GeminiProvider } from "../providers/geminiProvider.js";
import { OllamaProvider } from "../providers/ollamaProvider.js";
import { OpenAIProvider } from "../providers/openaiProvider.js";
import { getBooleanEnv, getEnvValue } from "./envService.js";
import { createAppError } from "./responseBuilder.js";

const getProviderOrder = (preferredOrder = null) => {
  const order = Array.isArray(preferredOrder) && preferredOrder.length
    ? preferredOrder
    : [
    getEnvValue("AI_PRIMARY_PROVIDER", "gemini"),
    getEnvValue("AI_FALLBACK_PROVIDER_1", "ollama"),
    getBooleanEnv("OPENAI_ENABLED", false) ? getEnvValue("AI_FALLBACK_PROVIDER_2", "openai") : "",
  ];

  return [...new Set(order.map((item) => item.toLowerCase()))].filter(Boolean);
};

const createProviders = () => ({
  ollama: new OllamaProvider(),
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
});

const buildFailure = (failures, mode) => {
  const combined = failures
    .map((failure) => `${failure.provider}: ${failure.message}`)
    .join(" | ");

  return createAppError(
    502,
    "ALL_PROVIDERS_FAILED",
    `All ${mode} providers failed. ${combined}`,
    {
      mode,
      meta: {
        failures,
      },
    },
  );
};

const invokeProviders = async (mode, runner, options = {}) => {
  const providers = createProviders();
  const providerOrder = getProviderOrder(options.providerOrder);
  const failures = [];

  for (const providerName of providerOrder) {
    const provider = providers[providerName];
    if (!provider) {
      failures.push({
        provider: providerName,
        message: "Provider adapter not found.",
      });
      continue;
    }

    if (!provider.isConfigured()) {
      failures.push({
        provider: providerName,
        message: "Provider is not configured.",
      });
      continue;
    }

    try {
      return await runner(provider);
    } catch (error) {
      console.error(`[providerOrchestrator] ${provider.name} ${mode} failed`, error);
      failures.push({
        provider: provider.name,
        message: error?.message || `${mode} failed`,
        code: error?.code || "PROVIDER_FAILED",
      });
    }
  }

  throw buildFailure(failures, mode);
};

export async function generateTextWithFallback(prompt, options = {}) {
  return invokeProviders("text", (provider) => provider.generateText(prompt, options), options);
}

export async function analyzeImageWithFallback(image, prompt, options = {}) {
  return invokeProviders("vision", (provider) => provider.analyzeImage(image, prompt, options), options);
}

export async function getProvidersHealth() {
  const providers = createProviders();
  const result = {};

  for (const providerName of Object.keys(providers)) {
    const provider = providers[providerName];
    try {
      result[providerName] = await provider.healthCheck();
    } catch (error) {
      result[providerName] = {
        ok: false,
        configured: provider.isConfigured(),
        message: error?.message || "Health check failed.",
      };
    }
  }

  return {
    order: getProviderOrder(),
    items: result,
  };
}

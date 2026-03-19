import { getEnvValue } from "./envService.js";

const DEFAULT_MURF_BASE_URL = "https://api.murf.ai";
const DEFAULT_MALE_VOICE_ID = "en-US-terrell";

const getMurfEndpoint = () => {
  const baseUrl = getEnvValue("MURF_BASE_URL", DEFAULT_MURF_BASE_URL);
  return `${baseUrl.replace(/\/+$/, "")}/v1/speech/stream`;
};

export async function synthesizeSpeech(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return {
      provider: "none",
      ok: false,
      audioUrl: null,
      fallback: "browser",
      message: "Empty text was not synthesized.",
    };
  }

  const apiKey = getEnvValue("MURF_API_KEY", "");
  if (!apiKey) {
    return {
      provider: "murf",
      ok: false,
      audioUrl: null,
      fallback: "browser",
      message: "MURF_API_KEY is not configured.",
    };
  }

  try {
    const response = await fetch(getMurfEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        text: trimmed,
        voiceId: getEnvValue("MURF_VOICE_ID", DEFAULT_MALE_VOICE_ID),
        model: getEnvValue("MURF_MODEL", "GEN2"),
        format: "MP3",
        sampleRate: 24000,
        multiNativeLocale: getEnvValue("MURF_LOCALE", "en-US"),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Murf synthesis failed: ${response.status} ${errorText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      provider: "murf",
      ok: true,
      audioUrl: `data:audio/mpeg;base64,${buffer.toString("base64")}`,
      fallback: null,
      message: "Murf audio generated.",
    };
  } catch (error) {
    console.error("[ttsService] Murf synthesis failed", error);
    return {
      provider: "murf",
      ok: false,
      audioUrl: null,
      fallback: "browser",
      message: error?.message || "Murf synthesis failed.",
    };
  }
}

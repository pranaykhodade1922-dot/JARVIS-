import { API_BASE_URL } from "../config.js";

const DEFAULT_TIMEOUT_MS = 120000;

const parseJson = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Backend returned invalid JSON for ${response.url}`);
  }
};

const request = async (path, body, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await parseJson(response);
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message || payload?.reply || `Request failed for ${path}`);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out for ${path}`);
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export function askQuestionApi(question, source = "typed") {
  return request("/ask", {
    question,
    source,
  });
}

export function sendCommandApi(command, source = "typed") {
  return request("/command", {
    command,
    source,
  });
}

export function analyzeScreenApi(image, { task = "describe_screen", prompt = "", source = "typed", sessionId = "" } = {}) {
  return request(
    "/analyze-screen",
    {
      image,
      task,
      prompt,
      source,
      sessionId,
    },
    90000,
  );
}

export async function checkBackendHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Health check failed.");
  }

  return payload;
}

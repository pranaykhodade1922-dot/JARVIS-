export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

export const APP_STATES = {
  IDLE: "idle",
  PASSIVE: "passive",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  ERROR: "error",
};

export const UI_ERRORS = {
  MIC_UNSUPPORTED: "This browser does not support speech recognition.",
  SCREEN_UNSUPPORTED: "This browser does not support screen capture.",
  BACKEND_UNAVAILABLE: "Backend unavailable. Confirm the backend is running and reachable.",
  MIC_PERMISSION: "Microphone permission denied.",
};

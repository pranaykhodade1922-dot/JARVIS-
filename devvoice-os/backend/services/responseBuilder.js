export function createAppError(status, code, message, extra = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function buildSuccessResponse({
  route,
  provider,
  mode,
  reply,
  audioUrl = null,
  speechText = null,
  action = null,
  meta = {},
}) {
  return {
    ok: true,
    route,
    state: "completed",
    provider,
    mode,
    reply,
    audioUrl,
    speechText,
    action,
    meta,
  };
}

export function sanitizeImageInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw createAppError(400, "SCREEN_IMAGE_REQUIRED", "Screen image must not be empty.");
  }

  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  const mimeType = match?.[1] || "image/png";
  const base64 = (match?.[2] || trimmed).replace(/\s+/g, "");

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch (error) {
    throw createAppError(400, "SCREEN_IMAGE_INVALID", `Image base64 decoding failed: ${error.message}`);
  }

  if (!buffer.length) {
    throw createAppError(400, "SCREEN_IMAGE_INVALID", "Decoded screen image was empty.");
  }

  return {
    mimeType,
    base64,
    dataUrl: `data:${mimeType};base64,${base64}`,
    meta: {
      mimeType,
      bytes: buffer.length,
    },
  };
}

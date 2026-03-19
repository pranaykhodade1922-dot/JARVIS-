import { resolveCommand } from "./commandService.js";
import { getEnvValue } from "./envService.js";
import { analyzeImageWithFallback, generateTextWithFallback, getProvidersHealth } from "./providerOrchestrator.js";
import { normalizePlainTextResponse, normalizeSpeechText, sanitizeCodeText } from "./responseFormatter.js";
import { parseModelJson } from "./responseParser.js";
import { buildSuccessResponse, createAppError, sanitizeImageInput } from "./responseBuilder.js";

export const SCREEN_TASKS = {
  DESCRIBE: "describe_screen",
  SOLVE: "solve_question_from_screen",
};

const PROMPT_MODES = {
  FAST: "fast",
  DETAILED: "detailed",
  VOICE_FAST: "voice_fast",
  SCREEN_FAST: "screen_fast",
};

const normalizeText = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const DESCRIBE_SCREEN_PATTERNS = [
  "analyze my screen",
  "analyze this screen",
  "what is on my screen",
  "what s on my screen",
  "describe my screen",
  "describe this screen",
  "explain this screen",
  "look at my screen",
  "screen analysis",
];

const SOLVE_SCREEN_PATTERNS = [
  "solve the question on my screen",
  "answer the question on my screen",
  "read my screen and solve it",
  "read my shared screen and solve it",
  "check my shared screen and give me the answer",
  "check my shared screen and give me answer",
  "solve this coding question from screen",
  "solve this coding question on screen",
  "solve the coding question on my screen",
  "answer the coding question on my screen",
  "check my screen and give me answer",
  "give me the answer from my screen",
  "tell me the answer to the question on screen",
];

const containsAny = (text, values) => values.some((value) => text.includes(value));
const nowIso = () => new Date().toISOString();

const createTimingMeta = (startedAt) => ({
  startedAtIso: new Date(startedAt).toISOString(),
  totalDurationMs: Date.now() - startedAt,
});

const createTextJsonReply = (answer = "") => ({
  type: "text",
  answer: normalizePlainTextResponse(answer),
});

const createCodeJsonReply = (code = "", language = "cpp", title = "Solution") => ({
  type: "code",
  language,
  title,
  code: sanitizeCodeText(code),
  copyEnabled: true,
});

const isValidStructuredReply = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (value.type === "text") {
    return typeof value.answer === "string";
  }

  if (value.type === "code") {
    return typeof value.code === "string";
  }

  return false;
};

const normalizeStructuredReply = (rawReply) => {
  const parsed = parseModelJson(rawReply, null);
  if (isValidStructuredReply(parsed)) {
    return parsed.type === "code"
      ? createCodeJsonReply(parsed.code, parsed.language || "cpp", parsed.title || "Solution")
      : createTextJsonReply(parsed.answer);
  }

  return createTextJsonReply(String(rawReply || "").trim() || "No answer.");
};

const buildReplyPayload = (structuredReply) => ({
  reply: structuredReply.type === "code" ? structuredReply.title || "Solution" : structuredReply.answer,
  speechText:
    structuredReply.type === "code"
      ? structuredReply.title || "Solution ready."
      : normalizeSpeechText(structuredReply.answer),
  structuredReply,
});

const detectScreenTask = (value = "") => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (containsAny(normalized, SOLVE_SCREEN_PATTERNS)) {
    return SCREEN_TASKS.SOLVE;
  }

  const mentionsScreen = /\b(screen|shared screen|screenshot|display|window)\b/.test(normalized);
  const asksToSolve = /\b(solve|answer|fix|complete|write code|give me answer|give answer|coding question|question|problem)\b/.test(
    normalized,
  );
  if (mentionsScreen && asksToSolve) {
    return SCREEN_TASKS.SOLVE;
  }

  if (containsAny(normalized, DESCRIBE_SCREEN_PATTERNS)) {
    return SCREEN_TASKS.DESCRIBE;
  }

  const asksToDescribe = /\b(analyze|describe|what is on|what s on|look at|inspect|explain)\b/.test(normalized);
  if (mentionsScreen && asksToDescribe) {
    return SCREEN_TASKS.DESCRIBE;
  }

  return null;
};

const detectPromptMode = (prompt = "", source = "typed", task = "") => {
  const normalized = normalizeText(prompt);
  if (/\b(detail|detailed|step by step|explain fully|full explanation|thorough)\b/.test(normalized)) {
    return PROMPT_MODES.DETAILED;
  }
  if (task === SCREEN_TASKS.SOLVE) {
    return PROMPT_MODES.SCREEN_FAST;
  }
  if (source === "voice") {
    return PROMPT_MODES.VOICE_FAST;
  }
  return PROMPT_MODES.FAST;
};

const buildFastTextPrompt = (question, source) => `
Detect whether the user's request is a coding problem.
Return strict JSON only.

If it is a coding problem, return exactly:
{
  "type": "code",
  "language": "cpp",
  "title": "Solution",
  "code": "full working code here",
  "copyEnabled": true
}

If it is not a coding problem, return exactly:
{
  "type": "text",
  "answer": "short and direct answer only"
}

Rules:
- Answer briefly and directly.
- Give only the essential answer.
- Avoid unnecessary explanation.
- Use plain text only.
- Maximum 5 to 8 lines.
- Do not use markdown headings, stars, bullet points, or unnecessary decoration.
- For theory questions, answer in 2 to 5 lines maximum by default.
- If code is needed, give only the final correct code unless explanation was explicitly requested.
- If the answer becomes long, shorten it to only the essential answer.
- Do not add markdown fences.

User request: ${JSON.stringify(question)}
Source: ${JSON.stringify(source)}
`.trim();

const buildDetailedTextPrompt = (question, source) => `
Detect whether the user's request is a coding problem.
Return strict JSON only.

If it is a coding problem, return exactly:
{
  "type": "code",
  "language": "cpp",
  "title": "Solution",
  "code": "full working code here",
  "copyEnabled": true
}

If it is not a coding problem, return exactly:
{
  "type": "text",
  "answer": "short and direct answer only"
}

Rules:
- Keep the main answer first.
- Only add detail because the user explicitly requested it.
- Use plain text only.
- Maximum 5 to 8 lines unless the user explicitly requested more.
- Do not use markdown headings, stars, or bullet points.
- If code is needed, provide correct runnable code.
- Keep the answer concise even in detailed mode unless the user explicitly asked for depth.
- Do not add markdown fences.

User request: ${JSON.stringify(question)}
Source: ${JSON.stringify(source)}
`.trim();

const buildDescribeScreenPrompt = (userPrompt, promptMode) =>
  (promptMode === PROMPT_MODES.DETAILED
    ? `
Return strict JSON only.
If the visible content is not a coding question, return:
{
  "type": "text",
  "answer": "short and direct answer only"
}
If unreadable, return:
{
  "type": "text",
  "answer": "screenshot unclear"
}

User request: ${JSON.stringify(userPrompt || "Describe my screen")}
`.trim()
    : `
Return strict JSON only.
Do not describe the whole screen.
If there is a visible question, answer only that question.
Use plain text only.
Maximum 5 to 8 lines.
If unreadable, return:
{
  "type": "text",
  "answer": "screenshot unclear"
}
Otherwise return:
{
  "type": "text",
  "answer": "short and direct answer only"
}

User request: ${JSON.stringify(userPrompt || "Describe my screen")}
`.trim());

const buildSolveQuestionPrompt = (userPrompt, promptMode) =>
  (promptMode === PROMPT_MODES.DETAILED
    ? `
Detect whether the visible question is a coding problem.
Return strict JSON only.

If it is a coding problem, return exactly:
{
  "type": "code",
  "language": "cpp",
  "title": "Solution",
  "code": "full working code here",
  "copyEnabled": true
}

If it is not a coding problem, return exactly:
{
  "type": "text",
  "answer": "short and direct answer only"
}

Rules:
- First understand the problem.
- Then provide only the final correct solution.
- Do not describe the screen.
- Do not add long explanations.
- Use plain text only for non-code answers.
- Maximum 5 to 8 lines.
- Keep non-code answers short and direct.
- If part of the question is cut off, use the visible content and make the best reasonable completion.
- If the image is unclear, return:
{
  "type": "text",
  "answer": "screenshot unclear"
}

User request: ${JSON.stringify(userPrompt || "Solve the question on my screen")}
`.trim()
    : `
Detect whether the visible question is a coding problem.
Return strict JSON only.

If it is a coding problem, return exactly:
{
  "type": "code",
  "language": "cpp",
  "title": "Solution",
  "code": "full working code here",
  "copyEnabled": true
}

If it is not a coding problem, return exactly:
{
  "type": "text",
  "answer": "short and direct answer only"
}

Rules:
- Read the visible question and give only the final answer.
- If it is a coding problem, provide only the final correct code unless explanation is explicitly requested.
- Do not describe the screen.
- Use plain text only for non-code answers.
- Maximum 5 to 8 lines.
- Do not use markdown headings, stars, or bullet points.
- Keep everything concise.
- If the answer becomes long, shorten it to only the essential answer.
- If the image is unclear, return:
{
  "type": "text",
  "answer": "screenshot unclear"
}

User request: ${JSON.stringify(userPrompt || "Solve the question on my screen")}
`.trim());

const VALID_SCREEN_TASKS = new Set(Object.values(SCREEN_TASKS));

const buildScreenPrompt = ({ task, prompt, promptMode }) => {
  if (task === SCREEN_TASKS.SOLVE) {
    return buildSolveQuestionPrompt(prompt, promptMode);
  }

  return buildDescribeScreenPrompt(prompt, promptMode);
};

const GENERIC_SCREEN_FAILURE_PATTERN =
  /\b(i am an ai assistant|i cannot check your screen|i can t check your screen|cannot see the screen|cannot view the image|unable to inspect the screenshot)\b/i;

const normalizeScreenReply = (task, reply) => {
  const normalizedReply = String(reply || "").trim();
  if (!normalizedReply) {
    return createTextJsonReply("screenshot unclear");
  }

  if (GENERIC_SCREEN_FAILURE_PATTERN.test(normalizedReply) || /^SCREEN_UNREADABLE:/i.test(normalizedReply)) {
    return createTextJsonReply("screenshot unclear");
  }

  return normalizeStructuredReply(normalizedReply);
};

export async function executeAskFlow({ question, source }) {
  const startedAt = Date.now();
  if (!question) {
    throw createAppError(400, "INVALID_QUESTION", "Question must not be empty.");
  }

  const screenTask = detectScreenTask(question);
  if (screenTask) {
    return buildSuccessResponse({
      route: "/ask",
      provider: "none",
      mode: "text",
      reply:
        screenTask === SCREEN_TASKS.SOLVE
          ? "Screen question solving requested. Share your screen so I can read the visible question and solve it."
          : "Screen analysis requested. Share your screen so I can inspect the current frame.",
      action: {
        type: "analyze_screen",
        task: screenTask,
        prompt: question,
      },
      meta: {
        source,
        handledAs: "screen_intent",
        screenTask,
      },
    });
  }

  const promptMode = detectPromptMode(question, source);
  const textPrompt = promptMode === PROMPT_MODES.DETAILED
    ? buildDetailedTextPrompt(question, source)
    : buildFastTextPrompt(question, source);

  console.log("[assistantService] text request start", {
    startedAt: nowIso(),
    source,
    promptMode,
  });

  const providerResult = await generateTextWithFallback(textPrompt, {
    source,
    detailMode: promptMode,
    providerOrder: ["gemini", "openai", "ollama"],
  });
  const normalizedResult = buildReplyPayload(normalizeStructuredReply(providerResult.reply));

  const providerMeta = providerResult.meta || {};
  const response = buildSuccessResponse({
    route: "/ask",
    provider: providerResult.provider,
    mode: providerResult.mode || "text",
    reply: normalizedResult.reply,
    speechText: normalizedResult.speechText,
    meta: {
      source,
      model: providerMeta.model || providerResult.model || null,
      finishReason: providerMeta.finishReason || null,
      usage: providerMeta.usage || null,
      rawResponseShape: providerMeta.rawResponseShape || null,
      providerMeta,
      structuredReply: normalizedResult.structuredReply,
      timings: createTimingMeta(startedAt),
    },
  });

  return response;
}

export async function executeCommandFlow({ command, source }) {
  if (!command) {
    throw createAppError(400, "INVALID_COMMAND", "Command must not be empty.");
  }

  const commandResult = resolveCommand(command);
  if (!commandResult.matched) {
    throw createAppError(
      400,
      "UNKNOWN_COMMAND",
      "Command not recognized. Use /ask for general questions or send a supported command such as help, stop, repeat, or clear memory.",
      {
        mode: "command",
      },
    );
  }

  const response = buildSuccessResponse({
    route: "/command",
    provider: "local",
    mode: "command",
    reply: commandResult.reply,
    action: commandResult.action,
    meta: {
      source,
      commandType: commandResult.type,
    },
  });

  if (commandResult.type === "screen_analysis") {
    return response;
  }

  return response;
}

export async function executeScreenAnalysisFlow({ image, imageBase64, task = SCREEN_TASKS.DESCRIBE, prompt, source, sessionId = "" }) {
  const startedAt = Date.now();
  const imageInput = image || imageBase64;

  if (!imageInput) {
    throw createAppError(400, "SCREEN_IMAGE_REQUIRED", "Request body must include image.");
  }

  const normalizedTask = VALID_SCREEN_TASKS.has(task) ? task : SCREEN_TASKS.DESCRIBE;
  const promptMode = detectPromptMode(prompt, source, normalizedTask);

  console.log("[assistantService] screen analysis start", {
    startedAt: nowIso(),
    task: normalizedTask,
    promptMode,
    sessionId,
  });
  const normalizedImage = sanitizeImageInput(imageInput);
  const providerResult = await analyzeImageWithFallback(normalizedImage, buildScreenPrompt({ task: normalizedTask, prompt, promptMode }), {
    source,
    task: normalizedTask,
    sessionId,
    detailMode: promptMode,
    providerOrder: ["gemini", "openai", "ollama"],
  });
  const normalizedResult = buildReplyPayload(normalizeScreenReply(normalizedTask, providerResult.reply));

  const providerMeta = providerResult.meta || {};
  const response = buildSuccessResponse({
    route: "/analyze-screen",
    provider: providerResult.provider,
    mode: providerResult.mode || "vision",
    reply: normalizedResult.reply,
    speechText: normalizedResult.speechText,
    meta: {
      source,
      task: normalizedTask,
      sessionId,
      model: providerMeta.model || providerResult.model || null,
      finishReason: providerMeta.finishReason || null,
      usage: providerMeta.usage || null,
      rawResponseShape: providerMeta.rawResponseShape || null,
      providerMeta,
      structuredReply: normalizedResult.structuredReply,
      image: normalizedImage.meta,
      promptMode,
      timings: createTimingMeta(startedAt),
    },
  });

  return response;
}

export async function getSystemHealth() {
  const providers = await getProvidersHealth();

  return {
    ok: true,
    route: "/health",
    state: "completed",
    provider: "none",
    mode: "health",
    reply: "Backend diagnostics collected.",
    audioUrl: null,
    meta: {
      providers,
      tts: {
        murfConfigured: Boolean(getEnvValue("MURF_API_KEY", "")),
      },
      lowMemoryProfile: true,
      routes: ["/health", "/ask", "/command", "/analyze-screen"],
    },
  };
}

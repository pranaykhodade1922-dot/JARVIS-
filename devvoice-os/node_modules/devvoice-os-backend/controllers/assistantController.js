import {
  executeAskFlow,
  executeCommandFlow,
  executeScreenAnalysisFlow,
  getSystemHealth,
} from "../services/assistantService.js";

const sendError = (res, route, error, fallbackMessage) => {
  const status = Number(error?.status || error?.statusCode || 500);

  res.status(status).json({
    ok: false,
    route,
    state: "error",
    provider: error?.provider || "none",
    mode: error?.mode || "error",
    reply: error?.message || fallbackMessage,
    audioUrl: null,
    meta: error?.meta || {},
    action: error?.action || null,
    error: {
      code: error?.code || "INTERNAL_ERROR",
      message: error?.message || fallbackMessage,
    },
  });
};

const readString = (value) => (typeof value === "string" ? value.trim() : "");

export async function getHealth(_req, res) {
  try {
    const payload = await getSystemHealth();
    res.status(200).json(payload);
  } catch (error) {
    console.error("[health] failed", error);
    sendError(res, "/health", error, "Health diagnostics failed.");
  }
}

export async function askQuestion(req, res) {
  try {
    const question = readString(req.body?.question || req.body?.text || req.body?.prompt);
    const source = readString(req.body?.source) || "typed";
    const payload = await executeAskFlow({ question, source });
    res.status(200).json(payload);
  } catch (error) {
    console.error("[ask] failed", error);
    sendError(res, "/ask", error, "Question handling failed.");
  }
}

export async function handleCommand(req, res) {
  try {
    const command = readString(req.body?.command || req.body?.text);
    const source = readString(req.body?.source) || "typed";
    const payload = await executeCommandFlow({ command, source });
    res.status(200).json(payload);
  } catch (error) {
    console.error("[command] failed", error);
    sendError(res, "/command", error, "Command handling failed.");
  }
}

export async function analyzeScreen(req, res) {
  try {
    const image = readString(req.body?.image || req.body?.imageBase64 || req.body?.imageDataUrl);
    const task = readString(req.body?.task) || "describe_screen";
    const defaultPrompt =
      task === "solve_question_from_screen" ? "Solve the question on my screen" : "Analyze my screen";
    const prompt = readString(req.body?.prompt || req.body?.question || req.body?.command) || defaultPrompt;
    const sessionId = readString(req.body?.sessionId);
    const source = readString(req.body?.source) || "typed";

    const payload = await executeScreenAnalysisFlow({
      image,
      prompt,
      task,
      source,
      sessionId,
    });

    res.status(200).json(payload);
  } catch (error) {
    console.error("[analyze-screen] failed", error);
    sendError(res, "/analyze-screen", error, "Screen analysis failed.");
  }
}

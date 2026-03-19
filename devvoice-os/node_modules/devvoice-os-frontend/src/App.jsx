import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE_URL, APP_STATES, UI_ERRORS } from "./config.js";
import { useScreenShare } from "./hooks/useScreenShare.js";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition.js";
import { analyzeScreenApi, askQuestionApi, checkBackendHealth, sendCommandApi } from "./services/api.js";
import { containsWakeWord, getScreenTaskFromText, isExplicitCommand } from "./utils/commandClassifier.js";
import { cleanPlainText } from "./utils/responseFormatting.js";
import { speakReply, stopSpeaking } from "./utils/speakResponse.js";

const createMessage = (role, text, extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  text,
  ...extra,
});

const normalizeStructuredReply = (payload) => {
  const structuredReply = payload?.meta?.structuredReply;
  if (!structuredReply || typeof structuredReply !== "object") {
    return null;
  }

  if (structuredReply.type === "code" && typeof structuredReply.code === "string") {
    return {
      ...structuredReply,
      code: structuredReply.code.replace(/\r/g, "").trim(),
    };
  }

  if (structuredReply.type === "text") {
    return {
      ...structuredReply,
      answer: cleanPlainText(structuredReply.answer || payload?.reply || ""),
    };
  }

  return null;
};

const createSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatSpeechError = (code) => {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return UI_ERRORS.MIC_PERMISSION;
    case "audio-capture":
      return "No microphone device is available.";
    case "network":
      return "Speech recognition network error.";
    case "no-speech":
      return "No speech detected.";
    default:
      return code || "Speech recognition failed.";
  }
};

const getActionType = (payload) =>
  typeof payload?.action === "string" ? payload.action : payload?.action?.type || "";

const getActionTask = (payload) =>
  payload?.task || (typeof payload?.action === "object" ? payload.action?.task : "");

const waitForNextPaint = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

export default function App() {
  const [appState, setAppState] = useState(APP_STATES.IDLE);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [health, setHealth] = useState(null);
  const [lastReply, setLastReply] = useState("");
  const [wakeTranscript, setWakeTranscript] = useState("");
  const [commandTranscript, setCommandTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [passiveEnabled, setPassiveEnabled] = useState(true);

  const lastReplyRef = useRef("");
  const mountedRef = useRef(false);
  const speakingRef = useRef(false);
  const commandHandledRef = useRef(false);
  const sessionIdRef = useRef(createSessionId());

  const {
    startScreenShare,
    stopScreenShare,
    captureCurrentFrame,
    isScreenSharing,
    screenError,
  } = useScreenShare();

  const {
    isListening,
    isSupported,
    recognitionError,
    isRecognitionRunning,
    startListening,
    stopListening,
    clearRecognitionError,
  } = useSpeechRecognition();

  const log = useCallback((message, data = null) => {
    console.log(`[jarvis] ${message}`, data || "");
    setActivityLog((current) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          message,
        },
        ...current,
      ].slice(0, 24),
    );
  }, []);

  const logTiming = useCallback((label, data = {}) => {
    const payload = {
      at: new Date().toISOString(),
      ...data,
    };
    console.log(`[timing] ${label}`, payload);
    setActivityLog((current) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          message: `${label} ${JSON.stringify(payload)}`,
        },
        ...current,
      ].slice(0, 24),
    );
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const payload = await checkBackendHealth();
      setHealth(payload);
    } catch (error) {
      console.error("[jarvis] health check failed", error);
      setHealth(null);
    }
  }, []);

  const pushAssistantPayload = useCallback((payload) => {
    const structuredReply = normalizeStructuredReply(payload);
    const visibleText = structuredReply?.type === "text"
      ? structuredReply.answer
      : structuredReply?.type === "code"
        ? structuredReply.title || "Solution"
        : cleanPlainText(payload.reply || "");

    console.log("[jarvis] rendering final reply", {
      provider: payload.provider,
      replyLength: String(visibleText || "").length,
      finishReason: payload?.meta?.providerMeta?.finishReason || null,
      truncated: payload?.meta?.providerMeta?.truncated || false,
    });

    setMessages((current) => [
      ...current,
      createMessage("assistant", visibleText, {
        provider: payload.provider,
        mode: payload.mode,
        audioUrl: payload.audioUrl,
        structuredReply,
      }),
    ]);

    if (visibleText) {
      setLastReply(visibleText);
      lastReplyRef.current = visibleText;
    }
  }, []);

  const resumePassiveListening = useCallback(async () => {
    if (!mountedRef.current || !passiveEnabled) {
      return;
    }

    if (!isSupported) {
      setAppState(APP_STATES.ERROR);
      setErrorMessage(UI_ERRORS.MIC_UNSUPPORTED);
      return;
    }

    clearRecognitionError();
    setErrorMessage("");
    setInfoMessage("");
    setInterimTranscript("");
    commandHandledRef.current = false;
    setAppState(APP_STATES.PASSIVE);
    log("passive listening started");

    await startListening({
      mode: "passive",
      autoRestart: true,
      onInterimTranscript: (text) => {
        setInterimTranscript(text);
      },
      onFinalTranscript: async (text) => {
        log("voice recognized", { mode: "passive", text });
        setWakeTranscript(text);

        if (speakingRef.current || !containsWakeWord(text)) {
          return;
        }

        stopListening({ manual: true });
        setAppState(APP_STATES.LISTENING);
        setInterimTranscript("");
        setInfoMessage("Wake word detected.");
        log("wake word detected", { text });

        speakingRef.current = true;
        try {
          await speakReply({
            reply: "Yes, I'm listening.",
            audioUrl: null,
          });
        } finally {
          speakingRef.current = false;
        }

        if (mountedRef.current) {
          setInfoMessage("");
          commandHandledRef.current = false;
          setAppState(APP_STATES.LISTENING);
          log("command listening started");
          await startListening({
            mode: "listening",
            autoRestart: false,
            onInterimTranscript: (commandText) => {
              setInterimTranscript(commandText);
            },
            onFinalTranscript: async (commandText) => {
              commandHandledRef.current = true;
              setCommandTranscript(commandText);
              setInterimTranscript("");
              stopListening({ manual: true });
              log("voice recognized", { mode: "command", text: commandText });
              await routeUserInput(commandText, "voice");
            },
            onError: async (code) => {
              if (code === "no-speech") {
                setInfoMessage("No command heard. Returning to passive listening.");
                await resumePassiveListening();
                return;
              }
              setAppState(APP_STATES.ERROR);
              setErrorMessage(formatSpeechError(code));
            },
            onEnd: async () => {
              if (!commandHandledRef.current && !speakingRef.current && passiveEnabled) {
                await resumePassiveListening();
              }
            },
          });
        }
      },
      onError: (code) => {
        if (code === "no-speech" || speakingRef.current) {
          return;
        }
        setAppState(APP_STATES.ERROR);
        setErrorMessage(formatSpeechError(code));
      },
    });
  }, [
    clearRecognitionError,
    isSupported,
    log,
    passiveEnabled,
    startListening,
    stopListening,
  ]);

  const speakAssistantPayload = useCallback(
    async (payload, { resumePassive = true } = {}) => {
      if (!payload?.reply) {
        if (resumePassive) {
          await resumePassiveListening();
        }
        return;
      }

      stopListening({ manual: true });
      setAppState(APP_STATES.SPEAKING);
      log("speech output started", { provider: payload.provider });
      logTiming("tts_started", {
        provider: payload.provider,
        hasAudioUrl: Boolean(payload.audioUrl),
        replyLength: String(payload.reply || "").length,
      });
      speakingRef.current = true;

      try {
        const speechResult = await speakReply(payload);
        setInfoMessage(
          speechResult.method === "audio"
            ? "Playing Murf-generated audio."
            : "Using browser speech synthesis fallback.",
        );
      } catch (error) {
        console.error("[jarvis] speech output failed", error);
        setErrorMessage(`Speech output failed: ${error.message}`);
      } finally {
        speakingRef.current = false;
      }

      if (resumePassive) {
        await resumePassiveListening();
      } else {
        setAppState(APP_STATES.IDLE);
      }
    },
    [log, logTiming, resumePassiveListening, stopListening],
  );

  const analyzeCapturedScreen = useCallback(
    async (prompt, source = "typed", task = "describe_screen") => {
      const requestStartedAt = performance.now();
      setErrorMessage("");
      setInfoMessage("");
      setAppState(APP_STATES.PROCESSING);
      log("screen capture started", { prompt, source, task });
      logTiming("request_start", { source, task });

      try {
        if (!isScreenSharing) {
          await startScreenShare();
        }

        const frame = await captureCurrentFrame(
          task === "solve_question_from_screen"
            ? { maxDimension: 1600, mimeType: "image/jpeg", quality: 0.82 }
            : { maxDimension: 1440, mimeType: "image/jpeg", quality: 0.78 },
        );
        log("screen captured", frame);
        logTiming("image_capture_done", {
          source,
          task,
          width: frame.sourceWidth,
          height: frame.sourceHeight,
          mimeType: frame.mimeType,
          bytesApprox: frame.imageBase64.length,
          elapsedMs: Math.round(performance.now() - requestStartedAt),
        });
        log("analyze-screen request sent", { prompt, source, task });
        logTiming("gemini_request_sent", {
          source,
          task,
          elapsedMs: Math.round(performance.now() - requestStartedAt),
        });

        const payload = await analyzeScreenApi(frame.dataUrl, {
          prompt,
          source,
          task,
          sessionId: sessionIdRef.current,
        });
        log("provider response received", payload);
        logTiming("gemini_response_received", {
          source,
          task,
          elapsedMs: Math.round(performance.now() - requestStartedAt),
          provider: payload.provider,
          replyLength: String(payload.reply || "").length,
        });
        pushAssistantPayload(payload);
        await waitForNextPaint();
        logTiming("text_rendered", {
          source,
          task,
          elapsedMs: Math.round(performance.now() - requestStartedAt),
        });
        await speakAssistantPayload(payload);
      } catch (error) {
        console.error("[jarvis] screen analysis failed", error);
        setAppState(APP_STATES.ERROR);
        setErrorMessage(error.message || "Screen analysis failed.");
        await resumePassiveListening();
      }
    },
    [
      captureCurrentFrame,
      isScreenSharing,
      log,
      logTiming,
      pushAssistantPayload,
      resumePassiveListening,
      speakAssistantPayload,
      startScreenShare,
    ],
  );

  const executeAssistantAction = useCallback(
    async (payload, source) => {
      const actionType = getActionType(payload);
      if (!actionType) {
        return false;
      }

      log("action received", payload.action);

      if (actionType === "analyze_screen") {
        await analyzeCapturedScreen(
          payload?.action?.prompt || payload?.prompt || payload.reply,
          source,
          getActionTask(payload) || "describe_screen",
        );
        return true;
      }

      if (actionType === "clear_history") {
        setMessages([]);
        setLastReply("");
        lastReplyRef.current = "";
      }

      if (actionType === "repeat_last_reply") {
        const repeatedReply = lastReplyRef.current;
        if (repeatedReply) {
          await speakAssistantPayload({
            reply: repeatedReply,
            audioUrl: null,
            provider: "browser",
          });
        } else {
          setInfoMessage("There is no previous assistant reply to repeat.");
          await resumePassiveListening();
        }
        return true;
      }

      if (actionType === "stop_assistant") {
        setPassiveEnabled(false);
        stopListening({ manual: true });
        stopSpeaking();
        setAppState(APP_STATES.IDLE);
        return true;
      }

      return false;
    },
    [analyzeCapturedScreen, log, resumePassiveListening, speakAssistantPayload, stopListening],
  );

  const routeUserInput = useCallback(
    async (text, source = "typed") => {
      const trimmed = text.trim();
      if (!trimmed) {
        setErrorMessage("Input must not be empty.");
        await resumePassiveListening();
        return;
      }

      stopListening({ manual: true });
      setMessages((current) => [...current, createMessage("user", trimmed, { source })]);
      setErrorMessage("");
      setInfoMessage("");
      setAppState(APP_STATES.PROCESSING);
      log("text sent", { text: trimmed, source });
      logTiming("request_start", { source, route: "text_or_command" });

      try {
        const screenTask = getScreenTaskFromText(trimmed);
        const payload = isExplicitCommand(trimmed) || screenTask
          ? await sendCommandApi(trimmed, source)
          : await askQuestionApi(trimmed, source);

        log("provider response received", payload);
        logTiming("gemini_response_received", {
          source,
          route: payload.route,
          provider: payload.provider,
          replyLength: String(payload.reply || "").length,
        });
        console.log("[jarvis] final provider payload", {
          provider: payload.provider,
          replyLength: String(payload.reply || "").length,
          finishReason: payload?.meta?.providerMeta?.finishReason || null,
          truncated: payload?.meta?.providerMeta?.truncated || false,
        });

        const actionType = getActionType(payload);
        const shouldRenderRoutingReply = actionType !== "analyze_screen";

        if (payload?.reply && shouldRenderRoutingReply) {
          pushAssistantPayload(payload);
          await waitForNextPaint();
          logTiming("text_rendered", {
            source,
            route: payload.route,
          });
        }

        const handledAction = await executeAssistantAction(payload, source);
        if (!handledAction) {
          await speakAssistantPayload(payload);
        }

        await refreshHealth();
      } catch (error) {
        console.error("[jarvis] backend request failed", error);
        setAppState(APP_STATES.ERROR);
        setErrorMessage(error.message || UI_ERRORS.BACKEND_UNAVAILABLE);
        await resumePassiveListening();
      }
    },
    [
      executeAssistantAction,
      log,
      logTiming,
      pushAssistantPayload,
      refreshHealth,
      resumePassiveListening,
      speakAssistantPayload,
      stopListening,
    ],
  );

  const handleSubmit = useCallback(async () => {
    const text = input;
    setInput("");
    await routeUserInput(text, "typed");
  }, [input, routeUserInput]);

  const handleManualMic = useCallback(async () => {
    if (passiveEnabled) {
      setPassiveEnabled(false);
      stopListening({ manual: true });
      setAppState(APP_STATES.IDLE);
      setInfoMessage("Passive listening paused.");
      return;
    }

    setPassiveEnabled(true);
    setInfoMessage("Passive listening resumed.");
    await resumePassiveListening();
  }, [passiveEnabled, resumePassiveListening, stopListening]);

  useEffect(() => {
    mountedRef.current = true;
    refreshHealth();

    return () => {
      mountedRef.current = false;
      stopListening({ manual: true });
      stopSpeaking();
      stopScreenShare();
    };
  }, [refreshHealth, stopListening, stopScreenShare]);

  useEffect(() => {
    if (!mountedRef.current) {
      return;
    }

    if (isSupported && passiveEnabled) {
      resumePassiveListening();
      return;
    }

    if (!isSupported) {
      setAppState(APP_STATES.ERROR);
      setErrorMessage(UI_ERRORS.MIC_UNSUPPORTED);
    }
  }, [isSupported, passiveEnabled, resumePassiveListening]);

  useEffect(() => {
    if (recognitionError && recognitionError !== "no-speech") {
      setErrorMessage(formatSpeechError(recognitionError));
    }
  }, [recognitionError]);

  useEffect(() => {
    if (!screenError) {
      return;
    }

    setErrorMessage(screenError);
  }, [screenError]);

  const providerSummary = useMemo(() => {
    const items = health?.meta?.providers?.items || {};
    return Object.entries(items).map(([key, value]) => ({
      key,
      ok: value?.ok,
      label: key,
      detail: value?.message || value?.textModel || "configured",
    }));
  }, [health]);

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">DevVoice OS</p>
          <h1>JARVIS</h1>
          <p className="hero-copy">
            Always-on passive listening, wake-word activation, Gemini-first answers, and real screen analysis.
          </p>
        </div>
        <div className="status-stack">
          <span className={`status-pill ${appState}`}>State: {appState}</span>
          <span className={`status-pill ${isListening ? "live" : "idle"}`}>
            Mic: {isListening ? "live" : "idle"}
          </span>
          <span className={`status-pill ${isRecognitionRunning ? "live" : "idle"}`}>
            Recognition: {isRecognitionRunning ? "running" : "stopped"}
          </span>
          <span className={`status-pill ${passiveEnabled ? "live" : "idle"}`}>
            Passive: {passiveEnabled ? "on" : "off"}
          </span>
          <span className={`status-pill ${isScreenSharing ? "live" : "idle"}`}>
            Screen: {isScreenSharing ? "shared" : "not shared"}
          </span>
          <span className="status-pill">Backend: {API_BASE_URL}</span>
        </div>
      </section>

      {errorMessage ? <section className="banner error">{errorMessage}</section> : null}
      {infoMessage ? <section className="banner info">{infoMessage}</section> : null}

      <section className="composer-card">
        <div className="composer-row">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a question or command. Voice input starts automatically with wake words: jarvis, hello jarvis, hey jarvis."
          />
          <div className="composer-actions">
            <button type="button" onClick={handleSubmit} disabled={!input.trim()}>
              Send
            </button>
            <button type="button" onClick={handleManualMic}>
              {passiveEnabled ? "Pause Passive Mic" : "Resume Passive Mic"}
            </button>
            <button
              type="button"
              onClick={() => analyzeCapturedScreen("Analyze my screen", "manual", "describe_screen")}
            >
              Analyze Screen
            </button>
            <button
              type="button"
              onClick={() =>
                analyzeCapturedScreen("Solve the question on my screen", "manual", "solve_question_from_screen")
              }
            >
              Solve From Screen
            </button>
            <button
              type="button"
              onClick={async () => {
                log("screen capture started", { source: "manual_share" });
                try {
                  await startScreenShare();
                  setInfoMessage("Screen sharing permission granted.");
                } catch (error) {
                  setErrorMessage(error.message || UI_ERRORS.SCREEN_UNSUPPORTED);
                }
              }}
            >
              Share Screen
            </button>
            <button
              type="button"
              onClick={() => {
                setPassiveEnabled(false);
                stopListening({ manual: true });
                stopSpeaking();
                setAppState(APP_STATES.IDLE);
              }}
            >
              Stop Assistant
            </button>
          </div>
        </div>
        <div className="transcript-row">
          <span>Wake transcript</span>
          <strong>{wakeTranscript || "Waiting for wake word."}</strong>
          <span>Command transcript</span>
          <strong>{commandTranscript || interimTranscript || "Waiting for command."}</strong>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Conversation</h2>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMessages([]);
                setLastReply("");
                lastReplyRef.current = "";
              }}
            >
              Clear
            </button>
          </div>
          <div className="message-list">
            {messages.length ? (
              messages.map((message) => (
                <div key={message.id} className={`message ${message.role}`}>
                  <span>{message.role}</span>
                  {message.structuredReply?.type === "code" ? (
                    <>
                      <pre>{message.structuredReply.code}</pre>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => navigator.clipboard?.writeText(message.structuredReply.code)}
                      >
                        Copy
                      </button>
                    </>
                  ) : (
                    <p>{message.text}</p>
                  )}
                  {message.provider ? (
                    <small>
                      {message.provider} | {message.mode || "text"}
                    </small>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="empty-state">No messages yet.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Diagnostics</h2>
            <button type="button" className="text-button" onClick={refreshHealth}>
              Refresh
            </button>
          </div>
          <div className="diagnostic-list">
            {providerSummary.map((provider) => (
              <div key={provider.key} className={`diagnostic-item ${provider.ok ? "ok" : "bad"}`}>
                <strong>{provider.label}</strong>
                <span>{provider.ok ? "ready" : "unavailable"}</span>
                <small>{provider.detail}</small>
              </div>
            ))}
          </div>
          <div className="panel-head">
            <h2>Activity</h2>
          </div>
          <div className="activity-list">
            {activityLog.length ? (
              activityLog.map((item) => <p key={item.id}>{item.message}</p>)
            ) : (
              <p className="empty-state">No events logged yet.</p>
            )}
          </div>
          <div className="panel-head">
            <h2>Last Reply</h2>
          </div>
          <p className="last-reply">{lastReply || "No assistant reply yet."}</p>
        </article>
      </section>
    </main>
  );
}

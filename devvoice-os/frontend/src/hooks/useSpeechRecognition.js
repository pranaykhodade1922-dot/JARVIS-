import { useCallback, useEffect, useRef, useState } from "react";

const RESTART_DELAY_MS = 900;
const getSpeechRecognitionCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition;

const createEmptyHandlers = () => ({
  onFinalTranscript: null,
  onInterimTranscript: null,
  onError: null,
  onEnd: null,
});

const logRecognition = (event, payload = {}) => {
  console.log(`[speechRecognition] ${event}`, {
    at: new Date().toISOString(),
    ...payload,
  });
};

export function useSpeechRecognition() {
  const recognitionRef = useRef(null);
  const mountedRef = useRef(false);
  const restartTimerRef = useRef(null);
  const handlersRef = useRef(createEmptyHandlers());
  const sessionRef = useRef({
    mode: "idle",
    autoRestart: false,
    manualStop: true,
    transitionId: 0,
  });
  const isRecognitionRunningRef = useRef(false);
  const isStartPendingRef = useRef(false);

  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [recognitionError, setRecognitionError] = useState("");
  const [sessionMode, setSessionMode] = useState("idle");

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const updateSessionMode = useCallback((mode) => {
    sessionRef.current.mode = mode;
    setSessionMode(mode);
  }, []);

  const stopRecognitionInternal = useCallback(
    (reason, { manual = true, preserveMode = false } = {}) => {
      clearRestartTimer();
      sessionRef.current.manualStop = manual;
      sessionRef.current.autoRestart = false;
      isStartPendingRef.current = false;

      if (!preserveMode) {
        updateSessionMode("idle");
      }

      if (!recognitionRef.current) {
        return;
      }

      if (!isRecognitionRunningRef.current) {
        logRecognition("stop-skipped", {
          reason,
          mode: sessionRef.current.mode,
          manual,
        });
        return;
      }

      try {
        logRecognition("stop", {
          reason,
          mode: sessionRef.current.mode,
          manual,
        });
        recognitionRef.current.stop();
      } catch (error) {
        logRecognition("stop-error", {
          reason,
          mode: sessionRef.current.mode,
          message: error?.message || "Unknown stop error.",
        });
      }
    },
    [clearRestartTimer, updateSessionMode],
  );

  const startRecognitionInternal = useCallback(
    (reason) => {
      const recognition = recognitionRef.current;
      if (!recognition || !mountedRef.current) {
        return false;
      }

      if (isRecognitionRunningRef.current || isStartPendingRef.current) {
        logRecognition("start-blocked", {
          reason,
          mode: sessionRef.current.mode,
          isRecognitionRunning: isRecognitionRunningRef.current,
          isStartPending: isStartPendingRef.current,
        });
        return false;
      }

      try {
        isStartPendingRef.current = true;
        logRecognition("start", {
          reason,
          mode: sessionRef.current.mode,
          autoRestart: sessionRef.current.autoRestart,
        });
        recognition.start();
        return true;
      } catch (error) {
        isStartPendingRef.current = false;
        if (error?.name === "InvalidStateError") {
          logRecognition("start-invalid-state", {
            reason,
            mode: sessionRef.current.mode,
          });
          return false;
        }

        const message = error?.message || "Speech recognition could not start.";
        logRecognition("start-error", {
          reason,
          mode: sessionRef.current.mode,
          message,
        });
        setRecognitionError(message);
        handlersRef.current.onError?.(message, sessionRef.current.mode);
        return false;
      }
    },
    [],
  );

  const scheduleRestart = useCallback(
    (reason) => {
      clearRestartTimer();

      if (
        !mountedRef.current
        || sessionRef.current.manualStop
        || !sessionRef.current.autoRestart
        || sessionRef.current.mode !== "passive"
      ) {
        logRecognition("restart-skipped", {
          reason,
          mode: sessionRef.current.mode,
          manualStop: sessionRef.current.manualStop,
          autoRestart: sessionRef.current.autoRestart,
        });
        return;
      }

      const transitionId = sessionRef.current.transitionId;
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;

        if (
          !mountedRef.current
          || sessionRef.current.manualStop
          || !sessionRef.current.autoRestart
          || sessionRef.current.mode !== "passive"
          || transitionId !== sessionRef.current.transitionId
        ) {
          logRecognition("restart-cancelled", {
            reason,
            mode: sessionRef.current.mode,
            manualStop: sessionRef.current.manualStop,
            autoRestart: sessionRef.current.autoRestart,
            transitionId,
            currentTransitionId: sessionRef.current.transitionId,
          });
          return;
        }

        startRecognitionInternal(`delayed-restart:${reason}`);
      }, RESTART_DELAY_MS);

      logRecognition("restart-scheduled", {
        reason,
        mode: sessionRef.current.mode,
        delayMs: RESTART_DELAY_MS,
        transitionId,
      });
    },
    [clearRestartTimer, startRecognitionInternal],
  );

  useEffect(() => {
    mountedRef.current = true;
    const SpeechRecognition = getSpeechRecognitionCtor();

    if (!SpeechRecognition) {
      setIsSupported(false);
      return () => {
        mountedRef.current = false;
      };
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!mountedRef.current) {
        return;
      }

      isRecognitionRunningRef.current = true;
      isStartPendingRef.current = false;
      setIsListening(true);
      setRecognitionError("");
      logRecognition("onstart", {
        mode: sessionRef.current.mode,
        autoRestart: sessionRef.current.autoRestart,
      });
    };

    recognition.onresult = async (event) => {
      if (!mountedRef.current) {
        return;
      }

      let finalText = "";
      let interimText = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = event.results[index][0]?.transcript || "";
        if (event.results[index].isFinal) {
          finalText += ` ${chunk}`;
        } else {
          interimText += ` ${chunk}`;
        }
      }

      const cleanedInterim = interimText.trim();
      handlersRef.current.onInterimTranscript?.(cleanedInterim, sessionRef.current.mode);

      const cleanedFinal = finalText.trim();
      if (!cleanedFinal) {
        return;
      }

      logRecognition("onresult-final", {
        mode: sessionRef.current.mode,
        text: cleanedFinal,
      });
      handlersRef.current.onInterimTranscript?.("", sessionRef.current.mode);
      await handlersRef.current.onFinalTranscript?.(cleanedFinal, sessionRef.current.mode);
    };

    recognition.onerror = (event) => {
      if (!mountedRef.current) {
        return;
      }

      const errorCode = event.error || "speech-recognition-error";
      isStartPendingRef.current = false;

      if (errorCode !== "aborted") {
        isRecognitionRunningRef.current = false;
        setIsListening(false);
        setRecognitionError(errorCode);
      }

      logRecognition("onerror", {
        mode: sessionRef.current.mode,
        errorCode,
        manualStop: sessionRef.current.manualStop,
      });

      if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
        sessionRef.current.manualStop = true;
        sessionRef.current.autoRestart = false;
        updateSessionMode("idle");
        handlersRef.current.onError?.(errorCode, sessionRef.current.mode);
        return;
      }

      if (errorCode === "network") {
        handlersRef.current.onError?.(errorCode, sessionRef.current.mode);
        scheduleRestart("network-error");
        return;
      }

      if (errorCode === "aborted") {
        logRecognition("aborted", {
          mode: sessionRef.current.mode,
          manualStop: sessionRef.current.manualStop,
        });
        return;
      }

      handlersRef.current.onError?.(errorCode, sessionRef.current.mode);
    };

    recognition.onend = () => {
      if (!mountedRef.current) {
        return;
      }

      isRecognitionRunningRef.current = false;
      isStartPendingRef.current = false;
      setIsListening(false);

      const payload = {
        mode: sessionRef.current.mode,
        manualStop: sessionRef.current.manualStop,
        autoRestart: sessionRef.current.autoRestart,
      };

      logRecognition("onend", payload);
      handlersRef.current.onEnd?.(payload);

      if (sessionRef.current.manualStop || !sessionRef.current.autoRestart) {
        return;
      }

      scheduleRestart("onend");
    };

    recognitionRef.current = recognition;
    logRecognition("ready");

    return () => {
      mountedRef.current = false;
      clearRestartTimer();
      sessionRef.current.manualStop = true;
      sessionRef.current.autoRestart = false;
      isRecognitionRunningRef.current = false;
      isStartPendingRef.current = false;

      try {
        recognition.stop();
      } catch {
        // ignore teardown errors
      }

      recognitionRef.current = null;
    };
  }, [clearRestartTimer, scheduleRestart, updateSessionMode]);

  const startListening = useCallback(
    async ({
      mode,
      autoRestart = true,
      onFinalTranscript,
      onInterimTranscript,
      onError,
      onEnd,
    }) => {
      const recognition = recognitionRef.current;
      if (!recognition) {
        return false;
      }

      const normalizedMode = mode === "passive" ? "passive" : "listening";

      handlersRef.current = {
        onFinalTranscript: onFinalTranscript || null,
        onInterimTranscript: onInterimTranscript || null,
        onError: onError || null,
        onEnd: onEnd || null,
      };

      clearRestartTimer();
      setRecognitionError("");
      sessionRef.current.transitionId += 1;
      sessionRef.current.manualStop = false;
      sessionRef.current.autoRestart = normalizedMode === "passive" ? autoRestart : false;
      updateSessionMode(normalizedMode);

      logRecognition("session-configured", {
        requestedMode: mode,
        normalizedMode,
        autoRestart: sessionRef.current.autoRestart,
        isRecognitionRunning: isRecognitionRunningRef.current,
        isStartPending: isStartPendingRef.current,
        transitionId: sessionRef.current.transitionId,
      });

      if (isRecognitionRunningRef.current || isStartPendingRef.current) {
        if (sessionRef.current.mode === normalizedMode && isRecognitionRunningRef.current) {
          logRecognition("session-already-running", {
            mode: normalizedMode,
          });
          return true;
        }

        stopRecognitionInternal("transition-stop", {
          manual: true,
          preserveMode: true,
        });

        const transitionId = sessionRef.current.transitionId;
        return new Promise((resolve) => {
          window.setTimeout(() => {
            if (
              !mountedRef.current
              || sessionRef.current.transitionId !== transitionId
              || sessionRef.current.manualStop
            ) {
              resolve(false);
              return;
            }

            resolve(startRecognitionInternal("transition-start"));
          }, RESTART_DELAY_MS);
        });
      }

      return startRecognitionInternal("direct-start");
    },
    [clearRestartTimer, startRecognitionInternal, stopRecognitionInternal, updateSessionMode],
  );

  const stopListening = useCallback(
    ({ manual = true, preserveMode = false } = {}) => {
      stopRecognitionInternal("external-stop", {
        manual,
        preserveMode,
      });
    },
    [stopRecognitionInternal],
  );

  const clearRecognitionError = useCallback(() => {
    setRecognitionError("");
  }, []);

  return {
    isSupported,
    isListening,
    recognitionError,
    sessionMode,
    isRecognitionRunning: isRecognitionRunningRef.current,
    startListening,
    stopListening,
    clearRecognitionError,
  };
}

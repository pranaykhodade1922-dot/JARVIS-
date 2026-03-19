import { cleanSpeechText } from "./responseFormatting.js";

let activeAudio = null;
let cachedMaleVoice = null;

export function stopSpeaking() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

const MALE_VOICE_HINTS = ["male", "david", "mark", "james", "george", "daniel", "alex", "tom", "aaron"];

const pickMaleVoice = () => {
  if (!("speechSynthesis" in window)) {
    return null;
  }

  if (cachedMaleVoice) {
    return cachedMaleVoice;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return null;
  }

  const englishVoices = voices.filter((voice) => /^en[-_]/i.test(voice.lang || ""));
  const pool = englishVoices.length ? englishVoices : voices;
  const exactMale = pool.find((voice) =>
    MALE_VOICE_HINTS.some((hint) => String(voice.name || "").toLowerCase().includes(hint)),
  );

  cachedMaleVoice = exactMale || pool[0] || null;
  return cachedMaleVoice;
};

const speakWithBrowser = (text) =>
  new Promise((resolve, reject) => {
    if (!text || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      reject(new Error("Browser speech synthesis is unavailable."));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = pickMaleVoice();
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || "en-US";
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = resolve;
    utterance.onerror = () => reject(new Error("Browser speech synthesis failed."));
    window.speechSynthesis.speak(utterance);
  });

const playAudioUrl = (audioUrl) =>
  new Promise((resolve, reject) => {
    const audio = new Audio(audioUrl);
    activeAudio = audio;
    audio.onended = () => {
      activeAudio = null;
      resolve();
    };
    audio.onerror = () => {
      activeAudio = null;
      reject(new Error("Audio playback failed."));
    };
    audio.play().catch((error) => {
      activeAudio = null;
      reject(error);
    });
  });

export async function speakReply({ reply, speechText, audioUrl }) {
  stopSpeaking();
  const spokenText = cleanSpeechText(speechText || reply || "");
  console.log("[speech] TTS start", {
    startedAt: new Date().toISOString(),
    replyLength: spokenText.length,
    hasAudioUrl: Boolean(audioUrl),
  });

  if (audioUrl) {
    try {
      await playAudioUrl(audioUrl);
      return {
        ok: true,
        method: "audio",
      };
    } catch (error) {
      console.error("[speech] backend audio playback failed", error);
    }
  }

  await speakWithBrowser(spokenText);
  return {
    ok: true,
    method: "browser",
  };
}

if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedMaleVoice = null;
  };
}

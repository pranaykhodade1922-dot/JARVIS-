export const speak = (text, options = {}) => {
  if (!("speechSynthesis" in window) || !text) {
    return false;
  }

  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "en-US";
  speech.rate = 1;
  speech.pitch = 1;
  speech.onend = options.onEnd || null;
  speech.onerror = options.onError || null;

  window.speechSynthesis.speak(speech);
  return true;
};

export const stopSpeaking = () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
};

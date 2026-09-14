/*
 * voice-command.js
 * ----------------
 * The speech-recognition ENGINE only — no UI of its own. It's used by
 * monitoring.js when "🎤 Voice command" is selected in the "Check every"
 * dropdown: instead of a timer, monitoring listens continuously for the
 * trigger phrase ("Is my path clear?" / 「道は安全ですか」) and only
 * checks when it hears it.
 *
 * Exposes three functions to the rest of the app:
 *   - isVoiceRecognitionSupported()   — feature detection
 *   - startVoiceRecognition(onPhrase) — starts listening; calls onPhrase()
 *                                       every time the trigger phrase is heard
 *   - stopVoiceRecognition()          — stops listening, releases the mic
 *
 * HONEST LIMITATION: iOS Safari does not implement SpeechRecognition at
 * all — Apple has never shipped it for web pages, only native apps. This
 * works on Android Chrome and desktop Chrome/Edge. monitoring.js checks
 * isVoiceRecognitionSupported() and hides the "Voice command" dropdown
 * option entirely on browsers where it can't work, rather than offering
 * something broken.
 *
 * Like the camera, microphone listening only works while this app is the
 * open, visible tab — phones don't allow background mic access either.
 */

const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isListening = false;
let onPhraseCallback = null;

function isVoiceRecognitionSupported() {
  return Boolean(SpeechRecognitionClass);
}

function startVoiceRecognition(onPhrase) {
  if (!isVoiceRecognitionSupported() || isListening) {
    return;
  }

  onPhraseCallback = onPhrase;
  recognition = createRecognition();

  try {
    recognition.start();
    isListening = true;
  } catch (error) {
    console.warn("Could not start voice recognition:", error);
  }
}

function stopVoiceRecognition() {
  isListening = false;
  onPhraseCallback = null;

  if (recognition) {
    recognition.onend = null; // don't auto-restart from the handler below
    try {
      recognition.stop();
    } catch (error) {
      // Already stopped — nothing to do.
    }
    recognition = null;
  }
}

function createRecognition() {
  const instance = new SpeechRecognitionClass();
  instance.continuous = true;
  instance.interimResults = false;
  instance.lang = speechLangCode();

  instance.onresult = handleRecognitionResult;
  instance.onerror = handleRecognitionError;
  instance.onend = handleRecognitionEnd;

  return instance;
}

function handleRecognitionResult(event) {
  const lastResult = event.results[event.results.length - 1];
  const transcript = lastResult[0].transcript;

  if (matchesTriggerPhrase(transcript, CLEARPATH_LANG) && onPhraseCallback) {
    onPhraseCallback();
  }
}

function handleRecognitionError(event) {
  if (event.error === "not-allowed" || event.error === "service-not-allowed") {
    // Microphone permission was denied — no point continuing to retry.
    stopVoiceRecognition();
    showError(t("voice_command_mic_error"));
  }
  // Other errors (e.g. "no-speech") are routine — onend below restarts
  // listening automatically as long as isListening is still true.
}

function handleRecognitionEnd() {
  // Browsers end a recognition session automatically after a period of
  // silence — restart it to keep "continuous" listening going, as long as
  // it hasn't been deliberately stopped and the app is still visible.
  if (isListening && !document.hidden) {
    try {
      recognition = createRecognition();
      recognition.start();
    } catch (error) {
      console.warn("Could not restart voice recognition:", error);
    }
  }
}

// Update the recognition language on the fly if the user switches languages
// mid-session — takes effect from the next automatic restart.
document.addEventListener("clearpath:languagechange", () => {
  if (recognition) {
    recognition.lang = speechLangCode();
  }
});

// --- Matching the trigger phrase ---------------------------------------------
//
// Speech-to-text isn't perfect, so this checks for the distinctive core of
// the phrase rather than requiring an exact match.

function matchesTriggerPhrase(transcript, language) {
  const normalized = transcript.toLowerCase().replace(/[.,!?？。、]/g, "").trim();

  if (language === "ja") {
    return normalized.includes("安全") && normalized.includes("道");
  }
  return normalized.includes("path clear");
}

/*
 * alerts.js
 * ---------
 * Shows the result of every analysis as a persistent on-screen message
 * (stays visible until the NEXT check replaces it — that's the reliable
 * channel) plus an alert tone and spoken announcement as an extra layer
 * for anyone not looking at the screen. Sound isn't guaranteed to work on
 * every phone (silent switches, browser autoplay rules, etc.), so the
 * on-screen message is the one thing that always works.
 *
 * A "Replay Alert" button re-plays the sound/speech for the last result
 * without running a new analysis.
 *
 * Mobile browsers only allow sound/speech to START at all if it happens
 * as a direct result of a user tap (not a background timer) — at least
 * once per page load. unlockAudioContext() is called from inside real
 * click handlers (the Analyze button, the Start Monitoring button, the
 * Replay button) specifically to satisfy that rule; after that, later
 * automatic sounds triggered by Live Monitoring's timer keep working.
 *
 * This file also works around two well-known mobile speech bugs:
 *   1. iOS Safari sometimes silently drops the FIRST speak() call after
 *      a period of inactivity — we detect that (nothing actually started
 *      speaking) and retry once.
 *   2. Chrome/Android cuts off speech after ~15 seconds on some versions
 *      unless the synthesizer is "kept alive" with periodic pause/resume
 *      calls — we do that automatically for longer announcements.
 */

const replayAlertButton = document.getElementById("replay-alert-button");
const alertMessage = document.getElementById("alert-message");

let audioContext = null;
let latestAnnounceData = null;
let speechKeepAliveTimer = null;
let cachedVoices = [];

// Single source of truth for severity colors (1-5) — matches the colors
// Pillow draws on the photo itself (backend/hazard_checklist.py).
const SEVERITY_COLORS = {
  1: "#6fb98f",
  2: "#a3c95a",
  3: "#e8b23a",
  4: "#e8823a",
  5: "#d9534f",
};

function colorForSeverity(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS[3];
}

// --- Unlocking audio on mobile (call this from inside a real click) ------

function unlockAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    if (!audioContext) {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  }

  // Also "warm up" speech synthesis inside this same real click — helps
  // avoid the iOS bug where the very first speak() call of a session
  // gets silently dropped.
  if ("speechSynthesis" in window && speechSynthesis.paused) {
    speechSynthesis.resume();
  }
}

// --- Alert tone (generated with the Web Audio API — no sound file needed) -
//
// Louder and snappier than a typical UI chime on purpose — this needs to
// be noticeable, not subtle. Beep count and pitch both scale with severity.

const BEEP_DURATION = 0.16;
const BEEP_GAP = 0.2; // time from the start of one beep to the start of the next

function playAlertTone(maxSeverity) {
  if (!audioContext) {
    unlockAudioContext();
  }
  if (!audioContext) {
    return; // Web Audio isn't supported in this browser — the on-screen message still shows
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  const beepCount = Math.min(5, Math.max(1, maxSeverity));
  let time = audioContext.currentTime;

  for (let i = 0; i < beepCount; i++) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square"; // more piercing/attention-grabbing than a sine tone
    oscillator.frequency.value = 700 + maxSeverity * 70; // higher pitch = more urgent

    // A quick fade in/out avoids a harsh "click" at the start/end of each beep.
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.5, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + BEEP_DURATION);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + BEEP_DURATION + 0.02);

    time += BEEP_GAP;
  }

  return beepCount * BEEP_GAP; // seconds — caller uses this to time the speech that follows
}

// --- Speech (Web Speech API) ----------------------------------------------

function getPreferredVoice() {
  if (!("speechSynthesis" in window)) {
    return null;
  }
  if (cachedVoices.length === 0) {
    cachedVoices = speechSynthesis.getVoices();
  }
  if (cachedVoices.length === 0) {
    return null;
  }
  // Prefer a local (higher quality, no network needed) voice matching the
  // currently selected app language.
  const langPrefix = CLEARPATH_LANG === "ja" ? "ja" : "en";
  return (
    cachedVoices.find((v) => v.lang && v.lang.startsWith(langPrefix) && v.localService) ||
    cachedVoices.find((v) => v.lang && v.lang.startsWith(langPrefix)) ||
    cachedVoices[0]
  );
}

// Voice lists load asynchronously on first page load in some browsers.
if ("speechSynthesis" in window) {
  cachedVoices = speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => {
    cachedVoices = speechSynthesis.getVoices();
  };
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) {
    return;
  }

  stopSpeechKeepAlive();
  speechSynthesis.cancel(); // stop anything currently being spoken first

  // A brief delay after cancel() noticeably improves reliability on iOS,
  // which can otherwise silently ignore a speak() called immediately
  // after a cancel().
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05; // brisk and clear, not sluggish
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.lang = speechLangCode();

    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = startSpeechKeepAlive;
    utterance.onend = stopSpeechKeepAlive;
    utterance.onerror = stopSpeechKeepAlive;

    speechSynthesis.speak(utterance);

    // Some mobile browsers occasionally drop a speak() call entirely with
    // no error — if nothing actually started within half a second, retry once.
    setTimeout(() => {
      if (!speechSynthesis.speaking && !speechSynthesis.pending) {
        speechSynthesis.speak(utterance);
      }
    }, 500);
  }, 60);
}

// Chrome on Android/desktop has a long-standing bug where speech cuts off
// after ~15 seconds unless kept alive with periodic pause/resume calls.
function startSpeechKeepAlive() {
  stopSpeechKeepAlive();
  speechKeepAliveTimer = setInterval(() => {
    if (speechSynthesis.speaking) {
      speechSynthesis.pause();
      speechSynthesis.resume();
    }
  }, 5000);
}

function stopSpeechKeepAlive() {
  if (speechKeepAliveTimer) {
    clearInterval(speechKeepAliveTimer);
    speechKeepAliveTimer = null;
  }
}

// Clear, deliberately short sentences read better aloud than one long
// run-on sentence — TTS engines pause naturally at periods.
function buildAnnouncementText(hazards) {
  const parts = [t("hazards_found_intro", { n: hazards.length, s: hazards.length > 1 ? "s" : "" })];

  hazards.forEach((hazard, index) => {
    const name = hazard.label || "Hazard";
    const fix = hazard.fix_short || hazard.suggested_fix || "";
    parts.push(t("hazard_of", { i: index + 1, n: hazards.length, name }));
    if (fix) {
      parts.push(t("fix_label", { fix }));
    }
  });

  return parts.join(" ");
}

// --- On-screen message (the reliable channel — always shown) -------------
//
// This stays on screen exactly as-is until the NEXT check overwrites it —
// it is never auto-hidden or timed out, so it's readable even if you
// glance at the phone well after a check finished.

function displayAlertMessage(data) {
  latestAnnounceData = data;
  replayAlertButton.hidden = false;

  const hazards = data.hazards_found || [];

  alertMessage.classList.remove("severity-1", "severity-2", "severity-3", "severity-4", "severity-5", "all-clear");

  if (hazards.length === 0) {
    alertMessage.textContent = t("all_clear_message");
    alertMessage.classList.add("all-clear");
  } else {
    const maxSeverity = hazards.reduce((max, hazard) => Math.max(max, hazard.severity || 0), 0);
    alertMessage.textContent = buildAnnouncementText(hazards);
    alertMessage.classList.add(`severity-${maxSeverity}`);
  }

  alertMessage.hidden = false;
}

// --- Main entry point: called after every NEW analysis (manual or automatic) --

function announceHazards(data) {
  displayAlertMessage(data); // the reliable on-screen message, always shown first

  const hazards = data.hazards_found || [];

  if (hazards.length === 0) {
    // Good news doesn't need an alert tone — just a brief spoken confirmation.
    speak(t("all_clear_speech"));
    return;
  }

  const maxSeverity = hazards.reduce((max, hazard) => Math.max(max, hazard.severity || 0), 0);
  const toneDurationSeconds = playAlertTone(maxSeverity) || 0;

  // Give the beeps just enough time to finish before speaking — snappy,
  // not sluggish.
  setTimeout(() => {
    speak(buildAnnouncementText(hazards));
  }, toneDurationSeconds * 1000 + 150);
}

// --- Replay button ---------------------------------------------------------

replayAlertButton.addEventListener("click", () => {
  unlockAudioContext(); // real click, so safe to (re)confirm audio is unlocked
  if (latestAnnounceData) {
    announceHazards(latestAnnounceData);
  }
});

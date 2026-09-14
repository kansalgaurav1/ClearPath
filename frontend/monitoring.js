/*
 * monitoring.js
 * -------------
 * "Live Monitoring" mode: while this app is open and visible on screen,
 * automatically captures a photo from the phone's camera and runs it
 * through the same /api/analyze endpoint the manual upload uses. Results
 * show as the annotated photo plus a sound + spoken announcement (see
 * alerts.js) — no hazard text is written on screen, matching the rest of
 * the app.
 *
 * The "Check every" dropdown controls HOW checks are triggered:
 *   - A fixed number of minutes: a timer fires on that interval.
 *   - "Now (continuous)": another check starts immediately after each one
 *     finishes, back-to-back, instead of waiting on a timer.
 *   - "🎤 Voice command" (only shown if the browser supports speech
 *     recognition — see voice-command.js): NO timer at all. The camera
 *     turns on, but a check only happens when you say the trigger phrase
 *     ("Is my path clear?" / 「道は安全ですか」). This option is added to
 *     the dropdown dynamically at startup, not hardcoded in the HTML,
 *     since it must stay hidden on browsers that can't support it
 *     (iOS Safari, notably).
 *
 * IMPORTANT LIMITATION (by design, not a bug): phones stop camera AND
 * microphone access the moment this page isn't the active, visible tab —
 * locking the screen or switching apps will stop monitoring entirely.
 * There is no way around this in a browser; true unattended background
 * monitoring needs a dedicated device (like a Raspberry Pi) instead of a
 * phone browser tab.
 *
 * This file reuses renderResults(), showError(), unlockAudioContext(),
 * colorForSeverity(), t(), and the shared `originalPhotoDataUrl` variable
 * from script.js/alerts.js/i18n.js, plus isVoiceRecognitionSupported() /
 * startVoiceRecognition() / stopVoiceRecognition() from voice-command.js
 * — since all files are loaded as plain <script> tags (not modules), they
 * share one global scope.
 */

const intervalSelect = document.getElementById("interval-select");
const startMonitoringButton = document.getElementById("start-monitoring-button");
const stopMonitoringButton = document.getElementById("stop-monitoring-button");
const cameraVideo = document.getElementById("camera-video");
const captureCanvas = document.getElementById("capture-canvas");
const monitoringStatus = document.getElementById("monitoring-status");
const monitoringDot = document.getElementById("monitoring-dot");
const monitoringHistory = document.getElementById("monitoring-history");

const MAX_HISTORY_ENTRIES = 20; // keep memory usage bounded during a long monitoring session

let cameraStream = null;
let captureTimerId = null; // the setInterval that triggers each capture (fixed-interval mode only)
let countdownTimerId = null; // a separate 1-second ticker that updates the on-screen countdown
let nextCaptureAt = null; // timestamp (ms) of the next scheduled capture (fixed-interval mode only)
let currentMode = "interval"; // "interval" | "continuous" | "voice"
let isCapturing = false; // true while a capture/analysis is in flight, to avoid overlaps
let isMonitoring = false;
let historyEntries = []; // { timestamp, thumbnailUrl, data, hazardCount, maxSeverity } newest first

// --- Add the "Voice command" option to the dropdown, only if supported ----

if (isVoiceRecognitionSupported()) {
  const voiceOption = document.createElement("option");
  voiceOption.value = "voice";
  voiceOption.textContent = t("interval_voice");
  intervalSelect.appendChild(voiceOption);

  document.addEventListener("clearpath:languagechange", () => {
    voiceOption.textContent = t("interval_voice");
  });
}

// --- Starting and stopping monitoring -------------------------------------

startMonitoringButton.addEventListener("click", async () => {
  unlockAudioContext(); // real user tap — required to allow later automatic sounds

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" }, // prefer the back camera
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
  } catch (error) {
    showError(t("camera_error"));
    return;
  }

  cameraVideo.srcObject = cameraStream;
  cameraVideo.hidden = false;

  isMonitoring = true;
  if (intervalSelect.value === "now") {
    currentMode = "continuous";
  } else if (intervalSelect.value === "voice") {
    currentMode = "voice";
  } else {
    currentMode = "interval";
  }

  intervalSelect.disabled = true;
  startMonitoringButton.hidden = true;
  stopMonitoringButton.hidden = false;
  monitoringDot.hidden = false;
  monitoringStatus.hidden = false;

  if (currentMode === "voice") {
    // No timer, no immediate capture — only check when the phrase is heard.
    monitoringStatus.textContent = t("monitoring_status_voice_listening");
    startVoiceRecognition(() => captureAndAnalyze());
  } else {
    // Fixed-interval or continuous: take the first photo right away.
    captureAndAnalyze();
    if (currentMode === "interval") {
      scheduleNextCapture();
    }
  }
});

stopMonitoringButton.addEventListener("click", () => stopMonitoring());

function stopMonitoring(reasonKey) {
  if (!isMonitoring) {
    return;
  }

  isMonitoring = false;

  if (currentMode === "voice") {
    stopVoiceRecognition();
  }
  currentMode = "interval";

  if (captureTimerId) {
    clearInterval(captureTimerId);
    captureTimerId = null;
  }
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }

  // Always release the camera when stopping — leaving it on when not
  // needed wastes battery and is a real privacy concern for something
  // pointed at someone's living space.
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  cameraVideo.hidden = true;
  cameraVideo.srcObject = null;

  intervalSelect.disabled = false;
  startMonitoringButton.hidden = false;
  stopMonitoringButton.hidden = true;
  monitoringDot.hidden = true;

  monitoringStatus.textContent = t(reasonKey || "monitoring_status_stopped_default");
}

// If the app is backgrounded (screen locked, user switches apps/tabs), the
// camera AND microphone die anyway on phones — so stop cleanly instead of
// leaving stale timers/listeners running, and explain why in the status text.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isMonitoring) {
    stopMonitoring("monitoring_status_stopped_background");
  }
});

// Also release the camera if the user navigates away entirely.
window.addEventListener("beforeunload", () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
  }
});

// --- Scheduling captures (fixed-interval mode) -----------------------------

function scheduleNextCapture() {
  const intervalMinutes = Number(intervalSelect.value) || 1;
  const intervalMs = intervalMinutes * 60 * 1000;

  nextCaptureAt = Date.now() + intervalMs;

  if (captureTimerId) {
    clearInterval(captureTimerId);
  }
  captureTimerId = setInterval(() => {
    nextCaptureAt = Date.now() + intervalMs;
    captureAndAnalyze();
  }, intervalMs);

  if (countdownTimerId) {
    clearInterval(countdownTimerId);
  }
  countdownTimerId = setInterval(updateCountdownDisplay, 1000);
  updateCountdownDisplay();
}

function updateCountdownDisplay() {
  if (isCapturing) {
    monitoringStatus.textContent = t("monitoring_status_checking");
    return;
  }
  const secondsLeft = Math.max(0, Math.round((nextCaptureAt - Date.now()) / 1000));
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  monitoringStatus.textContent = t("monitoring_status_active", { time: `${minutes}:${seconds}` });
}

// --- Capturing a frame and analyzing it ------------------------------------

async function captureAndAnalyze() {
  if (isCapturing || !cameraStream) {
    return; // don't overlap requests if a previous one is still running
  }
  isCapturing = true;
  monitoringStatus.textContent = t("monitoring_status_checking");

  try {
    const dataUrl = grabFrameAsDataUrl();
    const blob = await (await fetch(dataUrl)).blob();

    const formData = new FormData();
    formData.append("photo", blob, `monitoring-capture-${Date.now()}.jpg`);
    formData.append("language", CLEARPATH_LANG);

    const response = await fetch("/api/analyze", { method: "POST", body: formData });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Analysis failed.");
    }

    // Make the manual-upload code's fallback image correct too, in case
    // the backend didn't return an annotated image for some reason.
    originalPhotoDataUrl = dataUrl;

    // Update the shared results panel, but don't yank the page around
    // with a scroll on every automatic capture (only feels right for a
    // deliberate manual check).
    renderResults(data, false);

    addHistoryEntry(dataUrl, data);
  } catch (error) {
    // Don't stop monitoring over one failed check (e.g. a dropped network
    // request) — just note it and try again.
    monitoringStatus.textContent = t("monitoring_status_failed", { error: error.message });
    console.warn("Monitoring capture failed:", error);
  } finally {
    isCapturing = false;

    if (isMonitoring && currentMode === "continuous") {
      // Continuous mode ("Now"): immediately queue the next capture instead
      // of waiting on a fixed timer.
      monitoringStatus.textContent = t("monitoring_status_continuous");
      captureAndAnalyze();
    } else if (isMonitoring && currentMode === "voice") {
      // Voice mode: go back to listening — the NEXT check only happens
      // when the trigger phrase is heard again.
      monitoringStatus.textContent = t("monitoring_status_voice_listening");
    }
  }
}

function grabFrameAsDataUrl() {
  captureCanvas.width = cameraVideo.videoWidth;
  captureCanvas.height = cameraVideo.videoHeight;
  const ctx = captureCanvas.getContext("2d");
  ctx.drawImage(cameraVideo, 0, 0, captureCanvas.width, captureCanvas.height);
  return captureCanvas.toDataURL("image/jpeg", 0.85);
}

// --- History list ------------------------------------------------------

function addHistoryEntry(thumbnailUrl, data) {
  const hazards = data.hazards_found || [];
  const maxSeverity = hazards.reduce((max, hazard) => Math.max(max, hazard.severity || 0), 0);

  const entry = {
    timestamp: new Date(),
    thumbnailUrl: data.annotated_image || thumbnailUrl,
    data,
    hazardCount: hazards.length,
    maxSeverity,
  };

  historyEntries.unshift(entry);
  if (historyEntries.length > MAX_HISTORY_ENTRIES) {
    historyEntries = historyEntries.slice(0, MAX_HISTORY_ENTRIES);
  }

  renderHistoryList();
}

function renderHistoryList() {
  monitoringHistory.innerHTML = "";

  if (historyEntries.length === 0) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "history-heading";
  heading.textContent = t("history_heading");
  monitoringHistory.appendChild(heading);

  historyEntries.forEach((entry) => {
    monitoringHistory.appendChild(buildHistoryRow(entry));
  });
}

// Re-render the history list on a language switch so already-captured
// entries show their heading/summary text in the new language too. The
// hazard names/fixes inside entry.data came from the backend already in
// whatever language was active at capture time, so those don't change —
// only the wrapper phrases ("X hazards found", "History") do.
document.addEventListener("clearpath:languagechange", renderHistoryList);

function buildHistoryRow(entry) {
  const row = document.createElement("div");
  row.className = "history-row";

  const thumbnail = document.createElement("img");
  thumbnail.className = "history-thumbnail";
  thumbnail.src = entry.thumbnailUrl;
  thumbnail.alt = "Captured photo thumbnail";

  const info = document.createElement("div");
  info.className = "history-info";

  const time = document.createElement("p");
  time.className = "history-time";
  time.textContent = entry.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const summary = document.createElement("p");
  summary.className = "history-summary";
  if (entry.hazardCount === 0) {
    summary.textContent = t("history_no_hazards");
  } else {
    summary.textContent = t("history_hazards_found", { n: entry.hazardCount });
    const severityDot = document.createElement("span");
    severityDot.className = "history-severity-dot";
    severityDot.style.backgroundColor = colorForSeverity(entry.maxSeverity);
    summary.appendChild(document.createTextNode(` · ${t("history_worst")} `));
    summary.appendChild(severityDot);
    summary.appendChild(document.createTextNode(` ${entry.maxSeverity}/5`));
  }

  info.appendChild(time);
  info.appendChild(summary);

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "history-view-button";
  viewButton.textContent = t("history_view_button");
  viewButton.addEventListener("click", () => {
    // Reviewing an old entry shows its photo and message again, but
    // doesn't replay the sound alert — it isn't a new hazard event.
    originalPhotoDataUrl = entry.thumbnailUrl;
    previewImage.src = entry.thumbnailUrl;
    imageWrapper.hidden = false;
    imageWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    displayAlertMessage(entry.data);
  });

  row.appendChild(thumbnail);
  row.appendChild(info);
  row.appendChild(viewButton);

  return row;
}

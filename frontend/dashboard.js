/*
 * dashboard.js
 * ------------
 * Polls GET /api/history for results captured by ANY device (typically:
 * a phone running Live Monitoring in another room) and displays them
 * here — the latest result as a big photo + banner, older ones in a
 * scrollable history list below.
 *
 * This is read-only: no camera, no upload, nothing is captured from this
 * page. It reuses alerts.js's displayAlertMessage() (banner only, silent)
 * and announceHazards() (banner + sound) — which one gets called depends
 * on the "Play sound for new results" checkbox.
 *
 * Polling, not push notifications: every few seconds this asks the
 * server "anything new since entry #X?" using the since_id parameter
 * (see backend/app.py's /api/history route). Simple and reliable, at
 * the cost of up to a few seconds of delay — completely fine for a
 * school project demo, not built for hundreds of simultaneous viewers.
 */

const soundToggle = document.getElementById("dashboard-sound-toggle");
const clearButton = document.getElementById("dashboard-clear-button");
const connectionStatus = document.getElementById("dashboard-connection-status");
const emptyState = document.getElementById("dashboard-empty-state");
const historyContainer = document.getElementById("monitoring-history");
const dashboardImageWrapper = document.getElementById("image-wrapper");
const dashboardPreviewImage = document.getElementById("preview-image");

const POLL_INTERVAL_MS = 4000;
const MAX_DASHBOARD_HISTORY = 30;

let lastSeenId = 0;
let isFirstLoad = true;
let hasConnectionError = false;
let historyEntries = []; // { id, timestamp, result }, newest first

// --- Sound toggle -----------------------------------------------------------

soundToggle.addEventListener("change", () => {
  if (soundToggle.checked) {
    unlockAudioContext(); // a real click/change — safe place to unlock audio
  }
});

// --- Clear history -----------------------------------------------------------

clearButton.addEventListener("click", async () => {
  if (!confirm(t("dashboard_clear_confirm"))) {
    return;
  }
  try {
    await fetch("/api/history", { method: "DELETE" });
  } catch (error) {
    console.warn("Could not clear history:", error);
  }
  historyEntries = [];
  lastSeenId = 0;
  renderHistoryList();
  resetLatestDisplay();
});

function resetLatestDisplay() {
  dashboardImageWrapper.hidden = true;
  document.getElementById("alert-message").hidden = true;
  document.getElementById("replay-alert-button").hidden = true;
  emptyState.hidden = false;
}

// --- Polling ------------------------------------------------------------------

poll();

async function poll() {
  try {
    const url = isFirstLoad ? "/api/history?limit=10" : `/api/history?since_id=${lastSeenId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }
    const data = await response.json();

    if (hasConnectionError) {
      hasConnectionError = false;
      showConnectionStatus(t("dashboard_connection_restored"), true);
    }

    if (data.entries && data.entries.length > 0) {
      handleNewEntries(data.entries, isFirstLoad);
    }

    lastSeenId = data.latest_id || lastSeenId;
    isFirstLoad = false;
  } catch (error) {
    hasConnectionError = true;
    showConnectionStatus(t("dashboard_connection_lost"), false);
    console.warn("Dashboard polling error:", error);
  } finally {
    setTimeout(poll, POLL_INTERVAL_MS);
  }
}

function showConnectionStatus(message, autoHide) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle("connected", autoHide);
  connectionStatus.hidden = false;
  if (autoHide) {
    setTimeout(() => {
      connectionStatus.hidden = true;
    }, 3000);
  }
}

// --- Handling new entries -----------------------------------------------------

function handleNewEntries(entries, isInitialLoad) {
  // Entries arrive oldest-to-newest within a batch; unshifting each one in
  // that order leaves the array newest-first overall.
  entries.forEach((entry) => historyEntries.unshift(entry));
  if (historyEntries.length > MAX_DASHBOARD_HISTORY) {
    historyEntries = historyEntries.slice(0, MAX_DASHBOARD_HISTORY);
  }

  renderHistoryList();

  const newestEntry = entries[entries.length - 1];
  displayLatest(newestEntry, isInitialLoad);
}

function displayLatest(entry, isInitialLoad) {
  emptyState.hidden = true;

  if (entry.result.annotated_image) {
    dashboardPreviewImage.src = entry.result.annotated_image;
    dashboardImageWrapper.hidden = false;
  }

  // Only play sound for entries that just arrived — not for the initial
  // batch loaded when the dashboard was first opened (those aren't "new").
  if (!isInitialLoad && soundToggle.checked) {
    announceHazards(entry.result); // banner + tone + speech
  } else {
    displayAlertMessage(entry.result); // banner only, silent
  }
}

// --- History list ------------------------------------------------------------

function renderHistoryList() {
  historyContainer.innerHTML = "";

  if (historyEntries.length === 0) {
    return;
  }

  const heading = document.createElement("h3");
  heading.className = "history-heading";
  heading.textContent = t("history_heading");
  historyContainer.appendChild(heading);

  historyEntries.forEach((entry) => {
    historyContainer.appendChild(buildHistoryRow(entry));
  });
}

document.addEventListener("clearpath:languagechange", renderHistoryList);

function buildHistoryRow(entry) {
  const hazards = entry.result.hazards_found || [];
  const maxSeverity = hazards.reduce((max, hazard) => Math.max(max, hazard.severity || 0), 0);

  const row = document.createElement("div");
  row.className = "history-row";

  const thumbnail = document.createElement("img");
  thumbnail.className = "history-thumbnail";
  if (entry.result.annotated_image) {
    thumbnail.src = entry.result.annotated_image;
  }
  thumbnail.alt = "Captured photo thumbnail";

  const info = document.createElement("div");
  info.className = "history-info";

  const time = document.createElement("p");
  time.className = "history-time";
  time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const summary = document.createElement("p");
  summary.className = "history-summary";
  if (hazards.length === 0) {
    summary.textContent = t("history_no_hazards");
  } else {
    summary.textContent = t("history_hazards_found", { n: hazards.length });
    const severityDot = document.createElement("span");
    severityDot.className = "history-severity-dot";
    severityDot.style.backgroundColor = colorForSeverity(maxSeverity);
    summary.appendChild(document.createTextNode(` · ${t("history_worst")} `));
    summary.appendChild(severityDot);
    summary.appendChild(document.createTextNode(` ${maxSeverity}/5`));
  }

  info.appendChild(time);
  info.appendChild(summary);

  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "history-view-button";
  viewButton.textContent = t("history_view_button");
  viewButton.addEventListener("click", () => {
    // Reviewing an old entry updates the "Latest Result" display silently —
    // it isn't a new event, so no sound even if the toggle is on.
    emptyState.hidden = true;
    if (entry.result.annotated_image) {
      dashboardPreviewImage.src = entry.result.annotated_image;
      dashboardImageWrapper.hidden = false;
    }
    displayAlertMessage(entry.result);
    dashboardImageWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  row.appendChild(thumbnail);
  row.appendChild(info);
  row.appendChild(viewButton);

  return row;
}

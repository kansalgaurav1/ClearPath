/*
 * script.js
 * ---------
 * Core browser-side logic for ClearPath:
 *   1. Lets the user pick a photo (via the phone's camera OR their photo
 *      gallery — two separate buttons, see the note below) and previews it.
 *   2. Sends the photo to the Flask backend (POST /api/analyze).
 *   3. Displays the annotated photo that comes back — no text results are
 *      rendered on screen; hazards are announced with sound + speech
 *      instead (see alerts.js), and are already baked into the photo
 *      itself as colored boxes + labels (drawn server-side).
 *
 * Why two separate file inputs instead of one: a single <input type=file>
 * lets Android show a chooser with a Camera option, but only when the
 * page believes it can grant camera access — many real-world setups
 * (plain http:// on a local network, some Android/Chrome versions) skip
 * straight to the gallery picker instead, with no way to take a fresh
 * photo. Adding capture="environment" to a SEPARATE input forces that one
 * specific button to always launch the camera app directly (this uses the
 * OS's native camera intent, not the in-page getUserMedia API, so it
 * works even without HTTPS) — the other input stays a plain gallery
 * picker. Two clearly labeled buttons beats one that might not do what
 * it says.
 *
 * No API keys or Claude-specific code live here — the browser only ever
 * talks to our own Flask server, which is what actually calls Claude.
 */

const photoInputCamera = document.getElementById("photo-input-camera");
const photoInputGallery = document.getElementById("photo-input-gallery");
const uploadHint = document.getElementById("upload-hint");
const imageWrapper = document.getElementById("image-wrapper");
const previewImage = document.getElementById("preview-image");
const analyzeButton = document.getElementById("analyze-button");

const statusSection = document.getElementById("status-section");
const statusText = document.getElementById("status-text");

const errorSection = document.getElementById("error-section");
const errorText = document.getElementById("error-text");

let selectedFile = null;
let originalPhotoDataUrl = ""; // the raw uploaded/captured photo, before annotation

// --- Step 1: handle the user picking a photo (from either button) --------

photoInputCamera.addEventListener("change", () => handlePhotoSelected(photoInputCamera.files[0]));
photoInputGallery.addEventListener("change", () => handlePhotoSelected(photoInputGallery.files[0]));

function handlePhotoSelected(file) {
  if (!file) {
    return;
  }

  selectedFile = file;
  uploadHint.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (event) => {
    originalPhotoDataUrl = event.target.result;
    previewImage.src = originalPhotoDataUrl;
    imageWrapper.hidden = false;
  };
  reader.readAsDataURL(file);

  analyzeButton.disabled = false;
  errorSection.hidden = true;
}

// --- Step 2: send the photo to the backend ----------------------------

analyzeButton.addEventListener("click", async () => {
  if (!selectedFile) {
    return;
  }

  // Unlock audio/speech here, inside a direct user click — mobile browsers
  // require sound to be triggered by a real user gesture at least once
  // per page load (see alerts.js for why this matters).
  unlockAudioContext();

  setLoading(true);
  errorSection.hidden = true;

  const formData = new FormData();
  formData.append("photo", selectedFile);
  formData.append("language", CLEARPATH_LANG);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong. Please try again.");
    }

    renderResults(data);
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
});

// --- Step 3: display the result photo + trigger the audio alert ---------

function renderResults(data, shouldScroll = true) {
  // The backend draws the hazard boxes + labels directly onto the photo
  // and sends it back as "annotated_image" (a data: URL). If that came
  // through, show it in place of the plain uploaded photo. If it didn't
  // (e.g. annotation failed server-side), fall back to the original photo.
  if (data.annotated_image) {
    previewImage.src = data.annotated_image;
  } else {
    previewImage.src = originalPhotoDataUrl;
  }

  imageWrapper.hidden = false;
  if (shouldScroll) {
    imageWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Sound + spoken announcement instead of any on-screen text — see alerts.js.
  announceHazards(data);
}

// --- Helpers -------------------------------------------------------------

function setLoading(isLoading) {
  statusSection.hidden = !isLoading;
  analyzeButton.disabled = isLoading;
  statusText.textContent = t("status_text");
}

function showError(message) {
  errorText.textContent = message;
  errorSection.hidden = false;
}

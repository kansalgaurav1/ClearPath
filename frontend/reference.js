/*
 * reference.js
 * ------------
 * Manages the optional "reference photo" — a picture of the space when
 * it's clear of hazards, saved on the backend and automatically included
 * in every future analysis so Claude can compare and focus on what's
 * new or changed. See backend/app.py's /api/reference routes and
 * vlm_service.py's analyze_room_photo() for the other half of this.
 *
 * Two file inputs feed into the same upload handler — one forces the
 * camera app directly (capture="environment"), one opens the gallery
 * picker. See script.js's header comment for why this is two buttons
 * instead of one.
 */

const referencePreviewWrapper = document.getElementById("reference-preview-wrapper");
const referencePreviewImage = document.getElementById("reference-preview-image");
const removeReferenceButton = document.getElementById("remove-reference-button");
const referenceInputCamera = document.getElementById("reference-input-camera");
const referenceInputGallery = document.getElementById("reference-input-gallery");
const referenceStatus = document.getElementById("reference-status");

// --- Load whatever reference photo is already saved, on page load --------

loadReferenceStatus(); // script runs at the bottom of <body>, DOM already exists

async function loadReferenceStatus() {
  try {
    const response = await fetch("/api/reference");
    const data = await response.json();
    updateReferenceUI(data.has_reference, data.image);
  } catch (error) {
    console.warn("Could not load reference photo status:", error);
  }
}

function updateReferenceUI(hasReference, imageDataUrl) {
  if (hasReference && imageDataUrl) {
    referencePreviewImage.src = imageDataUrl;
    referencePreviewWrapper.hidden = false;
  } else {
    referencePreviewWrapper.hidden = true;
  }
}

// --- Uploading a new reference photo (from either button) -------------------

referenceInputCamera.addEventListener("change", () => uploadReferencePhoto(referenceInputCamera));
referenceInputGallery.addEventListener("change", () => uploadReferencePhoto(referenceInputGallery));

async function uploadReferencePhoto(inputEl) {
  const file = inputEl.files[0];
  if (!file) {
    return;
  }

  showReferenceStatus(t("reference_status_saving"));

  const formData = new FormData();
  formData.append("photo", file);

  try {
    const response = await fetch("/api/reference", { method: "POST", body: formData });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Couldn't save the reference photo.");
    }

    await loadReferenceStatus();
    showReferenceStatus(t("reference_status_saved"));
  } catch (error) {
    showReferenceStatus(`⚠️ ${error.message}`);
  } finally {
    inputEl.value = ""; // allow selecting the same file again later
  }
}

// --- Removing the saved reference photo -------------------------------------

removeReferenceButton.addEventListener("click", async () => {
  try {
    await fetch("/api/reference", { method: "DELETE" });
    updateReferenceUI(false);
    showReferenceStatus(t("reference_status_removed"));
  } catch (error) {
    showReferenceStatus(t("reference_status_remove_error"));
  }
});

// --- Helper ------------------------------------------------------------------

function showReferenceStatus(message) {
  referenceStatus.textContent = message;
  referenceStatus.hidden = false;
}

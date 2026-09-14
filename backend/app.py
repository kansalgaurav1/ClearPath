"""
app.py
------
The Flask web server. This is the file you actually run:

    python backend/app.py

It does two jobs:
1. Serves the frontend (the HTML/CSS/JS files in ../frontend).
2. Provides one API endpoint, POST /api/analyze, that the frontend's
   JavaScript calls when you upload a photo.

This file deliberately does NOT contain any Claude-API-specific code —
that all lives in vlm_service.py. app.py just wires the pieces together.
"""

import base64
import os
import sys
import threading
from datetime import datetime, timezone

from flask import Flask, jsonify, request, send_from_directory

# Allow "import config" / "import vlm_service" to work when running this
# file directly (python backend/app.py) regardless of the current folder.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import ANTHROPIC_API_KEY, MAX_UPLOAD_MB  # noqa: E402
from vlm_service import analyze_room_photo  # noqa: E402
from hazard_checklist import CATEGORY_LABELS, SUPPORTED_LANGUAGES  # noqa: E402
from image_annotator import annotate_hazards  # noqa: E402
from image_utils import normalize_orientation  # noqa: E402

FRONTEND_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

# Where the optional "clear room" reference photo is stored. It's just one
# file, overwritten each time a new reference is uploaded — ClearPath only
# supports one reference photo at a time (keeps this simple for a single
# room/hallway being monitored).
REFERENCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reference_photo")
REFERENCE_PATH = os.path.join(REFERENCE_DIR, "reference.jpg")
os.makedirs(REFERENCE_DIR, exist_ok=True)

app = Flask(__name__, static_folder=FRONTEND_FOLDER, static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024  # bytes

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# A shared history of every analysis result, so a SEPARATE device (like a
# laptop dashboard) can see what a phone captured during Live Monitoring.
# Deliberately simple: kept in memory only (resets when the server
# restarts — fine for a live demo, not meant as a permanent log), capped
# in size so a long monitoring session doesn't grow unbounded, and
# protected by a lock since Flask can handle more than one request at once.
_history = []
_history_lock = threading.Lock()
_next_history_id = 1
MAX_HISTORY_ITEMS = 50


def _add_to_history(result: dict) -> None:
    global _next_history_id
    with _history_lock:
        entry = {
            "id": _next_history_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "result": result,
        }
        _next_history_id += 1
        _history.append(entry)
        if len(_history) > MAX_HISTORY_ITEMS:
            _history.pop(0)


def _has_allowed_extension(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXTENSIONS


def _sanitize_bounding_box(box):
    """
    Claude's bounding box estimates are approximate by nature. This makes
    sure whatever comes back is safe to draw in the browser: four numbers,
    each clamped to 0-100, with x_min < x_max and y_min < y_max. Returns
    None if the box is missing or unusable, so the frontend just skips
    drawing a rectangle for that hazard instead of erroring out.
    """
    if not isinstance(box, dict):
        return None

    try:
        x_min = float(box.get("x_min"))
        y_min = float(box.get("y_min"))
        x_max = float(box.get("x_max"))
        y_max = float(box.get("y_max"))
    except (TypeError, ValueError):
        return None

    # Clamp every value into the valid 0-100 percentage range.
    x_min = max(0, min(100, x_min))
    y_min = max(0, min(100, y_min))
    x_max = max(0, min(100, x_max))
    y_max = max(0, min(100, y_max))

    # A degenerate box (zero or negative width/height) isn't useful to draw.
    if x_max <= x_min or y_max <= y_min:
        return None

    return {"x_min": x_min, "y_min": y_min, "x_max": x_max, "y_max": y_max}


def _sanitize_severity(value) -> int:
    """
    Severity is meant to be a whole number 1-5. This defends against Claude
    occasionally returning something else (a string, a float, a number
    out of range) by clamping to the valid range, defaulting to a middle
    value of 3 if the value is unusable.
    """
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        return 3
    return max(1, min(5, score))


def _sanitize_fix_short(text, language="en") -> str:
    """
    Enforces the short-fix length rule in code too, not just in the prompt,
    since the label printed on the photo has very little room. English is
    truncated by word count; Japanese doesn't use spaces between words, so
    it's truncated by character count instead.
    """
    text = str(text or "")
    if language == "ja":
        return text[:8]
    return " ".join(text.split()[:3])


def _sanitize_language(value) -> str:
    """Falls back to English for anything unrecognized."""
    if value in SUPPORTED_LANGUAGES:
        return value
    return "en"


@app.route("/")
def serve_index():
    """Serves frontend/index.html when you visit http://127.0.0.1:5000/"""
    return send_from_directory(FRONTEND_FOLDER, "index.html")


@app.route("/api/reference", methods=["GET"])
def get_reference():
    """Tells the frontend whether a reference photo is currently saved, and
    returns it (as a data URL) so the page can show a thumbnail of it."""
    if not os.path.exists(REFERENCE_PATH):
        return jsonify({"has_reference": False})

    with open(REFERENCE_PATH, "rb") as f:
        image_bytes = f.read()

    return jsonify({
        "has_reference": True,
        "image": "data:image/jpeg;base64," + base64.b64encode(image_bytes).decode("utf-8"),
    })


@app.route("/api/reference", methods=["POST"])
def upload_reference():
    """Saves (or replaces) the reference "clear room" photo."""
    if "photo" not in request.files:
        return jsonify({"error": "No photo was uploaded."}), 400

    photo = request.files["photo"]

    if photo.filename == "" or not _has_allowed_extension(photo.filename):
        return jsonify({"error": "Please upload a JPG, PNG, WEBP, or GIF image."}), 400

    image_bytes = photo.read()
    if len(image_bytes) == 0:
        return jsonify({"error": "The uploaded file appears to be empty."}), 400

    try:
        # normalize_orientation both fixes sideways/upside-down phone photos
        # (see image_utils.py) and converts to a consistent JPEG format.
        fixed_bytes = normalize_orientation(image_bytes)
        with open(REFERENCE_PATH, "wb") as f:
            f.write(fixed_bytes)
    except Exception as error:  # noqa: BLE001
        return jsonify({"error": f"Couldn't save that image: {error}"}), 400

    return jsonify({"success": True})


@app.route("/api/reference", methods=["DELETE"])
def delete_reference():
    """Removes the saved reference photo, if there is one."""
    if os.path.exists(REFERENCE_PATH):
        os.remove(REFERENCE_PATH)
    return jsonify({"success": True})


@app.route("/api/languages", methods=["GET"])
def get_languages():
    """Tells the frontend which languages are supported, so the list only
    has to be maintained in one place (hazard_checklist.py)."""
    return jsonify({"languages": SUPPORTED_LANGUAGES, "default": "en"})


@app.route("/api/history", methods=["GET"])
def get_history():
    """
    Returns shared analysis history so a separate device (e.g. a laptop
    dashboard) can see results from a phone's Live Monitoring session.

    Two ways to call it:
      - GET /api/history              -> the most recent `limit` entries
        (default 10), for a dashboard's first load.
      - GET /api/history?since_id=42  -> only entries newer than id 42,
        for efficient polling afterward (empty list if nothing new yet).
    """
    since_id = request.args.get("since_id", type=int, default=0)
    limit = request.args.get("limit", type=int, default=10)

    with _history_lock:
        if since_id:
            entries = [e for e in _history if e["id"] > since_id]
        else:
            entries = _history[-limit:]
        latest_id = _history[-1]["id"] if _history else 0

    return jsonify({"entries": entries, "latest_id": latest_id})


@app.route("/api/history", methods=["DELETE"])
def clear_history():
    """Clears the shared history (used by the dashboard's "Clear History" button)."""
    with _history_lock:
        _history.clear()
    return jsonify({"success": True})


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """
    Expects a multipart/form-data POST with one file field named "photo".
    Returns JSON: { hazards_found: [...], overall_summary: "..." }
    or, on error: { error: "..." } with an appropriate HTTP status code.
    """
    if "photo" not in request.files:
        return jsonify({"error": "No photo was uploaded."}), 400

    photo = request.files["photo"]

    if photo.filename == "":
        return jsonify({"error": "The uploaded file has no name."}), 400

    if not _has_allowed_extension(photo.filename):
        return jsonify(
            {"error": "Please upload a JPG, PNG, WEBP, or GIF image."}
        ), 400

    image_bytes = photo.read()

    if len(image_bytes) == 0:
        return jsonify({"error": "The uploaded file appears to be empty."}), 400

    # Fixes sideways/upside-down phone photos (see image_utils.py) before
    # this image goes anywhere — to Claude, into the reference comparison,
    # or onto the annotated photo.
    try:
        image_bytes = normalize_orientation(image_bytes)
    except Exception as error:  # noqa: BLE001 - if this fails, just use the original bytes
        print(f"Warning: could not normalize photo orientation: {error}")

    language = _sanitize_language(request.form.get("language"))

    # If a reference "clear room" photo has been saved, include it so Claude
    # can compare and focus on what's new or changed.
    reference_bytes = None
    if os.path.exists(REFERENCE_PATH):
        with open(REFERENCE_PATH, "rb") as f:
            reference_bytes = f.read()

    try:
        result = analyze_room_photo(
            image_bytes, photo.filename, reference_bytes, "reference.jpg", language
        )
    except RuntimeError as error:
        # This happens if Claude's reply wasn't valid JSON (rare).
        return jsonify({"error": str(error)}), 502
    except Exception as error:  # noqa: BLE001 - we want to surface any API error to the UI
        return jsonify({"error": f"Something went wrong calling Claude: {error}"}), 500

    # Attach human-friendly labels, a display number, and cleaned-up
    # severity/fix/bounding-box values to each hazard, so nothing
    # downstream (image drawing or the frontend) has to re-validate them.
    labels_for_language = CATEGORY_LABELS.get(language, CATEGORY_LABELS["en"])
    hazards = result.get("hazards_found", [])
    for index, hazard in enumerate(hazards, start=1):
        category_key = hazard.get("category", "")
        hazard["label"] = labels_for_language.get(category_key, category_key.replace("_", " ").title())
        hazard["number"] = index
        hazard["severity"] = _sanitize_severity(hazard.get("severity"))
        hazard["fix_short"] = _sanitize_fix_short(hazard.get("fix_short"), language)
        hazard["bounding_box"] = _sanitize_bounding_box(hazard.get("bounding_box"))

    # Draw the boxes + labels directly onto the photo and send that image
    # back to the browser. If drawing fails for any reason (corrupt image,
    # missing font, etc.) we still return the hazard data — the frontend
    # just won't have an annotated photo to show, only the text list.
    try:
        annotated_bytes = annotate_hazards(image_bytes, hazards, language)
        result["annotated_image"] = (
            "data:image/png;base64," + base64.b64encode(annotated_bytes).decode("utf-8")
        )
    except Exception as error:  # noqa: BLE001 - annotation is a nice-to-have, never fatal
        print(f"Warning: could not annotate image: {error}")
        result["annotated_image"] = None

    _add_to_history(result)

    return jsonify(result)


if __name__ == "__main__":
    if not ANTHROPIC_API_KEY:
        print(
            "\n⚠️  ANTHROPIC_API_KEY is not set.\n"
            "   1. Copy .env.example to .env in the ClearPath folder.\n"
            "   2. Paste your Anthropic API key into it.\n"
            "   3. Run this again.\n"
        )
        sys.exit(1)

    print("ClearPath is starting...")
    print("Open http://127.0.0.1:5000 in your browser.\n")
    app.run(debug=True, port=5000)

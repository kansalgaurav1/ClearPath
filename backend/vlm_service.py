"""
vlm_service.py
---------------
This is the ONLY file that talks to the Claude API. Everything else
(app.py) just calls the function below and gets back plain Python data.

Keeping the API call isolated here makes it easy to test, debug, or swap
out later without touching the web server code.
"""

import base64
import json

import anthropic

from config import ANTHROPIC_API_KEY, CLAUDE_MODEL
from hazard_checklist import build_system_prompt, build_user_prompt, DEFAULT_LANGUAGE

# Create one client and reuse it for every request (this is the recommended
# pattern with the Anthropic SDK — don't recreate it per-request).
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _guess_media_type(filename: str) -> str:
    """
    Claude's vision API needs to know the image format. This looks at the
    file extension to figure out the correct media type string.
    """
    lower = filename.lower()
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    # Default to JPEG, which covers .jpg and .jpeg (the most common case
    # for phone camera photos).
    return "image/jpeg"


def _image_block(image_bytes: bytes, filename: str) -> dict:
    """Builds one Claude API image content block from raw image bytes."""
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": _guess_media_type(filename),
            "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
        },
    }


def analyze_room_photo(
    image_bytes: bytes,
    filename: str,
    reference_bytes: bytes = None,
    reference_filename: str = None,
    language: str = DEFAULT_LANGUAGE,
) -> dict:
    """
    Sends a room photo to Claude Sonnet 5 and returns the parsed hazard
    analysis as a Python dictionary. If a reference "clear" photo of the
    same space is provided, it's sent first so Claude can compare the two
    and focus on what's new or changed.

    Parameters
    ----------
    image_bytes         : the raw bytes of the current photo to check
    filename             : current photo's original filename (for format detection)
    reference_bytes      : optional — raw bytes of a "clear" reference photo
    reference_filename   : optional — reference photo's original filename
    language             : "en" or "ja" — the language Claude should respond in

    Returns
    -------
    A dict shaped like:
        {
          "hazards_found": [ {...}, {...} ],
          "overall_summary": "..."
        }

    Raises
    ------
    RuntimeError if Claude's reply wasn't valid JSON (rare, but the caller
    should handle this gracefully rather than crashing the whole server).
    """
    has_reference = reference_bytes is not None

    content = []

    if has_reference:
        content.append({
            "type": "text",
            "text": "Reference photo (this space when clear of hazards):",
        })
        content.append(_image_block(reference_bytes, reference_filename or "reference.jpg"))
        content.append({"type": "text", "text": "Current photo to check:"})

    content.append(_image_block(image_bytes, filename))
    content.append({"type": "text", "text": build_user_prompt(has_reference, language)})

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=build_system_prompt(language),
        messages=[{"role": "user", "content": content}],
    )

    # response.content is a list of content blocks; for a plain-text JSON
    # reply there will just be one "text" block. We join in case there's
    # more than one, just to be safe.
    raw_text = "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()

    # Claude was instructed to return ONLY JSON, but models occasionally
    # wrap it in ```json fences anyway — strip those defensively.
    if raw_text.startswith("```"):
        raw_text = raw_text.strip("`")
        if raw_text.lower().startswith("json"):
            raw_text = raw_text[4:].strip()

    try:
        result = json.loads(raw_text)
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"Claude's response wasn't valid JSON. Raw response was:\n{raw_text}"
        ) from error

    return result

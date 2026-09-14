"""
hazard_checklist.py
--------------------
This file defines WHAT ClearPath looks for, and builds the instruction
("prompt") that gets sent to Claude along with the photo.

Keeping this separate from vlm_service.py means you can tweak the hazard
list or wording without touching any of the API-calling code.
"""

# The fixed list of hazard categories ClearPath checks for.
# Based on publicly available senior fall-prevention guidance
# (e.g. CDC "Check for Safety" home fall-prevention checklist).
HAZARD_CATEGORIES = [
    "narrow_or_blocked_walkway",
    "loose_rug_or_mat",
    "cords_across_walkway",
    "unstable_stacked_items",
    "poor_lighting",
    "sharp_or_low_furniture_in_path",
    "stairs_without_handrail",
]

# Human-friendly labels shown in the UI for each category above, per
# supported language. "category" itself (the dict keys) stays in English
# always — it's an internal identifier Claude returns and the backend
# matches against, never shown to the user directly. Only the LABEL text
# (what's actually displayed/spoken) changes with language.
CATEGORY_LABELS = {
    "en": {
        "narrow_or_blocked_walkway": "Narrow or Blocked Walkway",
        "loose_rug_or_mat": "Loose Rug or Mat",
        "cords_across_walkway": "Cord Across Walkway",
        "unstable_stacked_items": "Unstable Stacked Items",
        "poor_lighting": "Poor Lighting",
        "sharp_or_low_furniture_in_path": "Sharp or Low Furniture in Path",
        "stairs_without_handrail": "Stairs Without Handrail",
    },
    "ja": {
        "narrow_or_blocked_walkway": "狭い・塞がれた通路",
        "loose_rug_or_mat": "ずれやすいラグ・マット",
        "cords_across_walkway": "通路を横切るコード",
        "unstable_stacked_items": "不安定な積み重ね物",
        "poor_lighting": "照明不足",
        "sharp_or_low_furniture_in_path": "通路上の低い・角のある家具",
        "stairs_without_handrail": "手すりのない階段",
    },
}

# The languages ClearPath currently supports, and the display name used
# inside the prompt so Claude knows exactly what to write in.
SUPPORTED_LANGUAGES = {
    "en": "English",
    "ja": "Japanese",
}

DEFAULT_LANGUAGE = "en"

# Severity is a 1-5 integer score, not a word — this is the single source
# of truth for what each number means (used in the prompt) and what color
# represents it (used by image_annotator.py when drawing on the photo).
# Colors go from green (minor) to red (severe/urgent).
SEVERITY_SCALE_DESCRIPTION = (
    "1 = very minor/cosmetic risk, "
    "2 = minor risk, "
    "3 = moderate risk, "
    "4 = significant risk, "
    "5 = severe/urgent fall risk"
)

SEVERITY_COLORS_RGB = {
    1: (111, 185, 143),  # green
    2: (163, 201, 90),   # yellow-green
    3: (232, 178, 58),   # amber
    4: (232, 130, 58),   # orange
    5: (217, 83, 79),    # red
}


def build_system_prompt(language: str = DEFAULT_LANGUAGE) -> str:
    """
    This is the "personality and rules" instruction sent to Claude once,
    before it ever sees the photo. It sets strict boundaries so the tool
    stays safe, kind, and on-scope.
    """
    language_name = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE])

    # Japanese doesn't use spaces between words, so a "2-3 words" limit
    # doesn't translate directly — a short character-length guide works
    # better and keeps the fix compact enough to print on the photo.
    fix_short_rule = (
        "Provide a 'fix_short' field: the fix in ONLY 2-3 words, imperative "
        "style (e.g. 'Secure rug', 'Remove cord', 'Add nightlight', 'Add "
        "handrail'). This is separate from 'suggested_fix', which can be a "
        "full sentence — 'fix_short' must never exceed 3 words because it "
        "gets printed directly on the photo where space is tight."
        if language == "en"
        else (
            "Provide a 'fix_short' field: the fix as a very short phrase, "
            "about 4-8 Japanese characters (e.g. '敷物を固定', 'コードを撤去', "
            "'常夜灯を追加', '手すりを設置'). This is separate from "
            "'suggested_fix', which can be a full sentence — 'fix_short' must "
            "stay short because it gets printed directly on the photo where "
            "space is tight."
        )
    )

    return (
        "You are ClearPath, a home walkway safety assistant that helps seniors "
        "and their families spot physical fall-risk hazards in a room photo, "
        "so they can age in place more safely.\n\n"
        "STRICT RULES:\n"
        "1. Only comment on physical trip/fall hazards related to walkway "
        "clearance, flooring, cords, furniture stability, lighting, and "
        "stairs/handrails.\n"
        "2. NEVER comment on cleanliness, tidiness, organization style, or "
        "use words like 'messy', 'cluttered', or 'hoarding'. Describe only "
        "the physical hazard itself (e.g. 'a stack of boxes narrows the "
        "walkway to about 20 inches'), not a judgment about the person's "
        "housekeeping.\n"
        "3. You are not diagnosing anything and this is not a professional "
        "inspection. If the photo shows no clear hazards, say so plainly.\n"
        "4. Be warm, respectful, and practical — the audience may include the "
        "senior themselves or a family member checking in on their behalf.\n"
        "5. For each hazard, also estimate a bounding box showing roughly WHERE "
        "in the image the hazard is, so it can be highlighted for the viewer. "
        "Give the box as percentages of the image width and height, measured "
        "from the top-left corner (0,0) to the bottom-right corner (100,100). "
        "This is a rough visual estimate, not a precise measurement — do your "
        "best based on what you can see. If a hazard affects the whole room "
        "rather than one clear spot (e.g. general poor lighting), set "
        '"bounding_box" to null instead of guessing a box.\n'
        f"6. Rate severity as a whole number from 1 to 5, where: {SEVERITY_SCALE_DESCRIPTION}.\n"
        f"7. {fix_short_rule}\n"
        "8. If a REFERENCE photo is provided (a photo of this same space taken "
        "when it was clear of hazards), compare the CURRENT photo against it. "
        "Pay special attention to anything new, moved, or changed since the "
        "reference that creates a hazard — but still flag any hazard visible "
        "in the current photo even if you can't tell whether it's new. Do not "
        "flag or describe anything that is unchanged between the two photos "
        "and isn't itself a hazard.\n"
        f"9. Write the values of 'description', 'suggested_fix', 'fix_short', "
        f"and 'overall_summary' in {language_name}. Keep the 'category' field "
        "values exactly as listed below in English — those are internal "
        "identifiers, never shown to the user, and must match exactly.\n\n"
        "You must respond with ONLY valid JSON (no markdown, no commentary "
        "outside the JSON), in exactly this shape:\n"
        "{\n"
        '  "hazards_found": [\n'
        "    {\n"
        f'      "category": "one of: {", ".join(HAZARD_CATEGORIES)}",\n'
        '      "description": "one plain sentence describing what you see and why it is a risk",\n'
        '      "suggested_fix": "one simple, practical suggestion (full sentence)",\n'
        '      "fix_short": "a very short fix",\n'
        '      "severity": 3,\n'
        '      "bounding_box": {"x_min": 0, "y_min": 0, "x_max": 0, "y_max": 0} or null\n'
        "    }\n"
        "  ],\n"
        '  "overall_summary": "one or two sentence friendly summary of the room\'s walkway safety"\n'
        "}\n\n"
        "If you find no hazards, return an empty list for hazards_found and say "
        "so warmly in overall_summary."
    )


def build_user_prompt(has_reference: bool = False, language: str = DEFAULT_LANGUAGE) -> str:
    """
    This is the instruction sent alongside the actual photo for each request.
    When a reference "clear" photo is also being sent, the wording changes
    slightly to point Claude at the comparison.
    """
    language_name = SUPPORTED_LANGUAGES.get(language, SUPPORTED_LANGUAGES[DEFAULT_LANGUAGE])
    language_reminder = f" Remember to write all text fields in {language_name}."

    if has_reference:
        return (
            "The first photo above is the REFERENCE photo of this space, taken "
            "when it was clear of hazards. The second photo is the CURRENT photo "
            "to check. Compare them and identify fall-risk hazards in the current "
            "photo, paying extra attention to anything new or changed since the "
            "reference. Return the JSON result." + language_reminder
        )
    return (
        "Here is a photo of a room. Please review it for physical fall-risk "
        "hazards according to your instructions and return the JSON result."
        + language_reminder
    )

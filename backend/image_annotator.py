"""
image_annotator.py
--------------------
Takes the original room photo plus the hazard list (with bounding boxes,
already validated by app.py) and draws directly onto the image using
Pillow:

  1. A colored rectangle around each hazard (color = severity 1-5).
  2. A small numbered circle badge in the box's corner, matching the
     hazard's number in the results list.
  3. Two small stacked label boxes just below the hazard box:
       - the hazard's name
       - a short (2-3 word) fix, directly underneath the name

This is the ONLY file that touches image pixels — nothing else in the
project needs to know how the drawing works.
"""

import io

from PIL import Image, ImageDraw, ImageFont

from hazard_checklist import SEVERITY_COLORS_RGB

WHITE = (255, 255, 255)
FIX_BOX_BACKGROUND = (55, 55, 55)  # neutral dark gray for the fix label box


def _color_for_severity(severity: int):
    return SEVERITY_COLORS_RGB.get(severity, SEVERITY_COLORS_RGB[3])


# Regular Latin fonts (Arial, DejaVu) don't include Japanese glyphs — text
# drawn with them would come out as blank boxes ("tofu"). These candidate
# lists are checked in order; Windows ships Meiryo/Yu Gothic/MS Gothic by
# default (that's ClearPath's actual deployment target), with Mac/Linux
# CJK fonts as a fallback for development on other machines.
_LATIN_FONT_CANDIDATES = [
    "arialbd.ttf",
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

_JAPANESE_FONT_CANDIDATES = [
    "C:\\Windows\\Fonts\\YuGothB.ttc",
    "C:\\Windows\\Fonts\\meiryob.ttc",
    "C:\\Windows\\Fonts\\meiryo.ttc",
    "C:\\Windows\\Fonts\\msgothic.ttc",
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]


def _load_font(size: int, language: str = "en"):
    """
    Tries a handful of common font locations across Windows/Mac/Linux and
    falls back to Pillow's built-in font if none are found, so annotation
    never crashes just because a specific font file isn't installed. Uses
    a CJK-capable font list when drawing Japanese text.
    """
    candidates = _JAPANESE_FONT_CANDIDATES if language == "ja" else _LATIN_FONT_CANDIDATES
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue

    if language == "ja":
        print(
            "Warning: no Japanese-capable font found on this system — "
            "Japanese text on the annotated photo may not display correctly. "
            "Windows should have Meiryo or MS Gothic installed by default."
        )

    return ImageFont.load_default()


def _truncate_fix_text(text: str, language: str) -> str:
    """
    Keeps the on-photo fix label short enough to fit. English is truncated
    by word count; Japanese doesn't use spaces between words, so it's
    truncated by character count instead.
    """
    text = text or ""
    if language == "ja":
        return text[:8]
    words = text.split()
    return " ".join(words[:3])


def _text_size(draw: ImageDraw.ImageDraw, text: str, font) -> tuple:
    if not text:
        return (0, 0)
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    return (right - left, bottom - top)


def annotate_hazards(image_bytes: bytes, hazards: list, language: str = "en") -> bytes:
    """
    Draws hazard boxes + labels onto the photo and returns the result as
    PNG bytes. Hazards with no bounding box are skipped (nothing drawn).
    Never raises for "normal" issues — a hazard with a bad/missing font
    or an edge-of-frame box just gets drawn as best as possible.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    draw = ImageDraw.Draw(image)
    width, height = image.size

    # Scale line thickness / font size relative to image size, so a huge
    # phone photo and a small test image both look proportionate.
    scale = max(1.0, width / 900)
    name_font = _load_font(int(15 * scale), language)
    fix_font = _load_font(int(13 * scale), language)
    badge_font = _load_font(int(13 * scale), language)
    box_line_width = max(2, int(3 * scale))
    padding = int(6 * scale)
    gap_between_boxes = int(3 * scale)

    for hazard in hazards:
        box = hazard.get("bounding_box")
        if not box:
            continue

        severity = hazard.get("severity", 3)
        color = _color_for_severity(severity)

        x_min = (box["x_min"] / 100) * width
        y_min = (box["y_min"] / 100) * height
        x_max = (box["x_max"] / 100) * width
        y_max = (box["y_max"] / 100) * height

        # 1. The hazard bounding box itself.
        draw.rectangle([x_min, y_min, x_max, y_max], outline=color, width=box_line_width)

        # 2. A small numbered circle badge in the box's top-left corner.
        badge_radius = int(11 * scale)
        badge_cx = x_min + badge_radius + 3
        badge_cy = y_min + badge_radius + 3
        draw.ellipse(
            [
                badge_cx - badge_radius, badge_cy - badge_radius,
                badge_cx + badge_radius, badge_cy + badge_radius,
            ],
            fill=color,
        )
        number_text = str(hazard.get("number", ""))
        num_w, num_h = _text_size(draw, number_text, badge_font)
        draw.text(
            (badge_cx - num_w / 2, badge_cy - num_h / 2 - 1),
            number_text, fill=WHITE, font=badge_font,
        )

        # 3. Two small stacked label boxes: hazard name, then fix (2-3 words).
        name_text = hazard.get("label", "Hazard")
        fix_text = _truncate_fix_text(hazard.get("fix_short", ""), language)

        name_w, name_h = _text_size(draw, name_text, name_font)
        fix_w, fix_h = _text_size(draw, fix_text, fix_font)

        label_width = max(name_w, fix_w) + padding * 2
        name_box_height = name_h + padding * 1.6
        fix_box_height = (fix_h + padding * 1.6) if fix_text else 0
        total_height = name_box_height + (gap_between_boxes + fix_box_height if fix_text else 0)

        label_x = x_min
        if label_x + label_width > width:
            label_x = max(0, width - label_width)  # keep label on-screen

        # Prefer placing labels below the box; fall back to above if there
        # isn't room below (e.g. hazard near the bottom of the photo).
        if y_max + total_height + 4 <= height:
            label_y = y_max + 4
        elif y_min - total_height - 4 >= 0:
            label_y = y_min - total_height - 4
        else:
            label_y = min(y_max + 4, max(0, height - total_height))

        # -- Name box --
        draw.rectangle(
            [label_x, label_y, label_x + label_width, label_y + name_box_height],
            fill=color,
        )
        draw.text((label_x + padding, label_y + padding * 0.3), name_text, fill=WHITE, font=name_font)

        # -- Fix box (directly below the name box) --
        if fix_text:
            fix_top = label_y + name_box_height + gap_between_boxes
            draw.rectangle(
                [label_x, fix_top, label_x + label_width, fix_top + fix_box_height],
                fill=FIX_BOX_BACKGROUND,
            )
            draw.text((label_x + padding, fix_top + padding * 0.3), fix_text, fill=WHITE, font=fix_font)

    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()

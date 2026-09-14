"""
generate_icons.py
------------------
A one-time helper script that draws ClearPath's app icon (a simple house
silhouette with a small red alert dot) at the sizes needed for a phone's
home screen. You don't need to run this again unless you want to change
the icon design — the generated PNGs are already committed in this folder.

Run it with:  python generate_icons.py
"""

from PIL import Image, ImageDraw

TEAL = (47, 111, 94, 255)      # matches the site's header color (#2f6f5e)
WHITE = (255, 255, 255, 255)
ALERT_RED = (217, 83, 79, 255)  # matches the "high severity" color used elsewhere


def _draw_house(draw, size, body_color, roof_and_dot=True):
    """Draws the house + door glyph centered in a size x size canvas."""
    cx = size / 2
    house_w = size * 0.5
    house_h = size * 0.42

    body_top = size * 0.52
    body_bottom = body_top + house_h * 0.62
    body_left = cx - house_w / 2
    body_right = cx + house_w / 2

    # House body
    draw.rectangle([body_left, body_top, body_right, body_bottom], fill=WHITE)

    # Roof (triangle)
    roof_peak = (cx, size * 0.26)
    roof_left = (body_left - size * 0.05, body_top + 2)
    roof_right = (body_right + size * 0.05, body_top + 2)
    draw.polygon([roof_peak, roof_left, roof_right], fill=WHITE)

    # Door (cut out of the body, shown in the background color)
    door_w = house_w * 0.28
    door_h = house_h * 0.36
    door_left = cx - door_w / 2
    door_top = body_bottom - door_h
    draw.rectangle([door_left, door_top, door_left + door_w, body_bottom], fill=body_color)

    if roof_and_dot:
        # Small alert dot, top-right — signals "safety check" at a glance.
        dot_r = size * 0.12
        dot_cx = size * 0.78
        dot_cy = size * 0.22
        draw.ellipse(
            [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
            fill=ALERT_RED,
        )


def make_rounded_icon(size: int, path: str):
    """Standard icon with rounded corners and a transparent background
    outside the rounded square — used for the Android/manifest icons."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = size * 0.22
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=TEAL)
    _draw_house(draw, size, TEAL)
    img.save(path)


def make_apple_touch_icon(size: int, path: str):
    """iOS fills transparent corners with black, so this version uses a
    fully opaque square background — iOS applies its own rounding."""
    img = Image.new("RGBA", (size, size), TEAL)
    draw = ImageDraw.Draw(img)
    _draw_house(draw, size, TEAL)
    img.save(path)


if __name__ == "__main__":
    make_rounded_icon(192, "icon-192.png")
    make_rounded_icon(512, "icon-512.png")
    make_apple_touch_icon(180, "apple-touch-icon.png")
    print("Generated icon-192.png, icon-512.png, apple-touch-icon.png")

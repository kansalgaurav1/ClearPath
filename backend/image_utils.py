"""
image_utils.py
---------------
Small shared image helpers used by both app.py (saving the reference
photo, reading the uploaded photo) and image_annotator.py.

The important one is normalize_orientation(): phone cameras often save a
photo's rotation as EXIF metadata rather than physically rotating the
pixels — most viewers apply that metadata automatically, but PIL doesn't
by default, and simple operations like .convert("RGB") silently drop the
metadata entirely. The result: a photo that looked upright on the phone
comes out sideways once ClearPath touches it. normalize_orientation()
bakes the correct rotation into the actual pixels once, up front, so
every downstream step (sending to Claude, drawing hazard boxes, saving
the reference photo) works with a correctly-oriented image.
"""

import io

from PIL import Image, ImageOps


def normalize_orientation(image_bytes: bytes) -> bytes:
    """Physically rotates/flips the image according to its EXIF orientation
    tag (if any), strips the metadata, and re-encodes as JPEG. Always safe
    to call even if the image has no orientation tag — it's a no-op then."""
    image = Image.open(io.BytesIO(image_bytes))
    image = ImageOps.exif_transpose(image)  # bakes in the correct rotation
    if image.mode != "RGB":
        image = image.convert("RGB")

    output = io.BytesIO()
    image.save(output, format="JPEG", quality=92)
    return output.getvalue()

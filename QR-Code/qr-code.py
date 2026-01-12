from __future__ import annotations

import os
from typing import Optional, Tuple

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image

# def recolor_icon(icon: Image.Image, color_hex: str) -> Image.Image:
#     """
#     Recolors all non-transparent pixels of the icon to the given color.
#     """
#     icon = icon.convert("RGBA")

#     # Convert hex to RGB
#     color_hex = color_hex.lstrip("#")
#     r = int(color_hex[0:2], 16)
#     g = int(color_hex[2:4], 16)
#     b = int(color_hex[4:6], 16)

#     pixels = icon.load()
#     for y in range(icon.height):
#         for x in range(icon.width):
#             _, _, _, a = pixels[x, y]
#             if a > 0:  # if not transparent
#                 pixels[x, y] = (r, g, b, a)

#     return icon

def recolor_icon(icon: Image.Image, color_hex: str, threshold=200) -> Image.Image:
    """
    Recolors only dark pixels (line art) while preserving light/white background.
    """
    icon = icon.convert("RGBA")

    color_hex = color_hex.lstrip("#")
    r_new = int(color_hex[0:2], 16)
    g_new = int(color_hex[2:4], 16)
    b_new = int(color_hex[4:6], 16)

    pixels = icon.load()

    for y in range(icon.height):
        for x in range(icon.width):
            r, g, b, a = pixels[x, y]

            # Skip transparent
            if a == 0:
                continue

            # Detect dark pixels (line art)
            if r < threshold and g < threshold and b < threshold:
                pixels[x, y] = (r_new, g_new, b_new, a)

    return icon


def generate_qr_with_center_icon(
    url: str,
    output_path: str = "qr.png",
    icon_path: Optional[str] = None,
    *,
    fg_color: str = "#1E66F5",      # QR "ink" color (foreground)
    bg_color: str = "#FFFFFF",      # QR background color
    box_size: int = 14,             # size of each QR module (pixel scale)
    border: int = 4,                # quiet zone (keep >= 4 for best scanning)
    icon_scale: float = 0.20,       # icon width as % of QR width (0.15-0.25 typical)
    add_icon_plate: bool = True,    # add a white plate under icon for reliability
    plate_scale: float = 1.25,      # plate size relative to icon size
    plate_color: str = "#FFFFFF",
) -> str:
    """
    Creates a colored QR code for `url` and optionally embeds `icon_path` in the center.

    Notes on scan reliability:
      - High error correction is enabled (ERROR_CORRECT_H).
      - Keep icon_scale <= ~0.25.
      - Prefer higher contrast between fg_color and bg_color.
    """
    if not url or not isinstance(url, str):
        raise ValueError("url must be a non-empty string")

    # Create QR
    qr = qrcode.QRCode(
        version=None,  # let library pick a fit
        error_correction=ERROR_CORRECT_H,
        box_size=box_size,
        border=border,
    )
    qr.add_data(url)
    qr.make(fit=True)

    img_qr = qr.make_image(fill_color=fg_color, back_color=bg_color).convert("RGBA")

    if icon_path:
        if not os.path.exists(icon_path):
            raise FileNotFoundError(f"Icon not found: {icon_path}")

        # icon = Image.open(icon_path).convert("RGBA")
        icon = Image.open(icon_path).convert("RGBA")
        icon = recolor_icon(icon, fg_color)  # make icon same color as QR


        # Resize icon relative to QR size
        qr_w, qr_h = img_qr.size
        target_icon_w = int(qr_w * icon_scale)
        if target_icon_w <= 0:
            raise ValueError("icon_scale resulted in a non-positive icon size")

        # Preserve aspect ratio
        icon_ratio = icon.height / icon.width
        target_icon_h = int(target_icon_w * icon_ratio)
        icon = icon.resize((target_icon_w, target_icon_h), Image.LANCZOS)

        # Compute center position
        pos = ((qr_w - target_icon_w) // 2, (qr_h - target_icon_h) // 2)

        # Optional plate (recommended)
        if add_icon_plate:
            plate_w = int(target_icon_w * plate_scale)
            plate_h = int(target_icon_h * plate_scale)
            plate = Image.new("RGBA", (plate_w, plate_h), plate_color)

            plate_pos = ((qr_w - plate_w) // 2, (qr_h - plate_h) // 2)
            img_qr.alpha_composite(plate, dest=plate_pos)

        # Add icon on top
        img_qr.alpha_composite(icon, dest=pos)

    # Save
    img_qr.save(output_path, format="PNG")
    return output_path


if __name__ == "__main__":
    # Example usage
    url = "https://docs.google.com/forms/d/e/1FAIpQLSdCrZHkKkHnI9_DoCMhTSc5sNdNYg_47J7Ac13EjCAoCVwaeQ/viewform"

    # Provide an icon path (PNG recommended with transparency)
    icon_path = "female-cat.png"  # set to None if you don't want an icon

    out = generate_qr_with_center_icon(
        url=url,
        output_path="qr_colored_icon.png",
        icon_path=icon_path,
        fg_color="#2B6CB0",  # blue
        bg_color="#FFFFFF",
        icon_scale=0.20,
        add_icon_plate=True,
    )
    print(f"Generated: {out}")

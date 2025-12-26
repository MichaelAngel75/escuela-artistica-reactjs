import json
import os
from io import BytesIO
from datetime import datetime
import unicodedata

import pandas as pd
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from PIL import Image


# -----------------------------------------------------------------------------------------------------
# ---- Examples to call api internal endpoints:
# curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/signatures
# curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/templates/active

# curl -X POST 'http://localhost:5000/internal/reload-api-key' \
#   -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@'

# curl -X PATCH 'http://localhost:5000/internal/diploma-batches/1' \
#   -H 'Content-Type: application/json' \
#   -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' \
#   -d '{
#     "status": "completado",
#     "totalRecords": 0
#   }'
# -----------------------------------------------------------------------------------------------------

# Get the total width of the page
page_width = letter[0]

# ------------------------------
# JSON layout helpers
# ------------------------------
def load_layout(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        layout = json.load(f)
    validate_layout(layout)
    return layout

def validate_layout(layout: dict) -> None:
    # Minimal validation to ensure colors are hex when present
    def is_hex(s: str) -> bool:
        if not isinstance(s, str):
            return False
        if not s.startswith("#"):
            return False
        if len(s) not in (4, 7):  # #RGB or #RRGGBB
            return False
        hexdigits = set("0123456789abcdefABCDEF")
        return all(c in hexdigits for c in s[1:])

    for k, v in layout.items():
        if isinstance(v, dict) and "font" in v and isinstance(v["font"], dict):
            color = v["font"].get("color")
            if color is not None and not is_hex(color):
                raise ValueError(f"layout['{k}'].font.color must be HEX like '#RRGGBB' (got {color!r})")


def hex_to_rgb01(hex_color: str):
    """
    '#RRGGBB' or '#RGB' -> (r,g,b) in [0..1]
    """
    s = hex_color.strip()
    if not s.startswith("#"):
        raise ValueError(f"Color must be hex like '#RRGGBB' (got {hex_color!r})")
    s = s[1:]
    if len(s) == 3:
        s = "".join([c * 2 for c in s])
    if len(s) != 6:
        raise ValueError(f"Color must be '#RRGGBB' or '#RGB' (got {hex_color!r})")

    r = int(s[0:2], 16) / 255.0
    g = int(s[2:4], 16) / 255.0
    b = int(s[4:6], 16) / 255.0
    return (r, g, b)


def set_fill_hex(c: canvas.Canvas, hex_color: str):
    r, g, b = hex_to_rgb01(hex_color)
    c.setFillColorRGB(r, g, b)


def apply_font(c: canvas.Canvas, font_cfg: dict):
    """
    font_cfg = { "name": "Helvetica", "size": 12, "color": "#000000" }
    """
    c.setFont(font_cfg["name"], float(font_cfg["size"]))
    set_fill_hex(c, font_cfg.get("color", "#000000"))


# ------------------------------
# Image transparency helper
# ------------------------------
def image_to_png_bytes_with_transparency(path: str, bg_threshold: int = 245) -> BytesIO:
    """
    Loads an image (GIF/PNG/JPG), converts to RGBA, and makes near-white pixels transparent.
    Returns a BytesIO containing PNG bytes.
    """
    im = Image.open(path)

    # If GIF has multiple frames, take the first frame
    try:
        im.seek(0)
    except Exception:
        pass

    im = im.convert("RGBA")
    pixels = im.getdata()

    new_pixels = []
    for r, g, b, a in pixels:
        if r >= bg_threshold and g >= bg_threshold and b >= bg_threshold:
            new_pixels.append((r, g, b, 0))
        else:
            new_pixels.append((r, g, b, a))

    im.putdata(new_pixels)

    out = BytesIO()
    im.save(out, format="PNG")
    out.seek(0)
    return out


# ------------------------------
# Positioning helpers
# ------------------------------
def centered_x_in_range(text: str, x_min: float, x_max: float, font_name: str, font_size: float) -> float:
    width = pdfmetrics.stringWidth(text, font_name, font_size)
    center = (x_min + x_max) / 2.0
    x = center - (width / 2.0)

    left_bound = x_min
    right_bound = x_max - width
    if x < left_bound:
        x = left_bound
    if x > right_bound:
        x = right_bound
    return x

from datetime import datetime
import re

def fecha_a_espanol(fecha_str: str) -> str:
    """
    Accepts:
      - YYYY-MM-DD
      - YYYY/MM/DD
      - DD-MM-YYYY
      - DD/MM/YYYY

    Returns:
      - '<mes> de <año>' in Spanish if recognized
      - original value if format is not recognized
    """

    if not fecha_str or not isinstance(fecha_str, str):
        return fecha_str

    fecha_str = fecha_str.strip()
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ]

    formatos = [
    ("%Y-%m-%d", r"^\d{4}-\d{1,2}-\d{1,2}$"),
    ("%Y/%m/%d", r"^\d{4}/\d{1,2}/\d{1,2}$"),
    ("%d-%m-%Y", r"^\d{1,2}-\d{1,2}-\d{4}$"),
    ("%d/%m/%Y", r"^\d{1,2}/\d{1,2}/\d{4}$"),
    ]

    for fmt, regex in formatos:
        if re.match(regex, fecha_str):
            try:
                fecha = datetime.strptime(fecha_str, fmt)
                mes = meses[fecha.month - 1]
                return f"{mes} de {fecha.year}"
            except ValueError:
                pass  # fallback below

    # If it doesn't match any known date format, return as-is
    return fecha_str

def clean_name(name: str) -> str:
    normalized = unicodedata.normalize("NFD", name)
    cleaned = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    cleaned = cleaned.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return cleaned


def agregar_datos_a_certificado(template_pdf: str, csv_file: str, layout: dict):
    datos = pd.read_csv(csv_file)

    pdf_reader = PdfReader(template_pdf)

    for _, row in datos.iterrows():
        # Clean the name for use in filenames
        nombre = ' '.join(word.capitalize() for word in row["nombre"].split())
        cleaned_name = clean_name(nombre)
        curso = row["curso"].upper()
        fecha = fecha_a_espanol(row["fecha"].strip())
        profesor = row["profesor"]
        image_firma_gif = "firmas/" + profesor.strip().lower().replace(" ", "_") + ".gif"

        output_pdf = f"certificado_{cleaned_name}.pdf"

        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)

        # ------------------------------
        # NOMBRE (centered by page, y from JSON)
        # ------------------------------
        nombre_cfg = layout["nombre"]
        apply_font(c, nombre_cfg["font"])

        nombre_font = nombre_cfg["font"]["name"]
        nombre_size = float(nombre_cfg["font"]["size"])
        text_width = pdfmetrics.stringWidth(nombre, nombre_font, nombre_size)

        #  nombre_cfg.get("fine_tune_offset_x", 0)
        fine_tune_offset = 60
        centered_x = (page_width / 2) - (text_width / 2)
        centered_x += float( fine_tune_offset  )
        c.drawString(centered_x, float(nombre_cfg["y"]), nombre)

        # ------------------------------
        # CURSO (centered by page, y from JSON)
        # ------------------------------
        curso_cfg = layout["curso"]
        apply_font(c, curso_cfg["font"])

        curso_font = curso_cfg["font"]["name"]
        curso_size = float(curso_cfg["font"]["size"])
        curso_width = pdfmetrics.stringWidth(curso, curso_font, curso_size)

        # curso_cfg.get("fine_tune_offset_x", 0)
        fine_tune_offset = 70  # Adjust this value as needed to move right
        centered_x = (page_width / 2) - (curso_width / 2)
        centered_x += float( fine_tune_offset )
        c.drawString(centered_x, float(curso_cfg["y"]), curso)

        # ------------------------------
        # FIRMA (image) from JSON
        # ------------------------------
        sig_cfg = layout["profesor-signature"]
        sig_x = float(sig_cfg["x"])
        sig_y = float(sig_cfg["y"])
        sig_size = float(sig_cfg.get("size", 125))
        bg_threshold = 245 # --- int(sig_cfg.get("bg_threshold", 245))

        try:
            if not os.path.exists(image_firma_gif):
                raise FileNotFoundError(f"Signature image not found: {image_firma_gif}")

            png_bytes = image_to_png_bytes_with_transparency(image_firma_gif, bg_threshold=bg_threshold)
            img = ImageReader(png_bytes)

            c.drawImage(
                img,
                sig_x,
                sig_y,
                width=sig_size,
                height=sig_size,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception as e:
            print(f"[WARN] Could not render signature '{image_firma_gif}' for profesor='{profesor}': {e}")

        # ------------------------------
        # PROFESOR (center in x_range) from JSON
        # ------------------------------
        prof_cfg = layout["profesor"]
        apply_font(c, prof_cfg["font"])

        prof_font = prof_cfg["font"]["name"]
        prof_size = float(prof_cfg["font"]["size"])
        x_min, x_max = prof_cfg["x_range"]
        x_prof = centered_x_in_range(profesor, float(x_min), float(x_max), prof_font, prof_size)

        c.drawString(x_prof, float(prof_cfg["y"]), profesor)

        # ------------------------------
        # FECHA from JSON
        # ------------------------------
        fecha_cfg = layout["fecha"]
        apply_font(c, fecha_cfg["font"])
        c.drawString(float(fecha_cfg["x"]), float(fecha_cfg["y"]), fecha)

        # Guardar el PDF temporal
        c.save()
        buffer.seek(0)
        
        # Leer el contenido del PDF temporal
        pdf_temp = PdfReader(buffer)

        # Crear un nuevo PdfWriter para el archivo individual
        pdf_writer = PdfWriter()

        # Tomar la primera página del PDF base
        pdf_reader = PdfReader(template_pdf)
        page = pdf_reader.pages[0]

        # Superponer el contenido del PDF temporal en el PDF base
        page.merge_page(pdf_temp.pages[0])
        pdf_writer.add_page(page)


        # Guardar el PDF individual
        with open(output_pdf, "wb") as f:
            pdf_writer.write(f)

        # finalize overlay PDF
        # c.save()
        # buffer.seek(0)
        # pdf_temp = PdfReader(buffer)
        # page = pdf_reader.pages[0]
        # page.merge_page(pdf_temp.pages[0])

        # out = PdfWriter()
        # out.add_page(page)

        # with open(output_pdf, "wb") as f:
        #     out.write(f)


# ------------------------------
# Entrypoint
# ------------------------------
template_pdf = "constancia_vacio.pdf"
csv_file = "diploma-datos.csv"
layout = load_layout("layout.json")

agregar_datos_a_certificado(template_pdf, csv_file, layout)

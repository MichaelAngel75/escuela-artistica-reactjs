import os
from io import BytesIO

from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from PIL import Image
import json

# ---------- helpers ----------

def image_to_png_bytes_with_transparency(path: str, bg_threshold: int = 245) -> BytesIO:
    im = Image.open(path)
    try:
        im.seek(0)
    except Exception:
        pass

    im = im.convert("RGBA")
    pixels = im.getdata()

    new_pixels = []
    for r, g, b, a in pixels:
        if r >= bg_threshold and g >= bg_threshold and b >= bg_threshold:
            new_pixels.append((r, g, b, 0))  # make almost-white transparent
        else:
            new_pixels.append((r, g, b, a))

    im.putdata(new_pixels)

    out = BytesIO()
    im.save(out, format="PNG")
    out.seek(0)
    return out


def load_layout(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------- main logic: put Firma.png on the template ----------

def poner_firma_en_template(template_pdf: str,
                            firma_path: str,
                            layout_path: str,
                            output_pdf: str):

    # 1. Cargar layout
    layout = load_layout(layout_path)

    # 2. Leer el PDF base
    pdf_reader = PdfReader(template_pdf)
    base_page = pdf_reader.pages[0]
    page_width = float(base_page.mediabox.width)
    page_height = float(base_page.mediabox.height)

    # 3. Crear un PDF temporal solo con las imágenes de la firma
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(page_width, page_height))

    if not os.path.exists(firma_path):
        raise FileNotFoundError(f"No se encontró la firma: {firma_path}")

    # Preparamos la imagen con transparencia una sola vez
    bg_threshold = 100  # ajusta si quieres más/menos transparencia  working: 115, 135 
    png_bytes = image_to_png_bytes_with_transparency(firma_path,
                                                     bg_threshold=bg_threshold)
    img = ImageReader(png_bytes)

    # ---------- Firma 1: "profesor-signature" (10° clockwise) ----------
    sig_cfg = layout["profesor-signature"]
    sig_x = float(sig_cfg["x"])
    sig_y = float(sig_cfg["y"])
    sig_size = float(sig_cfg.get("size", 125))

    # Rotamos alrededor del centro de la imagen
    c.saveState()
    c.translate(sig_x + sig_size / 2.0, sig_y + sig_size / 2.0)
    c.rotate(-15)  # clockwise
    c.drawImage(
        img,
        -sig_size / 2.0,
        -sig_size / 2.0,
        width=sig_size,
        height=sig_size,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.restoreState()

    # ---------- Firma 2: "profesor-signature-2" (10° counter-clockwise) ----------
    # Preparamos la imagen con transparencia una sola vez
    bg_threshold = 107 # ajusta si quieres más/menos transparencia  working: 128, 135 
    png_bytes = image_to_png_bytes_with_transparency(firma_path,
                                                     bg_threshold=bg_threshold)
    img = ImageReader(png_bytes)


    if "profesor-signature-2" in layout:
        sig2_cfg = layout["profesor-signature-2"]
        sig2_x = float(sig2_cfg["x"])
        sig2_y = float(sig2_cfg["y"])
        sig2_size = float(sig2_cfg.get("size", 125))

        c.saveState()
        c.translate(sig2_x + sig2_size / 2.0, sig2_y + sig2_size / 2.0)
        c.rotate(2)  # counter-clockwise
        c.drawImage(
            img,
            -sig2_size / 2.0,
            -sig2_size / 2.0,
            width=sig2_size,
            height=sig2_size,
            preserveAspectRatio=True,
            mask="auto",
        )
        c.restoreState()

    # cerramos el PDF temporal
    c.save()
    buffer.seek(0)

    # 4. Mezclar la página de firmas con la página base
    overlay_reader = PdfReader(buffer)
    overlay_page = overlay_reader.pages[0]
    base_page.merge_page(overlay_page)

    # 5. Guardar resultado
    writer = PdfWriter()
    writer.add_page(base_page)

    with open(output_pdf, "wb") as f:
        writer.write(f)

    print(f"PDF generado: {output_pdf}")


if __name__ == "__main__":
    # template_pdf = "bnmx-files/cancelacion-seguro-bnmx.pdf"
    # template_pdf = "bnmx-files/CartaCancelacionBonificacion.pdf"
    template_pdf = "bnmx-files/SeguroBanamex-Empty-Cancelacion.pdf"
    firma_path   = "bnmx-files/Firma.png"
    layout_path  = "bnmx-files/layout.json"
    output_pdf   = "bnmx-files/SeguroBanamex-Empty-Cancelacion-firmado.pdf"

    poner_firma_en_template(template_pdf, firma_path, layout_path, output_pdf)

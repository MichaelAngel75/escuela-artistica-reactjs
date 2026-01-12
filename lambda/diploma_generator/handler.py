import os
import re
import csv
import json
import uuid
import zipfile
import logging
from io import BytesIO, StringIO
from datetime import datetime
from typing import Dict, Any, Optional, Tuple, List
from urllib.parse import urlparse

import boto3
import requests
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from PIL import Image
import unicodedata


# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# -----------------------------------------------------------------------------
# ENV VARS (required)
# -----------------------------------------------------------------------------
API_KEY = os.environ.get("MY-API-KEY")  # required
if not API_KEY:
    # raise at import time so you fail fast in Lambda configuration
    raise RuntimeError("Missing required env var: MY-API-KEY")

ADMIN_BASE = os.environ.get("ADMIN_BASE", "https://admin.my-website.com/internal")
RESOURCES_BASE_URL = os.environ.get("RESOURCES_BASE_URL", "https://resources.my-website.com")

# Required for uploading ZIP to S3 (bucket behind resources.my-website.com)
# Example: "resources.my-website.com"
RESOURCES_BUCKET = os.environ.get("RESOURCES_BUCKET")
if not RESOURCES_BUCKET:
    raise RuntimeError("Missing required env var: RESOURCES_BUCKET")

API_KEY_HEADER = "api-key-pohualizcalli"

# -----------------------------------------------------------------------------
# AWS clients
# -----------------------------------------------------------------------------
s3 = boto3.client("s3")

# -----------------------------------------------------------------------------
# Globals (cached across warm invocations)
# -----------------------------------------------------------------------------
_SIGNATURES_BY_NAME: Optional[Dict[str, str]] = None      # normalized name/professorName -> url
_SIGNATURES_BY_FILE: Optional[Dict[str, str]] = None      # normalized filename (oscar_pimentel.gif) -> url
_TEMPLATE_PDF_BYTES: Optional[bytes] = None
_FIELD_MAPPINGS: Optional[Dict[str, Any]] = None
_SIGNATURE_BYTES_CACHE: Dict[str, bytes] = {}             # url -> raw image bytes

# PDF letter page width
PAGE_WIDTH = letter[0]


# =============================================================================
# HTTP helpers
# =============================================================================
def _headers() -> Dict[str, str]:
    return {API_KEY_HEADER: API_KEY}


def admin_get(path: str) -> Any:
    """
    GET https://admin.../internal/<path>
    """
    url = ADMIN_BASE.rstrip("/") + path
    logger.info("GET %s", url)
    r = requests.get(url, headers=_headers(), timeout=30)
    r.raise_for_status()
    return r.json()


def admin_patch(path: str, payload: Dict[str, Any]) -> Any:
    """
    PATCH https://admin.../internal/<path>
    """
    url = ADMIN_BASE.rstrip("/") + path
    logger.info("PATCH %s payload=%s", url, payload)
    r = requests.patch(
        url,
        headers={**_headers(), "Content-Type": "application/json"},
        json=payload,
        timeout=30,
    )
    r.raise_for_status()
    return r.json() if r.content else None


def http_get_bytes(url: str, timeout: int = 60) -> bytes:
    logger.info("Downloading %s", url)
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.content


# =============================================================================
# Normalization + mapping
# =============================================================================
def normalize_key(s: str) -> str:
    return " ".join(str(s).strip().lower().split())


def normalize_filename(s: str) -> str:
    """
    For matching "oscar_pimentel.gif" vs url path etc.
    """
    return normalize_key(s).replace(" ", "_")


def looks_like_image_filename(value: str) -> bool:
    v = (value or "").strip().lower()
    return bool(re.search(r"\.(gif|png|jpg|jpeg|webp)$", v))


# =============================================================================
# One-time initialization (cached per warm container)
# =============================================================================
def load_signatures_once() -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    Calls:
      GET /signatures
    Builds two maps:
      - by name/professorName
      - by filename (url basename)
    """
    global _SIGNATURES_BY_NAME, _SIGNATURES_BY_FILE
    if _SIGNATURES_BY_NAME is not None and _SIGNATURES_BY_FILE is not None:
        return _SIGNATURES_BY_NAME, _SIGNATURES_BY_FILE

    data = admin_get("/signatures")
    sigs = data.get("signatures", [])

    by_name: Dict[str, str] = {}
    by_file: Dict[str, str] = {}

    for sig in sigs:
        url = sig.get("url")
        if not url:
            continue

        # map by signatures.name and signatures.professorName
        name = sig.get("name", "")
        professor_name = sig.get("professorName", "")
        if name:
            by_name[normalize_key(name)] = url
        if professor_name:
            by_name[normalize_key(professor_name)] = url

        # map by filename extracted from url (e.g., oscar_pimentel.gif)
        try:
            basename = urlparse(url).path.split("/")[-1]
            if basename:
                by_file[normalize_filename(basename)] = url
        except Exception:
            pass

    logger.info("Loaded signatures: by_name=%d by_file=%d", len(by_name), len(by_file))
    _SIGNATURES_BY_NAME = by_name
    _SIGNATURES_BY_FILE = by_file
    return by_name, by_file


def load_template_once() -> bytes:
    """
    Calls:
      GET /templates/active
    Downloads template PDF once and caches.
    Also writes it to /tmp/template.pdf for debugging / repeatability.
    """
    global _TEMPLATE_PDF_BYTES
    if _TEMPLATE_PDF_BYTES is not None:
        return _TEMPLATE_PDF_BYTES

    data = admin_get("/templates/active")
    template = data.get("template") or {}
    template_url = template.get("url")
    if not template_url:
        raise RuntimeError("No active template URL returned from /templates/active")

    pdf_bytes = http_get_bytes(template_url, timeout=90)
    _TEMPLATE_PDF_BYTES = pdf_bytes

    # optional: store in /tmp
    try:
        with open("/tmp/active_template.pdf", "wb") as f:
            f.write(pdf_bytes)
    except Exception as e:
        logger.warning("Could not write template to /tmp: %s", e)

    logger.info("Loaded active template PDF (%d bytes)", len(pdf_bytes))
    return pdf_bytes


def load_configuration_once() -> Dict[str, Any]:
    """
    Calls:
      GET /configuration
    Caches fieldMappings only.
    """
    global _FIELD_MAPPINGS
    if _FIELD_MAPPINGS is not None:
        return _FIELD_MAPPINGS

    data = admin_get("/configuration")
    field_mappings = data.get("fieldMappings")
    if not field_mappings:
        raise RuntimeError("No fieldMappings returned from /configuration")

    _FIELD_MAPPINGS = field_mappings
    logger.info("Loaded configuration keys: %s", list(field_mappings.keys()))
    return field_mappings


def warm_init():
    """
    Force initialization so it happens once per warm container.
    """
    load_signatures_once()
    load_template_once()
    load_configuration_once()


# =============================================================================
# Your PDF + formatting logic (adapted for bytes, not file paths)
# =============================================================================
def hex_to_rgb01(hex_color: str):
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
    c.setFont(font_cfg["name"], float(font_cfg["size"]))
    set_fill_hex(c, font_cfg.get("color", "#000000"))


def image_bytes_to_png_bytes_with_transparency(raw_bytes: bytes, bg_threshold: int = 245) -> BytesIO:
    """
    Same idea as your function, but takes raw bytes from URL instead of local path.
    """
    im = Image.open(BytesIO(raw_bytes))

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


def fecha_a_espanol(fecha_str: str) -> str:
    """
    Same as your improved version:
    - If it's one of supported numeric date formats, convert to 'mes de año'
    - otherwise return as-is (e.g. "Marzo de 2025")
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
                pass

    return fecha_str


def clean_name(name: str) -> str:
    normalized = unicodedata.normalize("NFD", str(name))
    cleaned = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    cleaned = cleaned.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return cleaned


def get_signature_bytes(signature_url: str) -> bytes:
    """
    Downloads signature bytes once per URL per warm container.
    """
    if signature_url in _SIGNATURE_BYTES_CACHE:
        return _SIGNATURE_BYTES_CACHE[signature_url]
    b = http_get_bytes(signature_url, timeout=60)
    _SIGNATURE_BYTES_CACHE[signature_url] = b
    return b


def generate_one_pdf_bytes(
    template_pdf_bytes: bytes,
    layout: Dict[str, Any],
    nombre: str,
    curso: str,
    fecha: str,
    profesor_value: str,
    signature_url: Optional[str],
) -> bytes:
    """
    Produces filled diploma as PDF bytes.
    Uses layout keys exactly as returned by /internal/configuration:
      estudiante, curso, profesor-signature, profesor, fecha
    """
    # Normalize user-visible values
    nombre_pretty = " ".join(word.capitalize() for word in str(nombre).split())
    curso_upper = str(curso).upper()
    fecha_out = fecha_a_espanol(str(fecha).strip())
    profesor_text = str(profesor_value).strip()

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)

    # ------------------------------
    # ESTUDIANTE (centered by page)
    # ------------------------------
    estudiante_cfg = layout["estudiante"]
    apply_font(c, estudiante_cfg["font"])

    est_font = estudiante_cfg["font"]["name"]
    est_size = float(estudiante_cfg["font"]["size"])
    text_width = pdfmetrics.stringWidth(nombre_pretty, est_font, est_size)

    fine_tune_offset = float(estudiante_cfg.get("fine_tune_offset_x", 60))
    centered_x = (PAGE_WIDTH / 2) - (text_width / 2)
    centered_x += fine_tune_offset
    c.drawString(centered_x, float(estudiante_cfg["y"]), nombre_pretty)

    # ------------------------------
    # CURSO (centered by page)
    # ------------------------------
    curso_cfg = layout["curso"]
    apply_font(c, curso_cfg["font"])

    curso_font = curso_cfg["font"]["name"]
    curso_size = float(curso_cfg["font"]["size"])
    curso_width = pdfmetrics.stringWidth(curso_upper, curso_font, curso_size)

    fine_tune_offset = float(curso_cfg.get("fine_tune_offset_x", 70))
    centered_x = (PAGE_WIDTH / 2) - (curso_width / 2)
    centered_x += fine_tune_offset
    c.drawString(centered_x, float(curso_cfg["y"]), curso_upper)

    # ------------------------------
    # FIRMA (image)
    # ------------------------------
    sig_cfg = layout["profesor-signature"]
    sig_x = float(sig_cfg["x"])
    sig_y = float(sig_cfg["y"])
    sig_size = float(sig_cfg.get("size", 125))
    bg_threshold = int(sig_cfg.get("bg_threshold", 245))

    if signature_url:
        try:
            raw_sig = get_signature_bytes(signature_url)
            png_bytes = image_bytes_to_png_bytes_with_transparency(raw_sig, bg_threshold=bg_threshold)
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
            logger.warning("Signature render failed (%s): %s", signature_url, e)

    # ------------------------------
    # PROFESOR (text centered in x_range)
    # ------------------------------
    prof_cfg = layout["profesor"]
    apply_font(c, prof_cfg["font"])
    prof_font = prof_cfg["font"]["name"]
    prof_size = float(prof_cfg["font"]["size"])
    x_min, x_max = prof_cfg["x_range"]
    x_prof = centered_x_in_range(profesor_text, float(x_min), float(x_max), prof_font, prof_size)
    c.drawString(x_prof, float(prof_cfg["y"]), profesor_text)

    # ------------------------------
    # FECHA
    # ------------------------------
    fecha_cfg = layout["fecha"]
    apply_font(c, fecha_cfg["font"])
    c.drawString(float(fecha_cfg["x"]), float(fecha_cfg["y"]), fecha_out)

    # finalize overlay
    c.save()
    buffer.seek(0)

    overlay_reader = PdfReader(buffer)
    base_reader = PdfReader(BytesIO(template_pdf_bytes))
    page = base_reader.pages[0]
    page.merge_page(overlay_reader.pages[0])

    writer = PdfWriter()
    writer.add_page(page)
    out = BytesIO()
    writer.write(out)
    out.seek(0)
    return out.getvalue()


# =============================================================================
# CSV + S3 + ZIP helpers
# =============================================================================
def parse_csv_rows(csv_bytes: bytes) -> List[Dict[str, str]]:
    """
    Reads CSV with headers: nombre,curso,fecha,profesor
    """
    text = csv_bytes.decode("utf-8-sig")
    f = StringIO(text)
    reader = csv.DictReader(f)

    rows: List[Dict[str, str]] = []
    for row in reader:
        rows.append({
            "nombre": (row.get("nombre") or "").strip(),
            "curso": (row.get("curso") or "").strip(),
            "fecha": (row.get("fecha") or "").strip(),
            "profesor": (row.get("profesor") or "").strip(),
        })
    # remove completely empty rows
    rows = [r for r in rows if any(r.values())]
    return rows


def extract_process_and_paths(csv_url: str) -> Tuple[str, str, str, str]:
    """
    From csv_url:
      https://resources.../generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-datos-afp.csv

    Returns:
      path_rel: generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-datos-afp.csv
      process_folder: proceso-2
      parent_prefix: generacion-diplomas/generated-diplomas/2025-12-26/proceso-2
      original_file: diploma-datos-afp.csv
    """
    parsed = urlparse(csv_url)
    path_rel = parsed.path.lstrip("/")
    parts = path_rel.split("/")
    if len(parts) < 2:
        raise ValueError(f"Unexpected csv_url path: {path_rel}")

    original_file = parts[-1]
    process_folder = parts[-2]
    parent_prefix = "/".join(parts[:-1])  # up to /proceso-2

    return path_rel, process_folder, parent_prefix, original_file


def upload_zip_to_s3(zip_path: str, parent_prefix: str, original_file: str) -> str:
    """
    Upload to:
      <parent_prefix>/diploma-generated/<original_file>.zip
    Return:
      https://resources.../<key>
    """
    key = f"{parent_prefix}/diploma-generated/{original_file}.zip"
    logger.info("Uploading ZIP to s3://%s/%s", RESOURCES_BUCKET, key)

    with open(zip_path, "rb") as f:
        s3.put_object(
            Bucket=RESOURCES_BUCKET,
            Key=key,
            Body=f,
            ContentType="application/zip",
        )

    return f"{RESOURCES_BASE_URL.rstrip('/')}/{key}"


def resolve_signature_url(profesor_value: str) -> Optional[str]:
    """
    If profesor_value looks like 'oscar_pimentel.gif' -> match by filename mapping.
    Else match by profesor name mapping (signature.name or signature.professorName).
    """
    by_name, by_file = load_signatures_once()

    raw = (profesor_value or "").strip()
    if not raw:
        return None

    if looks_like_image_filename(raw):
        key = normalize_filename(raw)
        return by_file.get(key)

    # otherwise treat as name
    return by_name.get(normalize_key(raw))


# =============================================================================
# Core processing
# =============================================================================
def process_one_batch(msg: Dict[str, Any]) -> Dict[str, Any]:
    """
    msg example:
    {
      "created_by": "...",
      "file_name": "diploma-datos-afp.csv",
      "csv_url": "https://resources.../proceso-2/diploma-datos-afp.csv",
      "batch_id": 2
    }
    """
    warm_init()

    batch_id = int(msg["batch_id"])
    csv_url = msg["csv_url"]

    template_pdf = load_template_once()
    layout = load_configuration_once()

    # Download CSV
    csv_bytes = http_get_bytes(csv_url, timeout=90)
    rows = parse_csv_rows(csv_bytes)
    total_records = len(rows)
    logger.info("CSV rows parsed: %d", total_records)

    # /tmp/<proceso-x>
    _, process_folder, parent_prefix, original_file = extract_process_and_paths(csv_url)
    workdir = f"/tmp/{process_folder}"
    os.makedirs(workdir, exist_ok=True)

    # Prepare result CSV
    base_name = os.path.splitext(original_file)[0]
    result_csv_name = f"{base_name}-resultado.csv"
    result_csv_path = os.path.join(workdir, result_csv_name)

    results: List[List[str]] = []
    results.append(["nombre", "curso", "fecha", "profesor", "resultado"])

    interrupted = False
    any_row_errors = False

    try:
        for row in rows:
            nombre = row["nombre"]
            curso = row["curso"]
            fecha = row["fecha"]
            profesor_value = row["profesor"]

            try:
                sig_url = resolve_signature_url(profesor_value)
                if not sig_url:
                    raise RuntimeError(f"No signature found for profesor='{profesor_value}'")

                pdf_bytes = generate_one_pdf_bytes(
                    template_pdf_bytes=template_pdf,
                    layout=layout,
                    nombre=nombre,
                    curso=curso,
                    fecha=fecha,
                    profesor_value=profesor_value if not looks_like_image_filename(profesor_value) else profesor_value,
                    signature_url=sig_url,
                )

                student_clean = clean_name(nombre.lower())
                course_clean = clean_name(curso.lower())
                uid = uuid.uuid4().hex

                pdf_filename = f"{student_clean}_{course_clean}_{uid}.pdf"
                pdf_path = os.path.join(workdir, pdf_filename)
                with open(pdf_path, "wb") as f:
                    f.write(pdf_bytes)

                results.append([nombre, curso, fecha, profesor_value, "exitosamente creado"])

            except Exception as e:
                any_row_errors = True
                err_msg = str(e)
                logger.exception("Row failed: %s", err_msg)
                results.append([nombre, curso, fecha, profesor_value, err_msg])

        # Write result CSV inside workdir
        with open(result_csv_path, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerows(results)

        # Zip whole workdir
        zip_path = os.path.join("/tmp", f"{original_file}.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(workdir):
                for filename in files:
                    full = os.path.join(root, filename)
                    arcname = os.path.relpath(full, workdir)
                    zf.write(full, arcname=arcname)

        zip_url = upload_zip_to_s3(zip_path, parent_prefix, original_file)

        # status per your rule:
        # - "error" only if interrupted and didn't reach the end
        # - if reached the end but some rows failed, keep "completado" (and row-level errors in resultado.csv)
        status = "error" if interrupted else "completado"

        admin_patch(
            f"/diploma-batches/{batch_id}",
            {
                "status": status,
                "totalRecords": total_records,
                "zipUrl": zip_url,
            },
        )

        return {
            "batch_id": batch_id,
            "status": status,
            "totalRecords": total_records,
            "zipUrl": zip_url,
            "rowErrors": any_row_errors,
            "process_folder": process_folder,
        }

    except Exception as e:
        interrupted = True
        logger.exception("Batch processing interrupted: %s", e)

        # attempt to update as interrupted error
        try:
            admin_patch(
                f"/diploma-batches/{batch_id}",
                {
                    "status": "error",
                    "totalRecords": total_records,
                },
            )
        except Exception as e2:
            logger.warning("Failed to PATCH batch error status: %s", e2)

        # re-raise so SQS redrive can handle retry/DLQ
        raise


# =============================================================================
# Lambda handler (SQS)
# =============================================================================
def lambda_handler(event, context):
    """
    event from SQS:
    {
      "Records":[
        {"body":"{...json...}"},
        ...
      ]
    }
    """
    logger.info("Event received with %d record(s)", len(event.get("Records", [])))

    out = []
    for rec in event.get("Records", []):
        body = rec.get("body", "")
        msg = json.loads(body)
        result = process_one_batch(msg)
        out.append(result)

    return {"ok": True, "results": out}

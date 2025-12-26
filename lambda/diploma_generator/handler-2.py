import json
import os
import re
import uuid
import csv
import logging
from io import BytesIO, StringIO
from datetime import datetime
from typing import Dict, Any, List, Tuple, Optional
from urllib.parse import urlparse

import boto3
import requests
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.utils import ImageReader
from PIL import Image
import zipfile

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ---------------------------------------------------------------------------
# AWS clients
# ---------------------------------------------------------------------------
ssm = boto3.client("ssm")
s3 = boto3.client("s3")

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
SSM_PARAM_NAME = os.environ.get("POHUALIZCALLI_SSM_PARAM_NAME", "POHUALIZCALLI_SSM_ENV_VARIABLE_NAME")
ADMIN_API_BASE = os.environ.get("ADMIN_API_BASE", "https://admin.my-website.com/internal")
RESOURCES_BASE_URL = os.environ.get("RESOURCES_BASE_URL", "https://resources.my-website.com")
RESOURCES_BUCKET = os.environ.get("RESOURCES_BUCKET", "resources.my-website.com")

API_KEY_HEADER_NAME = "api-key-pohualizcalli"

# PDF page width (letter)
page_width = letter[0]

# ---------------------------------------------------------------------------
# Global caches (persist across Lambda invocations in the same container)
# ---------------------------------------------------------------------------
_API_KEY: Optional[str] = None
_SIGNATURES_INDEX: Optional[Dict[str, str]] = None  # key: normalized name/professorName, value: URL
_FIELD_MAPPINGS: Optional[Dict[str, Any]] = None   # layout from /internal/configuration
_TEMPLATE_BYTES: Optional[bytes] = None            # PDF template bytes
_SIGNATURE_IMAGE_CACHE: Dict[str, bytes] = {}      # url -> bytes


# ===========================================================================
# Helpers: configuration / HTTP
# ===========================================================================
def get_api_key() -> str:
    global _API_KEY
    if _API_KEY is None:
        logger.info("Fetching API key from SSM: %s", SSM_PARAM_NAME)
        resp = ssm.get_parameter(Name=SSM_PARAM_NAME, WithDecryption=True)
        _API_KEY = resp["Parameter"]["Value"]
    return _API_KEY


def admin_get(path: str) -> Any:
    """
    GET to admin internal API returning JSON.
    path example: '/signatures' or '/templates/active'
    """
    api_key = get_api_key()
    url = ADMIN_API_BASE.rstrip("/") + path
    headers = {API_KEY_HEADER_NAME: api_key}
    logger.info("GET %s", url)
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()


def http_get_bytes(url: str) -> bytes:
    logger.info("Downloading bytes from %s", url)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


# ===========================================================================
# Load and cache: signatures, template, configuration
# ===========================================================================
def normalize_key(s: str) -> str:
    return " ".join(s.strip().lower().split())


def load_signatures_index() -> Dict[str, str]:
    """
    Build a mapping for signatures:
      - by signatures.name (normalized)
      - by signatures.professorName (normalized)
    => URL
    """
    global _SIGNATURES_INDEX
    if _SIGNATURES_INDEX is not None:
        return _SIGNATURES_INDEX

    data = admin_get("/signatures")
    sigs = data.get("signatures", [])
    index: Dict[str, str] = {}

    for sig in sigs:
        url = sig.get("url")
        if not url:
            continue

        name = sig.get("name", "")
        prof = sig.get("professorName", "")
        if name:
            index[normalize_key(name)] = url
        if prof:
            index[normalize_key(prof)] = url

    logger.info("Loaded %d signatures", len(index))
    _SIGNATURES_INDEX = index
    return index


def load_template_bytes() -> bytes:
    global _TEMPLATE_BYTES
    if _TEMPLATE_BYTES is not None:
        return _TEMPLATE_BYTES

    data = admin_get("/templates/active")
    template = data.get("template")
    if not template or not template.get("url"):
        raise RuntimeError("No active template found from /templates/active")

    template_url = template["url"]
    _TEMPLATE_BYTES = http_get_bytes(template_url)
    logger.info("Loaded template PDF (%d bytes)", len(_TEMPLATE_BYTES))
    return _TEMPLATE_BYTES


def load_field_mappings() -> Dict[str, Any]:
    """
    fieldMappings JSON returned by /internal/configuration.
    Keys:
      - estudiante
      - curso
      - profesor-signature
      - profesor
      - fecha
    """
    global _FIELD_MAPPINGS
    if _FIELD_MAPPINGS is not None:
        return _FIELD_MAPPINGS

    data = admin_get("/configuration")
    mappings = data.get("fieldMappings")
    if not mappings:
        raise RuntimeError("No fieldMappings found from /configuration")

    _FIELD_MAPPINGS = mappings
    logger.info("Loaded field mappings: %s", list(mappings.keys()))
    return mappings


def find_signature_url_for_prof(profesor: str) -> Optional[str]:
    index = load_signatures_index()
    key = normalize_key(profesor)
    url = index.get(key)
    return url


def get_signature_image_bytes(signature_url: str) -> bytes:
    """
    Downloads (once) and caches the signature image bytes.
    """
    if signature_url in _SIGNATURE_IMAGE_CACHE:
        return _SIGNATURE_IMAGE_CACHE[signature_url]
    data = http_get_bytes(signature_url)
    _SIGNATURE_IMAGE_CACHE[signature_url] = data
    return data


# ===========================================================================
# PDF helpers (from your working code, slightly adapted)
# ===========================================================================
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


def image_to_png_bytes_with_transparency(raw_bytes: bytes, bg_threshold: int = 245) -> BytesIO:
    im = Image.open(BytesIO(raw_bytes))

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
                pass

    return fecha_str


def clean_name(name: str) -> str:
    import unicodedata
    normalized = unicodedata.normalize("NFD", name)
    cleaned = "".join(c for c in normalized if unicodedata.category(c) != "Mn")
    cleaned = cleaned.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return cleaned


def generate_diploma_pdf(template_bytes: bytes, layout: Dict[str, Any], row: Dict[str, str],
                         signature_bytes: Optional[bytes]) -> bytes:
    """
    Generates one PDF in-memory for a given CSV row.
    row keys: nombre, curso, fecha, profesor
    layout: fieldMappings from API (keys: estudiante, curso, profesor-signature, profesor, fecha)
    """
    nombre = " ".join(word.capitalize() for word in row["nombre"].split())
    curso = row["curso"].upper()
    fecha_str = fecha_a_espanol(row["fecha"])
    profesor = row["profesor"]

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)

    # ------------------------------
    # ESTUDIANTE (centered by page)
    # ------------------------------
    nombre_cfg = layout["estudiante"]
    apply_font(c, nombre_cfg["font"])

    nombre_font = nombre_cfg["font"]["name"]
    nombre_size = float(nombre_cfg["font"]["size"])
    text_width = pdfmetrics.stringWidth(nombre, nombre_font, nombre_size)

    # Fine tunings (you had 60/70 hard-coded)
    fine_tune_offset = float(nombre_cfg.get("fine_tune_offset_x", 60))
    centered_x = (page_width / 2) - (text_width / 2)
    centered_x += fine_tune_offset
    c.drawString(centered_x, float(nombre_cfg["y"]), nombre)

    # ------------------------------
    # CURSO (centered by page)
    # ------------------------------
    curso_cfg = layout["curso"]
    apply_font(c, curso_cfg["font"])

    curso_font = curso_cfg["font"]["name"]
    curso_size = float(curso_cfg["font"]["size"])
    curso_width = pdfmetrics.stringWidth(curso, curso_font, curso_size)

    fine_tune_offset = float(curso_cfg.get("fine_tune_offset_x", 70))
    centered_x = (page_width / 2) - (curso_width / 2)
    centered_x += fine_tune_offset
    c.drawString(centered_x, float(curso_cfg["y"]), curso)

    # ------------------------------
    # FIRMA (image)
    # ------------------------------
    sig_cfg = layout["profesor-signature"]
    sig_x = float(sig_cfg["x"])
    sig_y = float(sig_cfg["y"])
    sig_size = float(sig_cfg.get("size", 125))
    bg_threshold = int(sig_cfg.get("bg_threshold", 245))

    if signature_bytes:
        try:
            png_bytes = image_to_png_bytes_with_transparency(signature_bytes, bg_threshold=bg_threshold)
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
            logger.warning("Could not render signature for '%s': %s", profesor, e)

    # ------------------------------
    # PROFESOR (center in x_range)
    # ------------------------------
    prof_cfg = layout["profesor"]
    apply_font(c, prof_cfg["font"])

    prof_font = prof_cfg["font"]["name"]
    prof_size = float(prof_cfg["font"]["size"])
    x_min, x_max = prof_cfg["x_range"]
    x_prof = centered_x_in_range(profesor, float(x_min), float(x_max), prof_font, prof_size)
    c.drawString(x_prof, float(prof_cfg["y"]), profesor)

    # ------------------------------
    # FECHA
    # ------------------------------
    fecha_cfg = layout["fecha"]
    apply_font(c, fecha_cfg["font"])
    c.drawString(float(fecha_cfg["x"]), float(fecha_cfg["y"]), fecha_str)

    # finalize overlay
    c.save()
    buffer.seek(0)

    pdf_temp = PdfReader(buffer)
    base_reader = PdfReader(BytesIO(template_bytes))
    page = base_reader.pages[0]
    page.merge_page(pdf_temp.pages[0])

    out = PdfWriter()
    out.add_page(page)

    out_buffer = BytesIO()
    out.write(out_buffer)
    out_buffer.seek(0)
    return out_buffer.getvalue()


# ===========================================================================
# CSV handling and batch processing
# ===========================================================================
def parse_csv_bytes(csv_bytes: bytes) -> List[Dict[str, str]]:
    """
    Reads CSV bytes and returns list of dict rows: {nombre, curso, fecha, profesor}
    Skips the first header line.
    """
    text = csv_bytes.decode("utf-8-sig")
    f = StringIO(text)
    reader = csv.DictReader(f)

    rows: List[Dict[str, str]] = []
    for row in reader:
        # Normalize keys just in case; but DictReader uses header row as given.
        nombre = (row.get("nombre") or "").strip()
        curso = (row.get("curso") or "").strip()
        fecha = (row.get("fecha") or "").strip()
        profesor = (row.get("profesor") or "").strip()

        if not nombre and not curso and not fecha and not profesor:
            continue

        rows.append({
            "nombre": nombre,
            "curso": curso,
            "fecha": fecha,
            "profesor": profesor,
        })
    return rows


def extract_path_info_from_csv_url(csv_url: str) -> Tuple[str, str, str]:
    """
    From:
      https://resources.my-website.com/generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-datos-afp.csv

    Returns:
      (path_rel, process_folder, original_file_name)

    path_rel = "generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-datos-afp.csv"
    process_folder = "proceso-2"
    original_file_name = "diploma-datos-afp.csv"
    """
    parsed = urlparse(csv_url)
    path_rel = parsed.path.lstrip("/")
    parts = path_rel.split("/")
    if len(parts) < 2:
        raise ValueError(f"Unexpected CSV URL path: {path_rel}")

    original_file_name = parts[-1]
    process_folder = parts[-2]  # e.g. proceso-2
    return path_rel, process_folder, original_file_name


def upload_zip_to_s3(local_zip_path: str, csv_path_rel: str, original_file_name: str) -> str:
    """
    Builds S3 key:
      <parent-path>/diploma-generated/<original_file_name>.zip

    Example:
      csv_path_rel = "generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-datos-afp.csv"
      => parent = "generacion-diplomas/generated-diplomas/2025-12-26/proceso-2"
      => key   = "generacion-diplomas/generated-diplomas/2025-12-26/proceso-2/diploma-generated/diploma-datos-afp.csv.zip"
    """
    parent = os.path.dirname(csv_path_rel)
    zip_key = f"{parent}/diploma-generated/{original_file_name}.zip"

    logger.info("Uploading ZIP to s3://%s/%s", RESOURCES_BUCKET, zip_key)
    with open(local_zip_path, "rb") as f:
        s3.put_object(
            Bucket=RESOURCES_BUCKET,
            Key=zip_key,
            Body=f,
            ContentType="application/zip",
        )

    url = f"{RESOURCES_BASE_URL.rstrip('/')}/{zip_key}"
    logger.info("ZIP public URL: %s", url)
    return url


def update_batch_status(batch_id: int, status: str, total_records: int, zip_url: Optional[str], error: Optional[str] = None):
    api_key = get_api_key()
    url = f"{ADMIN_API_BASE.rstrip('/')}/diploma-batches/{batch_id}"
    headers = {
        "Content-Type": "application/json",
        API_KEY_HEADER_NAME: api_key,
    }

    payload: Dict[str, Any] = {
        "status": status,
        "totalRecords": total_records,
    }
    if zip_url:
        payload["zipUrl"] = zip_url
    if error:
        payload["errorMessage"] = error

    logger.info("PATCH %s -> %s", url, payload)
    resp = requests.patch(url, headers=headers, json=payload, timeout=30)
    resp.raise_for_status()


def process_single_message(msg_body: Dict[str, Any]):
    """
    Core business logic for one SQS message.
    msg_body:
      {
        "created_by": "...",
        "file_name": "diploma-datos-afp.csv",
        "csv_url": "...",
        "batch_id": 2
      }
    """
    created_by = msg_body["created_by"]
    csv_url = msg_body["csv_url"]
    batch_id = int(msg_body["batch_id"])
    input_file_name = msg_body["file_name"]

    logger.info("Processing batch_id=%s, csv_url=%s, created_by=%s", batch_id, csv_url, created_by)

    # 1) Ensure global config is loaded
    template_bytes = load_template_bytes()
    layout = load_field_mappings()
    load_signatures_index()  # ensures cache is ready

    # 2) Download CSV
    csv_bytes = http_get_bytes(csv_url)
    rows = parse_csv_bytes(csv_bytes)
    total_records = len(rows)
    logger.info("Parsed %d data rows from CSV", total_records)

    # 3) Local working dir in /tmp
    csv_path_rel, process_folder, original_file_name = extract_path_info_from_csv_url(csv_url)
    work_dir = f"/tmp/{process_folder}"
    os.makedirs(work_dir, exist_ok=True)

    result_csv_path = os.path.join(work_dir, f"{os.path.splitext(original_file_name)[0]}-resultado.csv")

    any_errors = False
    result_rows: List[List[str]] = []
    header = ["nombre", "curso", "fecha", "profesor", "resultado"]
    result_rows.append(header)

    for row in rows:
        try:
            sig_url = find_signature_url_for_prof(row["profesor"])
            if not sig_url:
                raise RuntimeError(f"Signature not found for profesor='{row['profesor']}'")

            sig_bytes = get_signature_image_bytes(sig_url)

            pdf_bytes = generate_diploma_pdf(template_bytes, layout, row, sig_bytes)

            # file name: student + course + uuid
            student_clean = clean_name(row["nombre"].lower())
            course_clean = clean_name(row["curso"].lower())
            unique_id = uuid.uuid4().hex
            pdf_name = f"{student_clean}_{course_clean}_{unique_id}.pdf"

            pdf_path = os.path.join(work_dir, pdf_name)
            with open(pdf_path, "wb") as f:
                f.write(pdf_bytes)

            resultado = "exitosamente creado"
        except Exception as e:
            any_errors = True
            logger.exception("Error processing row '%s': %s", row, e)
            resultado = f"error: {str(e)}"

        result_rows.append([
            row["nombre"],
            row["curso"],
            row["fecha"],
            row["profesor"],
            resultado,
        ])

    # 4) Write result CSV
    with open(result_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(result_rows)

    # 5) Zip everything under work_dir
    zip_local_path = os.path.join("/tmp", f"{original_file_name}.zip")
    with zipfile.ZipFile(zip_local_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(work_dir):
            for name in files:
                full_path = os.path.join(root, name)
                rel_path = os.path.relpath(full_path, work_dir)
                zf.write(full_path, arcname=rel_path)

    # 6) Upload ZIP to S3 + build URL
    zip_url = upload_zip_to_s3(zip_local_path, csv_path_rel, original_file_name)

    # 7) Update batch status
    final_status = "completado" if not any_errors else "error"
    update_batch_status(batch_id, final_status, total_records, zip_url, error=None if not any_errors else "Some records failed")

    logger.info("Finished batch_id=%s with status=%s", batch_id, final_status)


# ===========================================================================
# Lambda handler
# ===========================================================================
def lambda_handler(event, context):
    """
    SQS event format:
    {
      "Records": [
        {
          "body": "{...json...}"
        },
        ...
      ]
    }
    """
    logger.info("Received event: %s", json.dumps(event))

    results = []
    for record in event.get("Records", []):
        try:
            body_str = record["body"]
            msg_body = json.loads(body_str)
            process_single_message(msg_body)
            results.append({"messageId": record.get("messageId"), "status": "OK"})
        except Exception as e:
            logger.exception("Error processing record: %s", e)
            # We log but let SQS redrive (DLQ etc.) handle retries
            results.append({"messageId": record.get("messageId"), "status": f"ERROR: {str(e)}"})

    return {
        "statusCode": 200,
        "results": results,
    }

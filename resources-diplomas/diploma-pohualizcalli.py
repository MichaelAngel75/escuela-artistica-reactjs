import pandas as pd
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import purple, gray
from io import BytesIO
import unicodedata
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.pagesizes import letter
from datetime import datetime
import os
from reportlab.lib.utils import ImageReader


# --------------------------------------------------------
# Lambda:

# query record batch-diploma by id
# update status by Id
# update Zip file by id
# - Leer diplomas template from S3 active one
# - Leer todas las firmas from S3
# - Guardar zip con todos los pdf generados
#  Order de posicionar los elementos
# // ------------------------------
#       - Nombre completo del alumno
#       - Curso 
#       - Firma del profesor
#       - Nombre completo del profesor
#       - Fecha:  <Mes> de <anio>

# --------------------------------------------------------

# Get the total width of the page
page_width = letter[0]

def centered_x_in_range(text: str, x_min: float, x_max: float, font_name: str, font_size: float) -> float:
    """
    Returns an x so that `text` is centered within [x_min, x_max], using the given font.
    Clamps to avoid overflow/cutting.
    """
    width = pdfmetrics.stringWidth(text, font_name, font_size)
    center = (x_min + x_max) / 2.0
    x = center - (width / 2.0)

    # Clamp so text stays fully inside the range
    left_bound = x_min
    right_bound = x_max - width
    if x < left_bound:
        x = left_bound
    if x > right_bound:
        x = right_bound

    return x


def fecha_a_espanol(fecha_str: str) -> str:
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ]

    fecha = datetime.strptime(fecha_str, "%Y-%m-%d")
    mes = meses[fecha.month - 1]
    return f"{mes} de {fecha.year}"

def clean_name(name):
    """
    Removes special characters (like accents) from a name for safe usage in filenames.
    :param name: The original name (string).
    :return: The cleaned name (string).
    """
    normalized = unicodedata.normalize('NFD', name)
    cleaned = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    cleaned = cleaned.replace(" ", "_").replace("/", "_").replace("\\", "_")
    return cleaned

def agregar_datos_a_certificado(template_pdf, csv_file, posiciones):
    """
    Genera certificados personalizados a partir de un PDF base y un archivo CSV.
    
    :param template_pdf: Ruta del PDF base del certificado.
    :param csv_file: Ruta del archivo CSV con los datos (nombre, curso, fecha).
    :param posiciones: Diccionario con las posiciones de los datos en el PDF.
    """
    # Leer datos desde el archivo CSV
    datos = pd.read_csv(csv_file)

    # Leer el PDF base
    pdf_reader = PdfReader(template_pdf)
    pdf_writer = PdfWriter()

    for _, row in datos.iterrows():
        # Clean the name for use in filenames
        nombre = ' '.join(word.capitalize() for word in row["nombre"].split())
        cleaned_name = clean_name(nombre)
        curso = row["curso"].upper()
        fecha = fecha_a_espanol(row["fecha"].strip())
        profesor = row["profesor"]
        image_firma_gif = "firmas/" + profesor.strip().lower().replace(" ", "_") + ".gif"

        
        output_pdf = f"certificado_{cleaned_name}.pdf"

        # Crear un PDF temporal con los datos superpuestos
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        
        # =============================================================================
        # ----   N O M B R E    --------------------
        text_width = pdfmetrics.stringWidth(nombre, "Helvetica-Bold", 24)
        # Calculate the centered x-coordinate based on the total page width
        centered_x_name = (page_width / 2) - (text_width / 2)
        # Fine-tuning offset for alignment
        fine_tune_offset = 60  # Adjust this value as needed to move right
        centered_x_name += fine_tune_offset

        # Estilo para el nombre (doble tamaño y púrpura)
        c.setFont("Helvetica-Bold", 24)  # Doble tamaño
        c.setFillColor(purple)          # Color púrpura
        c.drawString(centered_x_name, posiciones["nombre"][1], nombre)

        # =============================================================================
        # ----   C U R S O   --------------------
        text_width = pdfmetrics.stringWidth(curso, "Helvetica-Bold", 12)
        # Calculate the centered x-coordinate based on the total page width
        centered_x = (page_width / 2) - (text_width / 2)
        # Fine-tuning offset for alignment
        fine_tune_offset = 70  # Adjust this value as needed to move right
        centered_x += fine_tune_offset
        # Draw the text
        c.setFont("Helvetica-Bold", 12)  # Bold font
        c.setFillColorRGB(0.2, 0.2, 0.2)  # Darker gray
        c.drawString(centered_x, posiciones["curso"][1], curso)  # Uppercase and centered
    

        # =============================================================================
        # ----   F I R M A   (GIF) --------------------
        sig_x, sig_y = posiciones["profesor-signature"]
        sig_size = 125  # 30x30 square (points)

        try:
            # If image_firma_gif is a local path like "firmas/michael_torres.gif"
            if not os.path.exists(image_firma_gif):
                raise FileNotFoundError(f"Signature image not found: {image_firma_gif}")

            img = ImageReader(image_firma_gif)

            # mask="auto" tries to treat a background color as transparent (best-effort)
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
            # Don't kill the whole batch if one signature is missing
            print(f"[WARN] Could not render signature '{image_firma_gif}' for profesor='{profesor}': {e}")


        # =============================================================================
        # Estilo para la fecha (predeterminado)
        # PROFESOR (centered in x-range)
        prof_font = "Helvetica"
        prof_size = 12

        c.setFont(prof_font, prof_size)
        c.setFillColor("black")  

        # c.setFont("Helvetica", 12)     # Tamaño regular
        # c.setFillColor("black")        # Color negro
        (x_min, x_max), y_prof = posiciones["profesor"]
        x_prof = centered_x_in_range(profesor, x_min, x_max, prof_font, prof_size)
        c.drawString(x_prof, y_prof, profesor)

        # c.drawString(posiciones["profesor"][0], posiciones["profesor"][1], profesor)

        # =============================================================================
        # Estilo para la fecha (predeterminado)
        c.setFont("Helvetica", 12)     # Tamaño regular
        c.setFillColor("black")        # Color negro
        c.drawString(posiciones["fecha"][0], posiciones["fecha"][1], fecha)


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

# Rutas de los archivos
template_pdf = "constancia_vacio.pdf"  # Certificado base
csv_file = "diploma-datos.csv"         # Archivo CSV con los datos

# Posiciones (en puntos, desde la esquina inferior izquierda de la página)
posiciones = {
    "nombre": (190, 300),  # Posición del nombre          (x, y)
    "curso": (280, 253),   # Posición del curso/taller    (x, y)
    "profesor-signature": (442, 100),  # Position nombre profesor   (x, y)  take both values
    "profesor": ((433, 573), 97),  # Position nombre profesor   Minimum: (433-573, 97) Maximum: (404-602, 97) take both values  x 610 is cutting the letter
    "fecha": (418, 25)    # Posición de la fecha         (x, y)  take both values
}

# Llamar a la función para generar los certificados
agregar_datos_a_certificado(template_pdf, csv_file, posiciones)

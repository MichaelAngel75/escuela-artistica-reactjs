import pandas as pd
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import purple, gray
from io import BytesIO
import unicodedata
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.pagesizes import letter

# --------------------------------------------------------
# Lambda:

# query record batch-diploma by id
# update status by Id
# update Zip file by id
# - Leer diplomas template from S3 active one
# - Leer todas las firmas from S3
# - Guardar zip con todos los pdf generados
# --------------------------------------------------------

# Get the total width of the page
page_width = letter[0]

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
        # Estilo para la fecha (predeterminado)
        c.setFont("Helvetica", 12)     # Tamaño regular
        c.setFillColor("black")        # Color negro
        c.drawString(posiciones["fecha"][0], posiciones["fecha"][1], row["fecha"])


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
    "nombre": (190, 300),  # Posición del nombre
    "curso": (280, 253),   # Posición del curso/taller
    "fecha": (150, 150)    # Posición de la fecha
}

# Llamar a la función para generar los certificados
agregar_datos_a_certificado(template_pdf, csv_file, posiciones)

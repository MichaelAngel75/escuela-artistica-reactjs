import pandas as pd
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from io import BytesIO

# --------------------------------------------------------
# Lambda:

# query record batch-diploma by id
# update status by Id
# update Zip file by id
# - Leer diplomas template from S3 active one
# - Leer todas las firmas from S3
# - Guardar zip con todos los pdf generados
# --------------------------------------------------------

def agregar_datos_a_certificado(template_pdf, output_pdf, csv_file, posiciones):
    """
    Genera certificados personalizados a partir de un PDF base y un archivo CSV.
    
    :param template_pdf: Ruta del PDF base del certificado.
    :param output_pdf: Ruta del PDF generado.
    :param csv_file: Ruta del archivo CSV con los datos (nombre, curso, fecha).
    :param posiciones: Diccionario con las posiciones de los datos en el PDF.
    """
    # Leer datos desde el archivo CSV
    datos = pd.read_csv(csv_file)

    # Leer el PDF base
    pdf_reader = PdfReader(template_pdf)
    pdf_writer = PdfWriter()

    for _, row in datos.iterrows():
        # Crear un PDF temporal con los datos superpuestos
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=letter)
        
        # Escribir los datos en las posiciones específicas
        c.setFont("Helvetica-Bold", 12)
        c.drawString(posiciones["nombre"][0], posiciones["nombre"][1], row["nombre"])
        c.drawString(posiciones["curso"][0], posiciones["curso"][1], row["curso"])
        c.drawString(posiciones["fecha"][0], posiciones["fecha"][1], row["fecha"])
        c.save()

        buffer.seek(0)
        
        # Leer el contenido del PDF generado temporalmente
        pdf_temp = PdfReader(buffer)

        # Tomar la primera página del PDF base
        page = pdf_reader.pages[0]

        # Superponer el contenido del PDF temporal en el PDF base
        page.merge_page(pdf_temp.pages[0])
        pdf_writer.add_page(page)

    # Guardar el nuevo PDF generado
    with open(output_pdf, "wb") as f:
        pdf_writer.write(f)

# Rutas de los archivos
template_pdf = "certificado_base.pdf"  # Certificado base
output_pdf = "certificados_generados.pdf"  # Certificados generados
csv_file = "datos.csv"  # Archivo CSV con los datos

# Posiciones (en puntos, desde la esquina inferior izquierda de la página)
posiciones = {
    "nombre": (150, 400),  # Posición del nombre
    "curso": (150, 350),  # Posición del curso/taller
    "fecha": (150, 300)   # Posición de la fecha
}

# Llamar a la función para generar los certificados
agregar_datos_a_certificado(template_pdf, output_pdf, csv_file, posiciones)

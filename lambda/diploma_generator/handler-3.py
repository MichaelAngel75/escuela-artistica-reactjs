"""
curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/signatures
curl -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' http://localhost:5000/internal/templates/active

curl -X POST 'http://localhost:5000/internal/reload-api-key' \
  -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@'

curl -X PATCH 'http://localhost:5000/internal/diploma-batches/1' \
  -H 'Content-Type: application/json' \
  -H 'api-key-pohualizcalli: HOLA-mUNDO-COMO-3mejor-esto!@' \
  -d '{
    "status": "completado",
    "totalRecords": 0
  }'



AWS Lambda function for diploma PDF generation.

This Lambda reads CSV data from S3, generates individual diploma PDFs using a template,
embeds signature images, and uploads a ZIP archive of all diplomas back to S3.

Environment Variables:
    - TEMPLATE_BUCKET: S3 bucket containing PDF templates
    - TEMPLATE_KEY: S3 key for the default template (optional, can be in event)
    - SIGNATURES_BUCKET: S3 bucket containing signature images
    - OUTPUT_BUCKET: S3 bucket for generated ZIP files

Event Structure:
    {
        "csv_bucket": "my-bucket",
        "csv_key": "uploads/students.csv",
        "template_key": "templates/diploma_template.pdf" (optional),
        "output_bucket": "my-output-bucket" (optional, uses OUTPUT_BUCKET env var),
        "batch_id": "batch_123",
        "callback_url": "https://api.example.com/webhook" (optional)
    }

Endpoint to retrieve all available signatures
Endpoint to retrieve the only active empty template
Endpoint to retrieve information on the process
Update different values on the process


"""

import os
import io
import csv
import json
import zipfile
import tempfile
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from urllib.parse import unquote_plus

import boto3
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
from pypdf import PdfReader, PdfWriter

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize S3 client
s3_client = boto3.client('s3')

# Constants
TEMP_DIR = '/tmp'
TEXT_COLOR = Color(0.1, 0.1, 0.3)  # Deep royal blue


class DiplomaGeneratorError(Exception):
    """Custom exception for diploma generation errors."""
    pass


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler function.
    
    Args:
        event: Lambda event containing S3 bucket/key information
        context: Lambda context object
        
    Returns:
        Dict with status, generated count, and zip key
    """
    logger.info(f"Received event: {json.dumps(event)}")
    
    try:
        # Handle S3 trigger event format
        if 'Records' in event:
            # S3 trigger event
            record = event['Records'][0]['s3']
            csv_bucket = record['bucket']['name']
            csv_key = unquote_plus(record['object']['key'])
            batch_id = csv_key.split('/')[-1].replace('.csv', '')
            template_key = os.environ.get('TEMPLATE_KEY')
            output_bucket = os.environ.get('OUTPUT_BUCKET', csv_bucket)
        else:
            # Direct invocation event
            csv_bucket = event['csv_bucket']
            csv_key = event['csv_key']
            batch_id = event.get('batch_id', datetime.now().strftime('%Y%m%d_%H%M%S'))
            template_key = event.get('template_key', os.environ.get('TEMPLATE_KEY'))
            output_bucket = event.get('output_bucket', os.environ.get('OUTPUT_BUCKET', csv_bucket))
        
        callback_url = event.get('callback_url')
        
        logger.info(f"Processing batch {batch_id} from {csv_bucket}/{csv_key}")
        
        # Download and parse CSV
        csv_data = download_csv_from_s3(csv_bucket, csv_key)
        if not csv_data:
            raise DiplomaGeneratorError("No valid records found in CSV")
        
        logger.info(f"Parsed {len(csv_data)} records from CSV")
        
        # Download template if provided
        template_bytes = None
        if template_key:
            template_bucket = os.environ.get('TEMPLATE_BUCKET', csv_bucket)
            template_bytes = download_file_from_s3(template_bucket, template_key)
            logger.info(f"Downloaded template from {template_bucket}/{template_key}")
        
        # Load signature mappings
        signatures = load_signatures()
        
        # Generate diplomas
        generated_files = []
        batch_dir = os.path.join(TEMP_DIR, f'batch_{batch_id}')
        os.makedirs(batch_dir, exist_ok=True)
        
        for idx, row in enumerate(csv_data):
            try:
                pdf_bytes = generate_diploma(row, template_bytes, signatures)
                filename = sanitize_filename(
                    f"diploma_{idx + 1}_{row['first_name']}_{row['last_name']}.pdf"
                )
                filepath = os.path.join(batch_dir, filename)
                
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                
                generated_files.append(filepath)
                logger.info(f"Generated diploma {idx + 1}/{len(csv_data)}: {filename}")
                
            except Exception as e:
                logger.error(f"Error generating diploma for row {idx + 1}: {str(e)}")
                continue
        
        if not generated_files:
            raise DiplomaGeneratorError("No diplomas were generated successfully")
        
        # Create ZIP archive
        zip_filename = f"diplomas_{batch_id}.zip"
        zip_path = os.path.join(TEMP_DIR, zip_filename)
        create_zip_archive(generated_files, zip_path)
        logger.info(f"Created ZIP archive with {len(generated_files)} files")
        
        # Upload ZIP to S3
        zip_key = f"generated/{batch_id}/{zip_filename}"
        upload_file_to_s3(zip_path, output_bucket, zip_key)
        logger.info(f"Uploaded ZIP to {output_bucket}/{zip_key}")
        
        # Cleanup temp files
        cleanup_temp_files(batch_dir, zip_path)
        
        # Send callback if URL provided
        if callback_url:
            send_callback(callback_url, {
                'batch_id': batch_id,
                'status': 'completed',
                'generated_count': len(generated_files),
                'zip_bucket': output_bucket,
                'zip_key': zip_key
            })
        
        return {
            'statusCode': 200,
            'body': {
                'status': 'completed',
                'batch_id': batch_id,
                'generated_count': len(generated_files),
                'total_records': len(csv_data),
                'zip_bucket': output_bucket,
                'zip_key': zip_key,
                'zip_url': f"s3://{output_bucket}/{zip_key}"
            }
        }
        
    except Exception as e:
        logger.error(f"Diploma generation failed: {str(e)}", exc_info=True)
        
        error_response = {
            'statusCode': 500,
            'body': {
                'status': 'failed',
                'error': str(e),
                'batch_id': event.get('batch_id', 'unknown')
            }
        }
        
        # Send failure callback if URL provided
        if event.get('callback_url'):
            send_callback(event['callback_url'], {
                'batch_id': event.get('batch_id', 'unknown'),
                'status': 'failed',
                'error': str(e)
            })
        
        return error_response


def download_csv_from_s3(bucket: str, key: str) -> List[Dict[str, str]]:
    """
    Download and parse CSV file from S3.
    
    Args:
        bucket: S3 bucket name
        key: S3 object key
        
    Returns:
        List of dictionaries with normalized column names
    """
    response = s3_client.get_object(Bucket=bucket, Key=key)
    content = response['Body'].read().decode('utf-8')
    
    # Parse CSV
    reader = csv.DictReader(io.StringIO(content))
    
    data = []
    for row in reader:
        # Normalize column names
        normalized = normalize_row(row)
        if normalized.get('first_name') or normalized.get('last_name'):
            data.append(normalized)
    
    return data


def normalize_row(row: Dict[str, str]) -> Dict[str, str]:
    """
    Normalize CSV column names to standard format.
    
    Args:
        row: Dictionary with original column names
        
    Returns:
        Dictionary with normalized column names
    """
    normalized = {}
    
    for key, value in row.items():
        key_lower = key.lower().strip().replace(' ', '_')
        
        # Map common variations to standard names
        if 'first' in key_lower and 'name' in key_lower:
            normalized['first_name'] = value.strip()
        elif 'last' in key_lower and 'name' in key_lower:
            normalized['last_name'] = value.strip()
        elif 'professor' in key_lower or 'instructor' in key_lower or 'prof' in key_lower:
            normalized['professor_name'] = value.strip()
        elif 'course' in key_lower or 'program' in key_lower or 'subject' in key_lower:
            normalized['course_name'] = value.strip()
        elif 'signature' in key_lower or 'sign' in key_lower:
            normalized['signature_key'] = value.strip()
    
    return normalized


def download_file_from_s3(bucket: str, key: str) -> bytes:
    """Download file from S3 and return bytes."""
    response = s3_client.get_object(Bucket=bucket, Key=key)
    return response['Body'].read()


def load_signatures() -> Dict[str, bytes]:
    """
    Load signature images from S3.
    
    Returns:
        Dictionary mapping professor names to image bytes
    """
    signatures = {}
    signatures_bucket = os.environ.get('SIGNATURES_BUCKET')
    signatures_prefix = os.environ.get('SIGNATURES_PREFIX', 'signatures/')
    
    if not signatures_bucket:
        logger.warning("SIGNATURES_BUCKET not set, skipping signature loading")
        return signatures
    
    try:
        response = s3_client.list_objects_v2(
            Bucket=signatures_bucket,
            Prefix=signatures_prefix
        )
        
        for obj in response.get('Contents', []):
            key = obj['Key']
            # Extract professor name from filename (e.g., "signatures/dr_jane_smith.png")
            filename = os.path.basename(key)
            name_part = os.path.splitext(filename)[0].replace('_', ' ').lower()
            
            try:
                img_bytes = download_file_from_s3(signatures_bucket, key)
                signatures[name_part] = img_bytes
                logger.info(f"Loaded signature for: {name_part}")
            except Exception as e:
                logger.warning(f"Failed to load signature {key}: {str(e)}")
                
    except Exception as e:
        logger.warning(f"Failed to list signatures: {str(e)}")
    
    return signatures


def generate_diploma(
    row: Dict[str, str],
    template_bytes: Optional[bytes],
    signatures: Dict[str, bytes]
) -> bytes:
    """
    Generate a diploma PDF for a single student.
    
    If a template PDF is provided, the student data is overlaid on top of it.
    Otherwise, a default certificate design is generated.
    
    Args:
        row: Dictionary with student data
        template_bytes: Optional PDF template bytes
        signatures: Dictionary of professor signatures
        
    Returns:
        PDF bytes
    """
    # Create overlay PDF with student data
    overlay_buffer = io.BytesIO()
    
    # Determine page size from template or use default
    if template_bytes:
        try:
            template_reader = PdfReader(io.BytesIO(template_bytes))
            template_page = template_reader.pages[0]
            width = float(template_page.mediabox.width)
            height = float(template_page.mediabox.height)
        except Exception as e:
            logger.warning(f"Could not read template dimensions: {e}, using letter size")
            width, height = letter
    else:
        width, height = letter
    
    # Create overlay canvas
    c = canvas.Canvas(overlay_buffer, pagesize=(width, height))
    
    # If no template, draw decorative border
    if not template_bytes:
        draw_border(c, width, height)
        
        # Draw title for fallback design
        c.setFillColor(TEXT_COLOR)
        c.setFont("Helvetica-Bold", 36)
        title = "Certificate of Completion"
        title_width = c.stringWidth(title, "Helvetica-Bold", 36)
        c.drawString((width - title_width) / 2, height - 150, title)
        
        # Draw "This certifies that" text
        c.setFont("Helvetica", 14)
        certify_text = "This is to certify that"
        certify_width = c.stringWidth(certify_text, "Helvetica", 14)
        c.drawString((width - certify_width) / 2, height - 220, certify_text)
    
    # Draw student name (positioned for both template and fallback)
    c.setFillColor(TEXT_COLOR)
    full_name = f"{row.get('first_name', '')} {row.get('last_name', '')}".strip()
    c.setFont("Helvetica-Bold", 28)
    name_width = c.stringWidth(full_name, "Helvetica-Bold", 28)
    c.drawString((width - name_width) / 2, height - 280, full_name)
    
    # Draw underline for name (only if no template)
    if not template_bytes:
        c.setStrokeColor(TEXT_COLOR)
        c.setLineWidth(1)
        line_start = (width - name_width) / 2 - 20
        line_end = (width + name_width) / 2 + 20
        c.line(line_start, height - 285, line_end, height - 285)
        
        # Draw "has successfully completed" text
        c.setFont("Helvetica", 14)
        complete_text = "has successfully completed the course"
        complete_width = c.stringWidth(complete_text, "Helvetica", 14)
        c.drawString((width - complete_width) / 2, height - 330, complete_text)
    
    # Draw course name
    course_name = row.get('course_name', 'Course Name')
    c.setFont("Helvetica-Bold", 22)
    course_width = c.stringWidth(course_name, "Helvetica-Bold", 22)
    c.drawString((width - course_width) / 2, height - 360, course_name)
    
    # Draw date
    current_date = datetime.now().strftime("%B %d, %Y")
    c.setFont("Helvetica", 12)
    date_text = f"Date: {current_date}"
    date_width = c.stringWidth(date_text, "Helvetica", 12)
    c.drawString((width - date_width) / 2, height - 420, date_text)
    
    # Draw signature section
    professor_name = row.get('professor_name', '')
    
    # Try to find and draw signature image
    if professor_name:
        professor_key = professor_name.lower().replace('.', '').replace(' ', '_')
        
        # Try different name formats
        for key in [professor_key, professor_name.lower()]:
            if key in signatures:
                try:
                    draw_signature(c, signatures[key], width, height)
                    break
                except Exception as e:
                    logger.warning(f"Failed to draw signature: {str(e)}")
    
    # Draw signature line
    sig_line_y = height - 520
    c.setStrokeColor(TEXT_COLOR)
    c.line(width/2 - 100, sig_line_y, width/2 + 100, sig_line_y)
    
    # Draw professor name
    if professor_name:
        c.setFont("Helvetica-Bold", 14)
        prof_width = c.stringWidth(professor_name, "Helvetica-Bold", 14)
        c.drawString((width - prof_width) / 2, sig_line_y - 20, professor_name)
        
        # Draw "Instructor" label
        c.setFont("Helvetica", 10)
        label = "Instructor"
        label_width = c.stringWidth(label, "Helvetica", 10)
        c.drawString((width - label_width) / 2, sig_line_y - 35, label)
    
    c.save()
    
    # If we have a template, merge the overlay with it
    if template_bytes:
        try:
            # Read the template
            template_reader = PdfReader(io.BytesIO(template_bytes))
            overlay_reader = PdfReader(io.BytesIO(overlay_buffer.getvalue()))
            
            # Create output writer
            writer = PdfWriter()
            
            # Get the template page and merge with overlay
            template_page = template_reader.pages[0]
            overlay_page = overlay_reader.pages[0]
            
            # Merge overlay onto template
            template_page.merge_page(overlay_page)
            
            # Add merged page to output
            writer.add_page(template_page)
            
            # Write to output buffer
            output_buffer = io.BytesIO()
            writer.write(output_buffer)
            
            return output_buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Failed to merge with template: {e}, returning overlay only")
            return overlay_buffer.getvalue()
    else:
        return overlay_buffer.getvalue()


def draw_border(c: canvas.Canvas, width: float, height: float):
    """Draw decorative border on the certificate."""
    # Gold color for border
    gold = Color(0.83, 0.69, 0.22)
    c.setStrokeColor(gold)
    c.setLineWidth(3)
    
    # Outer border
    margin = 30
    c.rect(margin, margin, width - 2*margin, height - 2*margin)
    
    # Inner border
    c.setLineWidth(1)
    inner_margin = 40
    c.rect(inner_margin, inner_margin, width - 2*inner_margin, height - 2*inner_margin)


def draw_signature(c: canvas.Canvas, img_bytes: bytes, width: float, height: float):
    """
    Draw signature image on the canvas.
    
    Args:
        c: ReportLab canvas
        img_bytes: Image bytes
        width: Page width
        height: Page height
    """
    # Load image with PIL
    img = Image.open(io.BytesIO(img_bytes))
    
    # Convert to RGB if necessary
    if img.mode in ('RGBA', 'P'):
        img = img.convert('RGB')
    
    # Save to temp file for ReportLab
    temp_path = os.path.join(TEMP_DIR, 'temp_signature.jpg')
    img.save(temp_path, 'JPEG')
    
    # Calculate dimensions (max 150px wide, maintain aspect ratio)
    max_width = 150
    aspect = img.height / img.width
    sig_width = min(max_width, img.width)
    sig_height = sig_width * aspect
    
    # Position above the signature line
    sig_x = (width - sig_width) / 2
    sig_y = height - 510
    
    c.drawImage(temp_path, sig_x, sig_y, width=sig_width, height=sig_height)
    
    # Cleanup
    if os.path.exists(temp_path):
        os.remove(temp_path)


def create_zip_archive(files: List[str], output_path: str):
    """
    Create a ZIP archive from a list of files.
    
    Args:
        files: List of file paths to include
        output_path: Path for the output ZIP file
    """
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for filepath in files:
            arcname = os.path.basename(filepath)
            zipf.write(filepath, arcname)


def upload_file_to_s3(filepath: str, bucket: str, key: str):
    """Upload a file to S3."""
    with open(filepath, 'rb') as f:
        s3_client.put_object(
            Bucket=bucket,
            Key=key,
            Body=f.read(),
            ContentType='application/zip'
        )


def cleanup_temp_files(batch_dir: str, zip_path: str):
    """Clean up temporary files."""
    import shutil
    
    try:
        if os.path.exists(batch_dir):
            shutil.rmtree(batch_dir)
        if os.path.exists(zip_path):
            os.remove(zip_path)
    except Exception as e:
        logger.warning(f"Cleanup error: {str(e)}")


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe file system storage."""
    import re
    return re.sub(r'[^a-zA-Z0-9._-]', '_', filename)


def send_callback(url: str, data: Dict[str, Any]):
    """
    Send a callback notification to the provided URL.
    
    Args:
        url: Callback URL
        data: Data to send
    """
    import urllib.request
    
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            logger.info(f"Callback sent successfully: {response.status}")
    except Exception as e:
        logger.error(f"Failed to send callback: {str(e)}")


# # For local testing
# if __name__ == "__main__":
#     # Test event
#     test_event = {
#         "csv_bucket": "test-bucket",
#         "csv_key": "test/students.csv",
#         "batch_id": "test_batch_001"
#     }
    
#     print("Lambda handler module loaded successfully")
#     print("To test locally, set up AWS credentials and S3 buckets")



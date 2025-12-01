# Diploma Generator AWS Lambda

This Lambda function generates diploma PDFs from CSV data uploaded to S3.

## Features

- Parses CSV files with student data
- Generates individual diploma PDFs with:
  - Student name
  - Course name
  - Current date
  - Professor signature (if available)
  - Professor name
- Creates ZIP archive of all generated diplomas
- Uploads ZIP to S3
- Supports S3 event triggers and direct invocation
- Optional webhook callback on completion

## CSV Format

The CSV file should contain the following columns (case-insensitive, various naming conventions supported):

| Column | Description | Example |
|--------|-------------|---------|
| FirstName / first_name | Student's first name | John |
| LastName / last_name | Student's last name | Doe |
| Professor Name / professor | Professor/instructor name | Dr. Jane Smith |
| Course Name / course | Course/program name | Computer Science 101 |
| Signature (optional) | Signature image key | signatures/dr_smith.png |

### Example CSV

```csv
FirstName,LastName,Professor Name,Course Name
John,Doe,Dr. Jane Smith,Computer Science 101
Maria,Garcia,Dr. Jane Smith,Computer Science 101
James,Wilson,Prof. Robert Brown,Data Science Fundamentals
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| TEMPLATE_BUCKET | No | S3 bucket containing PDF templates |
| TEMPLATE_KEY | No | S3 key for the default template |
| SIGNATURES_BUCKET | No | S3 bucket containing signature images |
| SIGNATURES_PREFIX | No | Prefix for signature files (default: `signatures/`) |
| OUTPUT_BUCKET | Yes | S3 bucket for generated ZIP files |

## Event Structure

### S3 Trigger Event

The Lambda automatically triggers when a CSV file is uploaded to the configured S3 bucket.

### Direct Invocation Event

```json
{
    "csv_bucket": "my-bucket",
    "csv_key": "uploads/students.csv",
    "template_key": "templates/diploma_template.pdf",
    "output_bucket": "my-output-bucket",
    "batch_id": "batch_123",
    "callback_url": "https://api.example.com/webhook"
}
```

## Response

### Success Response

```json
{
    "statusCode": 200,
    "body": {
        "status": "completed",
        "batch_id": "batch_123",
        "generated_count": 50,
        "total_records": 50,
        "zip_bucket": "my-output-bucket",
        "zip_key": "generated/batch_123/diplomas_batch_123.zip",
        "zip_url": "s3://my-output-bucket/generated/batch_123/diplomas_batch_123.zip"
    }
}
```

### Failure Response

```json
{
    "statusCode": 500,
    "body": {
        "status": "failed",
        "error": "Error message",
        "batch_id": "batch_123"
    }
}
```

## Deployment

### Using AWS SAM

1. Install AWS SAM CLI:
   ```bash
   pip install aws-sam-cli
   ```

2. Build the Lambda package:
   ```bash
   sam build
   ```

3. Deploy:
   ```bash
   sam deploy --guided
   ```

### Manual Deployment

1. Create a deployment package:
   ```bash
   pip install -r requirements.txt -t package/
   cp handler.py package/
   cd package && zip -r ../deployment.zip . && cd ..
   ```

2. Upload to AWS Lambda via Console or CLI

## Signature Images

Signature images should be stored in S3 with filenames matching professor names:
- `signatures/dr_jane_smith.png`
- `signatures/prof_robert_brown.png`

The function will automatically match signatures to professors by normalizing names.

## Limits

- Maximum Lambda execution time: 5 minutes (configurable up to 15 min)
- Memory: 1024 MB (configurable)
- /tmp storage: 512 MB (consider this for large batches)
- For very large batches (1000+ diplomas), consider using Step Functions

## Monitoring

- CloudWatch Logs: `/aws/lambda/diploma-generator-{environment}`
- CloudWatch Metrics: Standard Lambda metrics available
- Enable X-Ray tracing for detailed performance analysis

## Local Testing

```python
# Set AWS credentials
export AWS_ACCESS_KEY_ID=your_key
export AWS_SECRET_ACCESS_KEY=your_secret
export AWS_DEFAULT_REGION=us-east-1

# Test the handler
python -c "from handler import handler; print(handler({'csv_bucket': 'test', 'csv_key': 'test.csv'}, None))"
```
==================================

lambda/diploma_generator/
├── handler.py          # Main Lambda handler
├── requirements.txt    # Python dependencies
├── template.yaml       # AWS SAM deployment template
├── build.sh            # Build script for deployment package
├── sample_students.csv # Sample CSV for testing
└── README.md           # Documentation


Features

CSV Parsing - Reads student data with flexible column names:
    FirstName / first_name
    LastName / last_name
    Professor Name / professor / instructor
    Course Name / course / program

Template Integration - Uses PyPDF to merge content with your PDF template:
    Overlays student data on top of the template
    Falls back to a default certificate design if no template

Signature Embedding - Loads signature images from S3 matched by professor name

Date Stamping - Adds current date to each diploma

ZIP Output - Creates and uploads ZIP archive to S3



---------------------


Deployment Options
Using AWS SAM:
cd lambda/diploma_generator
sam build
sam deploy --guided

Manual deployment:
cd lambda/diploma_generator
./build.sh
REM Upload build/deployment.zip to Lambda



Environment Variables
Variable	Description
TEMPLATE_BUCKET	S3 bucket with PDF templates
SIGNATURES_BUCKET	S3 bucket with signature images
OUTPUT_BUCKET	S3 bucket for generated ZIPs


The Lambda can be triggered by S3 events (when CSV is uploaded) or invoked directly with a JSON payload.



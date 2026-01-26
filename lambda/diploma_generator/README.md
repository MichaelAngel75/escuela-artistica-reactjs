# Diploma Generator Lambda

AWS Lambda function that generates diploma PDFs from CSV data, triggered by SQS messages.

## Overview

This Lambda function:
1. Receives SQS messages containing batch information (CSV URL, batch ID)
2. Downloads student data from CSV file stored in S3
3. Fetches diploma configuration from internal REST API (templates, signatures, field positions)
4. Generates individual PDF diplomas for each student
5. Creates a ZIP archive with all diplomas + result CSV
6. Uploads ZIP to S3 and updates batch status via REST API

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│   Client    │────▶│  SQS Queue  │────▶│  Lambda Function │
└─────────────┘     └─────────────┘     └────────┬─────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ▼                            ▼                            ▼
            ┌───────────────┐          ┌─────────────────┐          ┌─────────────────┐
            │  S3 (CSV/ZIP) │          │   Admin API     │          │  SSM Parameters │
            │               │          │  - /signatures  │          │  (API Keys)     │
            └───────────────┘          │  - /templates   │          └─────────────────┘
                                       │  - /config      │
                                       └─────────────────┘
```

## SQS Message Format

```json
{
  "created_by": "user@example.com",
  "file_name": "diploma-datos-02.csv",
  "csv_url": "https://files.example.com/generacion-diplomas/generated-diplomas/2026-01-25/proceso-3/diploma-datos-02.csv",
  "batch_id": 3
}
```

## CSV Input Format

```csv
nombre,curso,fecha,profesor
Juan Pérez,Curso de Python,2024-01-29,Oscar Pimentel
Ana Gómez,Taller de Matemáticas,01/03/2024,Oscar Pimentel
Carlos López,Taller de Machine Learning,Marzo de 2025,Mauricio Sanchez
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `POHUALIZCALLI_API_KEY` | API key for internal REST endpoints | Yes |
| `POHUALIZCALLI_ADMIN_BASE_URL` | Base URL for admin API (e.g., `https://admin.example.com/internal`) | Yes |
| `POHUALIZCALLI_RESOURCES_BASE_URL` | Base URL for resources (e.g., `https://files.example.com`) | Yes |
| `POHUALIZCALLI_RESOURCES_BUCKET` | S3 bucket name for uploading ZIP files | Yes |

---

## Local Development with SAM CLI

### Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker](https://www.docker.com/products/docker-desktop/)
- Python 3.11
- AWS CLI configured with appropriate profile

### Setup

1. **Navigate to Lambda directory:**
   ```bash
   cd lambda/diploma_generator
   ```

2. **Configure environment variables:**

   Edit `env.json` with your real values:
   ```json
   {
     "DiplomaGeneratorFunction": {
       "POHUALIZCALLI_API_KEY": "your-real-api-key-here",
       "POHUALIZCALLI_ADMIN_BASE_URL": "https://admin.pohualizcalli.com/internal",
       "POHUALIZCALLI_RESOURCES_BASE_URL": "https://files.pohualizcalli-02.com",
       "POHUALIZCALLI_RESOURCES_BUCKET": "files.pohualizcalli-02.com"
     }
   }
   ```

3. **Configure test event:**

   Edit `events/sqs-test-event.json` with your test data:
   ```json
   {
     "Records": [
       {
         "messageId": "test-message-001",
         "body": "{\"created_by\":\"test@example.com\",\"file_name\":\"diploma-datos.csv\",\"csv_url\":\"https://your-bucket.com/path/to/diploma-datos.csv\",\"batch_id\":1}",
         "eventSource": "aws:sqs",
         "awsRegion": "us-east-1"
       }
     ]
   }
   ```

### Running Locally

```bash
# Build the Lambda
sam build --template template-local.yaml

# Build the Lambda (in a container x86_64 vs Mac ARM)
sam build --template template-local.yaml --use-container

# Invoke with test event
sam local invoke DiplomaGeneratorFunction \
  --template template-local.yaml \
  --event events/sqs-test-event.json \
  --env-vars env.json \
  --profile pohualizcalliTerraform

# Run with debug logging
sam local invoke DiplomaGeneratorFunction \
  --template template-local.yaml \
  --event events/sqs-test-event.json \
  --env-vars env.json \
  --profile pohualizcalliTerraform \
  --debug
```

### Start Local Lambda Endpoint

For integration testing:
```bash
sam local start-lambda \
  --template template-local.yaml \
  --env-vars env.json \
  --profile pohualizcalliTerraform \
  --port 3001
```

---

## AWS Deployment

### Option 1: Deploy with SAM CLI

```bash
# Build
sam build --template template-local.yaml

# Deploy (guided - first time)
sam deploy --guided --profile pohualizcalliTerraform

# Deploy (subsequent)
sam deploy --profile pohualizcalliTerraform
```

### Option 2: Manual Deployment

1. **Create deployment package:**
   ```bash
   # Install dependencies
   pip install -r requirements.txt -t ./package

   # Copy handler
   cp handler.py ./package/

   # Create ZIP
   cd package && zip -r ../deployment.zip . && cd ..
   ```

2. **Upload to Lambda via AWS Console or CLI:**
   ```bash
   aws lambda update-function-code \
     --function-name diploma-generator-prod \
     --zip-file fileb://deployment.zip \
     --profile pohualizcalliTerraform
   ```

### Option 3: Deploy with Terraform

Create `main.tf`:
```hcl
resource "aws_lambda_function" "diploma_generator" {
  function_name = "diploma-generator-${var.environment}"
  role          = aws_iam_role.lambda_role.arn
  handler       = "handler.lambda_handler"
  runtime       = "python3.11"
  timeout       = 300
  memory_size   = 1024

  filename         = "deployment.zip"
  source_code_hash = filebase64sha256("deployment.zip")

  environment {
    variables = {
      "POHUALIZCALLI_API_KEY"         = var.api_key
      "POHUALIZCALLI_ADMIN_BASE_URL"         = var.admin_base_url
      "POHUALIZCALLI_RESOURCES_BASE_URL" = var.resources_base_url
      "POHUALIZCALLI_RESOURCES_BUCKET"   = var.resources_bucket
    }
  }

  # VPC Configuration (if using private subnet)
  # vpc_config {
  #   subnet_ids         = var.private_subnet_ids
  #   security_group_ids = [aws_security_group.lambda_sg.id]
  # }
}

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = aws_sqs_queue.diploma_queue.arn
  function_name    = aws_lambda_function.diploma_generator.arn
  batch_size       = 1
}
```

---

## IAM Permissions

### Required IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::files.pohualizcalli-02.com",
        "arn:aws:s3:::files.pohualizcalli-02.com/*"
      ]
    },
    {
      "Sid": "SQSAccess",
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:us-east-1:*:pohualizcalli-diploma-generation-sqs"
    },
    {
      "Sid": "SSMParameterAccess",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:us-east-1:*:parameter/pohualizcalli/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:*:log-group:/aws/lambda/diploma-generator-*:*"
    }
  ]
}
```

### If Using VPC (add these permissions)

```json
{
  "Sid": "VPCNetworkInterfaces",
  "Effect": "Allow",
  "Action": [
    "ec2:CreateNetworkInterface",
    "ec2:DescribeNetworkInterfaces",
    "ec2:DeleteNetworkInterface",
    "ec2:AssignPrivateIpAddresses",
    "ec2:UnassignPrivateIpAddresses"
  ],
  "Resource": "*"
}
```

### Lambda Trust Policy (Role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.aws.amazon.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

---

## VPC Recommendations

### Decision Matrix

| Factor | Public Subnet | Private Subnet | No VPC |
|--------|---------------|----------------|--------|
| Internet access | Direct via IGW | Via NAT Gateway | Direct |
| Security | Less secure (public IP) | Most secure (no public IP) | Medium |
| Cost | Lower (no NAT) | Higher (NAT ~$32/mo) | Lowest |
| Cold start | Faster | Slower (+1-2s for ENI) | Fastest |
| Compliance | May not meet requirements | Meets most compliance | Depends |

### Recommendation: **No VPC** (for this use case)

For this Lambda, I recommend **NOT using a VPC** because:

1. **All external resources are public HTTPS endpoints:**
   - Admin API (`https://admin.pohualizcalli.com`) - public with API key auth
   - S3 bucket (`files.pohualizcalli-02.com`) - accessible via IAM
   - No private databases or internal services to access

2. **Benefits of No VPC:**
   - Faster cold starts (no ENI provisioning)
   - Lower cost (no NAT Gateway fees)
   - Simpler configuration
   - No VPC capacity issues

3. **Security is maintained via:**
   - API key authentication for REST endpoints
   - IAM roles for S3 access
   - HTTPS encryption in transit
   - CloudWatch logging for audit

### When to Use Private Subnet

Use a **private subnet with NAT Gateway** if:
- You need to access resources inside a VPC (RDS, ElastiCache, internal APIs)
- Compliance requires network isolation (PCI-DSS, HIPAA)
- You want to control egress traffic via security groups

### Private Subnet Architecture (if needed)

```
┌─────────────────────────────────────────────────────────────────┐
│                            VPC                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Private Subnet                        │    │
│  │   ┌──────────────┐                                      │    │
│  │   │    Lambda    │──────┐                               │    │
│  │   └──────────────┘      │                               │    │
│  │          │              │                               │    │
│  │          │              ▼                               │    │
│  │          │    ┌─────────────────┐                       │    │
│  │          │    │  S3 VPC Endpoint │ ───▶ S3 Bucket       │    │
│  │          │    └─────────────────┘                       │    │
│  │          │                                              │    │
│  │          ▼                                              │    │
│  │   ┌─────────────┐                                       │    │
│  │   │ NAT Gateway │ ───▶ Internet Gateway ───▶ Admin API  │    │
│  │   └─────────────┘                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

If using VPC, add these endpoints to reduce NAT costs:
```hcl
# S3 Gateway Endpoint (free)
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = var.vpc_id
  service_name = "com.amazonaws.us-east-1.s3"
  route_table_ids = var.private_route_table_ids
}

# SSM Interface Endpoint (if using SSM)
resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = var.vpc_id
  service_name        = "com.amazonaws.us-east-1.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = var.private_subnet_ids
  security_group_ids  = [aws_security_group.vpce_sg.id]
  private_dns_enabled = true
}
```

---

## Monitoring & Troubleshooting

### CloudWatch Logs

```bash
# View recent logs
aws logs tail /aws/lambda/diploma-generator-prod --follow --profile pohualizcalliTerraform

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/diploma-generator-prod \
  --filter-pattern "ERROR" \
  --profile pohualizcalliTerraform
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Unable to import module 'handler'` | Missing dependencies | Rebuild with `sam build` |
| `Task timed out` | Processing too slow | Increase timeout to 300s+ |
| `No signature found` | Professor name mismatch | Check signature API response |
| `Access Denied` on S3 | Missing IAM permissions | Add S3 permissions to role |
| `Connection refused` | VPC without NAT | Add NAT Gateway or remove VPC |
| `Missing required env var` | Environment not configured | Set all required env vars |

### Test SQS Message Manually

```bash
aws sqs send-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/pohualizcalli-diploma-generation-sqs \
  --message-body '{"created_by":"test@example.com","file_name":"test.csv","csv_url":"https://files.example.com/test.csv","batch_id":99}' \
  --profile pohualizcalliTerraform
```

---

## File Structure

```
lambda/diploma_generator/
├── handler.py              # Main Lambda handler
├── requirements.txt        # Python dependencies
├── template-local.yaml     # SAM template for local testing (SQS trigger)
├── template.yaml           # SAM template for deployment (S3 trigger - legacy)
├── env.json                # Local environment variables (gitignored)
├── events/
│   └── sqs-test-event.json # Test SQS event
├── build.sh                # Build script for deployment package
└── README.md               # This file
```

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| boto3 | >=1.34.0 | AWS SDK (S3, SQS, SSM) |
| reportlab | >=4.0.0 | PDF generation |
| Pillow | >=10.0.0 | Image processing |
| PyPDF2 | >=3.0.0 | PDF merging |
| requests | >=2.31.0 | HTTP client for REST APIs |

---

## API Endpoints Used

The Lambda calls these internal API endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/signatures` | GET | Fetch all professor signatures |
| `/templates/active` | GET | Get active diploma template PDF |
| `/configuration` | GET | Get field mappings (positions, fonts) |
| `/diploma-batches/{id}` | PATCH | Update batch status and ZIP URL |

All endpoints require `api-key-pohualizcalli` header with the API key.

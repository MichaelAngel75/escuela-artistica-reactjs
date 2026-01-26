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
  "csv_url": "https://resources.pohualizcalli.link/generacion-diplomas/generated-diplomas/2026-01-25/proceso-3/diploma-datos-02.csv",
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
| `POHUALIZCALLI_ADMIN_BASE_URL` | Base URL for admin API | Yes |
| `POHUALIZCALLI_RESOURCES_BASE_URL` | Base URL for resources | Yes |
| `POHUALIZCALLI_RESOURCES_BUCKET` | S3 bucket name for uploading ZIP files | Yes |

---

## Quick Start

### 1. Set Environment Variables

Add to `~/.zshrc`:
```bash
export POHUALIZCALLI_API_KEY="your-api-key-here"
export POHUALIZCALLI_ADMIN_BASE_URL="https://admin.pohualizcalli.link/internal"
export POHUALIZCALLI_RESOURCES_BASE_URL="https://resources.pohualizcalli.link"
export POHUALIZCALLI_RESOURCES_BUCKET="resources.pohualizcalli.link"
```

Reload: `source ~/.zshrc`

### 2. Local Testing

```bash
cd lambda/diploma_generator
./run-local.sh
```

### 3. Deploy to AWS

```bash
./deploy.sh prod
```

---

## Local Development with SAM CLI

### Prerequisites

- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker](https://www.docker.com/products/docker-desktop/)
- Python 3.11 (or use `--use-container` flag)
- AWS CLI configured with `pohualizcalliTerraform` profile

### Running Locally (Recommended)

Use the provided script that reads env vars from your system:

```bash
cd lambda/diploma_generator
./run-local.sh
```

The script will:
1. Validate all required environment variables
2. Auto-run `sam build --use-container` if needed
3. Invoke the Lambda with your system environment variables

### Manual Local Invocation

```bash
# Build (use container for x86_64 compatibility on ARM Mac)
sam build --template template-local.yaml --use-container

# Invoke with the BUILT template
sam local invoke DiplomaGeneratorFunction \
  --template .aws-sam/build/template.yaml \
  --event events/sqs-test-event.json \
  --env-vars env.json \
  --profile pohualizcalliTerraform
```

**Important:** Use `.aws-sam/build/template.yaml` (not `template-local.yaml`) after building to include dependencies.

## AWS Deployment with SAM

### Method 1: Using Deploy Script (Recommended)

  # 1. Delete failed stack                                                                                                                                                                              
  aws cloudformation delete-stack --stack-name diploma-generator-prod --profile <AWS_PROFILE>    
  aws cloudformation wait stack-delete-complete --stack-name diploma-generator-prod --profile <AWS_PROFILE>                                                                                                                                                                                                 
  # 2. Fix SQS visibility timeout                                                                                                                                                                       
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile <AWS_PROFILE>)                                                                                                              
  aws sqs set-queue-attributes                                         
    --queue-url "https://sqs.us-east-1.amazonaws.com/$ACCOUNT_ID/pohualizcalli-diploma-generation-sqs"       
    --attributes '{"VisibilityTimeout":"360"}'            
    --profile <AWS_PROFILE>                                                                                                                                                                                                     
  # 3. Re-deploy                                                             
  ./deploy.sh prod 
---

 

```bash
# Deploy to production
./deploy.sh prod

# Deploy to development
./deploy.sh dev
```

### Method 2: Manual SAM Commands

```bash
# Step 1: Validate template
sam validate --template template.yaml --profile pohualizcalliTerraform

# Step 2: Build
sam build --template template.yaml --use-container

# Step 3: Deploy (first time - guided)
sam deploy --guided --profile pohualizcalliTerraform

# Step 3: Deploy (subsequent)
sam deploy \
  --config-env prod \
  --parameter-overrides "PohualizcalliApiKey=$POHUALIZCALLI_API_KEY" \
  --profile pohualizcalliTerraform
```

### Deployment Parameters

The `template.yaml` accepts these parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `Environment` | `prod` | Environment name (dev/staging/prod) |
| `PohualizcalliApiKey` | - | API key (prompted, NoEcho) |
| `PohualizcalliAdminBaseUrl` | `https://admin.pohualizcalli.link/internal` | Admin API URL |
| `PohualizcalliResourcesBaseUrl` | `https://resources.pohualizcalli.link` | Resources URL |
| `PohualizcalliResourcesBucket` | `resources.pohualizcalli.link` | S3 bucket name |
| `ExistingSqsQueueArn` | `""` | Existing SQS ARN (empty = create new) |

### What SAM Deploys

The deployment creates:

| Resource | Description |
|----------|-------------|
| **Lambda Function** | `diploma-generator-{env}` with all permissions |
| **SQS Queue** | `pohualizcalli-diploma-generation-sqs-{env}` |
| **Dead Letter Queue** | `pohualizcalli-diploma-generation-dlq-{env}` |
| **CloudWatch Log Group** | `/aws/lambda/diploma-generator-{env}` (14-day retention) |
| **CloudWatch Alarms** | Error alarm + DLQ message alarm |
| **IAM Role** | Auto-created with all required permissions |

---

## IAM Permissions (Auto-Created by SAM)

SAM automatically creates an IAM role with these permissions:

### S3 Access
```json
{
  "Sid": "S3ReadWriteAccess",
  "Effect": "Allow",
  "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
  "Resource": [
    "arn:aws:s3:::resources.pohualizcalli.link",
    "arn:aws:s3:::resources.pohualizcalli.link/*"
  ]
}
```

### SQS Access (Auto-added for SQS trigger)
```json
{
  "Sid": "SQSAccess",
  "Effect": "Allow",
  "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
  "Resource": "arn:aws:sqs:us-east-1:*:pohualizcalli-diploma-generation-sqs-*"
}
```

### SSM Parameter Store Access
```json
{
  "Sid": "SSMParameterAccess",
  "Effect": "Allow",
  "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
  "Resource": "arn:aws:ssm:us-east-1:*:parameter/pohualizcalli/*"
}
```

### CloudWatch Logs
```json
{
  "Sid": "CloudWatchLogsAccess",
  "Effect": "Allow",
  "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
  "Resource": "arn:aws:logs:us-east-1:*:log-group:/aws/lambda/diploma-generator-*:*"
}
```

### X-Ray Tracing
```json
{
  "Sid": "XRayAccess",
  "Effect": "Allow",
  "Action": ["xray:PutTraceSegments", "xray:PutTelemetryRecords"],
  "Resource": "*"
}
```

### REST API Calls
**No special IAM permissions needed** - the Lambda calls external HTTPS endpoints using the `requests` library with API key authentication. This works by default since Lambda has internet access (when not in VPC).

---

## VPC Recommendations

### Recommendation: **No VPC** (for this use case)

For this Lambda, **do NOT use a VPC** because:

1. **All external resources are public HTTPS endpoints:**
   - Admin API (`https://admin.pohualizcalli.link`) - public with API key auth
   - S3 bucket - accessible via IAM (public endpoint)
   - No private databases or internal services

2. **Benefits of No VPC:**
   - Faster cold starts (no ENI provisioning)
   - Lower cost (no NAT Gateway fees ~$32/mo)
   - Simpler configuration
   - No VPC capacity limits

3. **Security is maintained via:**
   - API key authentication for REST endpoints
   - IAM roles for S3 access
   - HTTPS encryption in transit
   - CloudWatch logging for audit

### When to Use VPC

Use a **private subnet with NAT Gateway** only if:
- Accessing resources inside a VPC (RDS, ElastiCache, internal APIs)
- Compliance requires network isolation (PCI-DSS, HIPAA)
- Need to control egress traffic

---

## Monitoring & Troubleshooting

### View Logs

```bash
# Stream logs in real-time
aws logs tail /aws/lambda/diploma-generator-prod --follow --profile pohualizcalliTerraform

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/diploma-generator-prod \
  --filter-pattern "ERROR" \
  --profile pohualizcalliTerraform
```

### Test with SQS Message

```bash
# Get queue URL from CloudFormation outputs
QUEUE_URL=$(aws cloudformation describe-stacks \
  --stack-name diploma-generator-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`QueueUrl`].OutputValue' \
  --output text \
  --profile pohualizcalliTerraform)

# Send test message
aws sqs send-message \
  --queue-url "$QUEUE_URL" \
  --message-body '{"created_by":"test@example.com","file_name":"test.csv","csv_url":"https://resources.pohualizcalli.link/test/diploma-datos.csv","batch_id":99}' \
  --profile pohualizcalliTerraform
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `Unable to import module 'handler'` | Missing dependencies | Use `--template .aws-sam/build/template.yaml` |
| `No module named 'requests'` | Using source template | Rebuild with `sam build --use-container` |
| `Task timed out` | Processing too slow | Increase timeout (default: 300s) |
| `No signature found` | Professor name mismatch | Check `/signatures` API response |
| `Access Denied` on S3 | Missing IAM permissions | Check IAM role policies |
| `Missing required env var` | Env not configured | Set in Lambda console or template |

### Check Deployed Resources

```bash
# List stack resources
aws cloudformation describe-stack-resources \
  --stack-name diploma-generator-prod \
  --profile pohualizcalliTerraform

# Get outputs (Queue URL, Function ARN, etc.)
aws cloudformation describe-stacks \
  --stack-name diploma-generator-prod \
  --query 'Stacks[0].Outputs' \
  --profile pohualizcalliTerraform
```

### Delete Stack

```bash
aws cloudformation delete-stack \
  --stack-name diploma-generator-prod \
  --profile pohualizcalliTerraform
```

---

## File Structure

```
lambda/diploma_generator/
├── handler.py              # Main Lambda handler
├── requirements.txt        # Python dependencies
├── template.yaml           # SAM template for AWS deployment
├── template-local.yaml     # SAM template for local testing
├── samconfig.toml          # SAM CLI configuration
├── run-local.sh            # Local testing script (uses system env vars)
├── deploy.sh               # AWS deployment script
├── env.json                # Local environment variables (gitignored)
├── events/
│   └── sqs-test-event.json # Test SQS event
├── build.sh                # Manual build script
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

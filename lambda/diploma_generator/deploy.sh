#!/bin/bash
set -euo pipefail

# Diploma Generator - AWS Deployment Script
# Usage: ./deploy.sh [dev|prod]
#
# Required environment variables (set in ~/.zshrc):
#   POHUALIZCALLI_API_KEY
#   POHUALIZCALLI_ADMIN_BASE_URL
#   POHUALIZCALLI_RESOURCES_BASE_URL
#   POHUALIZCALLI_RESOURCES_BUCKET
#   AWS_PROFILE (optional, defaults to 'miguel')

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Default to prod if no environment specified
ENVIRONMENT="${1:-prod}"

if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
  echo "Usage: $0 [dev|prod]"
  echo "  dev  - Deploy to development environment (no confirmation)"
  echo "  prod - Deploy to production environment (with confirmation)"
  exit 1
fi

echo "===== Diploma Generator Deployment ====="
echo "Environment: $ENVIRONMENT"
echo ""

# Required environment variables
REQUIRED_VARS=(
  "POHUALIZCALLI_API_KEY"
  "POHUALIZCALLI_ADMIN_BASE_URL"
  "POHUALIZCALLI_RESOURCES_BASE_URL"
  "POHUALIZCALLI_RESOURCES_BUCKET"
)

echo "===== Checking environment variables ====="
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: Missing required environment variable: $var"
    echo ""
    echo "Add the following to your ~/.zshrc:"
    echo '  export POHUALIZCALLI_API_KEY="your-api-key"'
    echo '  export POHUALIZCALLI_ADMIN_BASE_URL="<admin-base-url>"'
    echo '  export POHUALIZCALLI_RESOURCES_BASE_URL="<resources-base-url>"'
    echo '  export POHUALIZCALLI_RESOURCES_BUCKET="<bucket-name>"'
    echo ""
    echo "Then run: source ~/.zshrc"
    exit 1
  fi
  # Mask sensitive values in output
  if [[ "$var" == "POHUALIZCALLI_API_KEY" ]]; then
    echo "  $var = ****${!var: -4}"
  else
    echo "  $var = ${!var}"
  fi
done

# Optional environment variables with defaults
AWS_PROFILE="${AWS_PROFILE:-miguel}"
SQS_QUEUE_NAME="${POHUALIZCALLI_SQS_QUEUE_NAME:-pohualizcalli-diploma-generation-sqs}"

echo "  AWS_PROFILE = $AWS_PROFILE"
echo "  SQS_QUEUE_NAME = $SQS_QUEUE_NAME"
echo ""

echo "===== Step 1: Validate Template ====="
sam validate --template template.yaml --profile "$AWS_PROFILE"

echo ""
echo "===== Step 2: Build ====="
sam build --template template.yaml --use-container

echo ""
echo "===== Step 3: Deploy to $ENVIRONMENT ====="

# Determine stack name based on environment
if [[ "$ENVIRONMENT" == "prod" ]]; then
  STACK_NAME="diploma-generator-prod"
  CONFIRM_CHANGESET="--confirm-changeset"
else
  STACK_NAME="diploma-generator-dev"
  CONFIRM_CHANGESET="--no-confirm-changeset"
fi

sam deploy \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --resolve-s3 \
  --region us-east-1 \
  --profile "$AWS_PROFILE" \
  $CONFIRM_CHANGESET \
  --parameter-overrides \
    "Environment=$ENVIRONMENT" \
    "PohualizcalliApiKey=$POHUALIZCALLI_API_KEY" \
    "PohualizcalliAdminBaseUrl=$POHUALIZCALLI_ADMIN_BASE_URL" \
    "PohualizcalliResourcesBaseUrl=$POHUALIZCALLI_RESOURCES_BASE_URL" \
    "PohualizcalliResourcesBucket=$POHUALIZCALLI_RESOURCES_BUCKET" \
    "ExistingSqsQueueName=$SQS_QUEUE_NAME"

echo ""
echo "===== Deployment Complete ====="
echo ""

# Get account ID for the redrive policy command
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile "$AWS_PROFILE")
REGION="us-east-1"

echo "===== IMPORTANT: Configure DLQ on Existing Queue ====="
echo ""
echo "Run this command to link your existing SQS queue to the new DLQ:"
echo ""
echo "aws sqs set-queue-attributes \\"
echo "  --queue-url https://sqs.$REGION.amazonaws.com/$ACCOUNT_ID/$SQS_QUEUE_NAME \\"
echo "  --attributes '{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"arn:aws:sqs:$REGION:$ACCOUNT_ID:pohualizcalli-diploma-generation-sqs-error\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}' \\"
echo "  --profile $AWS_PROFILE"
echo ""
echo "===== Useful Commands ====="
echo ""
echo "View logs:"
echo "  aws logs tail /aws/lambda/diploma-generator-$ENVIRONMENT --follow --profile $AWS_PROFILE"
echo ""
echo "Send test message:"
echo "  aws sqs send-message \\"
echo "    --queue-url https://sqs.$REGION.amazonaws.com/$ACCOUNT_ID/$SQS_QUEUE_NAME \\"
echo "    --message-body '{\"created_by\":\"test@example.com\",\"file_name\":\"test.csv\",\"csv_url\":\"https://resources.pohualizcalli.link/test.csv\",\"batch_id\":1}' \\"
echo "    --profile $AWS_PROFILE"

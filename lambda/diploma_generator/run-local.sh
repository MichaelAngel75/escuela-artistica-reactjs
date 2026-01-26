#!/bin/bash
set -euo pipefail

# Diploma Generator - Local SAM Invoke Script
# Uses environment variables from your system (set in ~/.zshrc)
#
# Required environment variables:
#   POHUALIZCALLI_API_KEY
#   POHUALIZCALLI_ADMIN_BASE_URL
#   POHUALIZCALLI_RESOURCES_BASE_URL
#   POHUALIZCALLI_RESOURCES_BUCKET

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Validate required environment variables
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
    echo "  export POHUALIZCALLI_API_KEY=\"your-api-key\""
    echo "  export POHUALIZCALLI_ADMIN_BASE_URL=\"https://admin.pohualizcalli.link/internal\""
    echo "  export POHUALIZCALLI_RESOURCES_BASE_URL=\"https://resources.pohualizcalli.link\""
    echo "  export POHUALIZCALLI_RESOURCES_BUCKET=\"resources.pohualizcalli.link\""
    echo ""
    echo "Then run: source ~/.zshrc"
    exit 1
  fi
  # Mask the API key in output
  if [[ "$var" == "POHUALIZCALLI_API_KEY" ]]; then
    echo "  $var = ****${!var: -4}"
  else
    echo "  $var = ${!var}"
  fi
done

# AWS Profile (optional, defaults to pohualizcalliTerraform)
AWS_PROFILE="${AWS_PROFILE:-pohualizcalliTerraform}"
echo "  AWS_PROFILE = $AWS_PROFILE"
echo ""

# Check if build exists
if [[ ! -d ".aws-sam/build" ]]; then
  echo "===== Build not found, running sam build ====="
  sam build --template template-local.yaml --use-container
  echo ""
fi

# Generate temporary env vars file from system environment
ENV_FILE=$(mktemp)
trap "rm -f $ENV_FILE" EXIT

cat > "$ENV_FILE" << EOF
{
  "DiplomaGeneratorFunction": {
    "POHUALIZCALLI_API_KEY": "${POHUALIZCALLI_API_KEY}",
    "POHUALIZCALLI_ADMIN_BASE_URL": "${POHUALIZCALLI_ADMIN_BASE_URL}",
    "POHUALIZCALLI_RESOURCES_BASE_URL": "${POHUALIZCALLI_RESOURCES_BASE_URL}",
    "POHUALIZCALLI_RESOURCES_BUCKET": "${POHUALIZCALLI_RESOURCES_BUCKET}"
  }
}
EOF

echo "===== Invoking Lambda locally ====="
sam local invoke DiplomaGeneratorFunction \
  --template .aws-sam/build/template.yaml \
  --event events/sqs-test-event.json \
  --env-vars "$ENV_FILE" \
  --profile "$AWS_PROFILE"

#!/bin/bash
set -euo pipefail

# Usage:
#   ./kill_instance_by_tag.sh MY_TAG_VALUE
#
# Example:
#   ./kill_instance_by_tag.sh TEMPORAL_4_DEPLOY

# AWS_NAME_TAG_VALUE="${1:-}"

# if [ -z "$AWS_NAME_TAG_VALUE" ]; then
#   echo "❌ ERROR: You must specify the tag value for Name."
#   echo "Usage: ./kill_instance_by_tag.sh <AWS_NAME_TAG_VALUE>"
#   exit 1
# fi

# Customize AWS profile
# AWS_PROFILE_MICHAEL="${AWS_PROFILE_MICHAEL:-default}"

echo "🔎 Searching for EC2 instances with tag Name=${AWS_NAME_TAG_VALUE} ..."

INSTANCE_IDS=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=${AWS_NAME_TAG_VALUE}" \
  --query "Reservations[].Instances[].InstanceId" \
  --output text \
  --profile "$AWS_PROFILE_MICHAEL" || echo "")

if [ -z "$INSTANCE_IDS" ]; then
  echo "⚠️ No EC2 instances found with tag Name=${AWS_NAME_TAG_VALUE}"
  exit 0
fi

echo "Found instance(s): $INSTANCE_IDS"

############################################################
# Choose ACTION: terminate or stop
############################################################
ACTION="terminate"   # options: terminate | stop
############################################################

echo "⚠️ WARNING: This script will $ACTION the instance(s)."
echo "Instances: $INSTANCE_IDS"
sleep 1

echo "▶️ Executing: aws ec2 ${ACTION}-instances ..."

aws ec2 ${ACTION}-instances \
  --instance-ids $INSTANCE_IDS \
  --profile "$AWS_PROFILE_MICHAEL"

echo "⏳ Waiting for instance state change..."

if [ "$ACTION" == "terminate" ]; then
  aws ec2 wait instance-terminated \
    --instance-ids $INSTANCE_IDS \
    --profile "$AWS_PROFILE_MICHAEL"
  echo "💀 Instance(s) terminated successfully."
else
  aws ec2 wait instance-stopped \
    --instance-ids $INSTANCE_IDS \
    --profile "$AWS_PROFILE_MICHAEL"
  echo "🛑 Instance(s) stopped successfully."
fi

echo
echo "==================== RESULT ===================="
echo "Action performed : $ACTION"
echo "Affected instance(s): $INSTANCE_IDS"
echo "================================================"

# -----------------------------------------------
#  ---- only for the bastion (DB)  ----
# my-vpc-bastion
# lt-098dec2e7b5d14016
# tag Name:My-VPC-Bastion
# obtain public IP and Public DNS

# -----------------------------------------------
#!/bin/bash
set -euo pipefail

########################################
# Required environment variables
########################################
: "${AWS_LAUNCH_TEMPLATE_KUBERNETES:?Must set AWS_LAUNCH_TEMPLATE_KUBERNETES}"
: "${AWS_PROFILE_MICHAEL:?Must set AWS_PROFILE_MICHAEL}"
: "${AWS_NAME_TAG_VALUE:?Must set AWS_NAME_TAG_VALUE}"
: "${ECR_MABEL_NAME:?Must set ECR_MABEL_NAME}"

LAUNCH_TEMPLATE_VERSION="${LAUNCH_TEMPLATE_VERSION:-13}"

echo "DEBUG: Launch Template Version -> '${LAUNCH_TEMPLATE_VERSION}'"
echo "=== 1) Launching EC2 instance from launch template ==="
INSTANCE_ID=$(aws ec2 run-instances \
  --launch-template "LaunchTemplateName=${AWS_LAUNCH_TEMPLATE_KUBERNETES},Version=13" \
  --count 1 \
  --profile "${AWS_PROFILE_MICHAEL}" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Launched instance: ${INSTANCE_ID}"

# Optional: ensure Name tag is set (in case the template doesn't already do it)
echo "Tagging instance with Name=${AWS_NAME_TAG_VALUE} (if not already tagged)..."
aws ec2 create-tags \
  --resources "${INSTANCE_ID}" \
  --tags "Key=Name,Value=${AWS_NAME_TAG_VALUE}" \
  --profile "${AWS_PROFILE_MICHAEL}" >/dev/null 2>&1 || true

echo "=== 2) Waiting for instance to be running ==="
aws ec2 wait instance-running \
  --instance-ids "${INSTANCE_ID}" \
  --profile "${AWS_PROFILE_MICHAEL}"

echo "Instance is running. Waiting for Public IP to be assigned..."

# Poll for Public IP (sometimes it appears a bit after 'running' state)
PUBLIC_IP=""
for i in {1..20}; do
  PUBLIC_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=${AWS_NAME_TAG_VALUE}" \
              "Name=instance-state-name,Values=running" \
    --query "Reservations[0].Instances[0].PublicIpAddress" \
    --output text \
    --profile "${AWS_PROFILE_MICHAEL}" || echo "")

  if [[ -n "${PUBLIC_IP}" && "${PUBLIC_IP}" != "None" ]]; then
    break
  fi

  echo "Public IP not available yet. Retrying..."
  sleep 5
done

if [[ -z "${PUBLIC_IP}" || "${PUBLIC_IP}" == "None" ]]; then
  echo "ERROR: Could not obtain Public IP for instance with Name=${AWS_NAME_TAG_VALUE}"
  exit 1
fi

echo "Public IP obtained: ${PUBLIC_IP}"

echo "=== 3) Getting latest Docker image tag from ECR (${ECR_MABEL_NAME}) ==="
LATEST_IMAGE_TAG=$(aws ecr describe-images \
  --repository-name "${ECR_MABEL_NAME}" \
  --query 'sort_by(imageDetails[?imageTags!=null], &imagePushedAt)[-1].imageTags[0]' \
  --output text \
  --profile "${AWS_PROFILE_MICHAEL}")

if [[ -z "${LATEST_IMAGE_TAG}" || "${LATEST_IMAGE_TAG}" == "None" ]]; then
  echo "ERROR: Could not obtain latest image tag from ECR repository ${ECR_MABEL_NAME}"
  exit 1
fi

echo "Latest Docker image tag: ${LATEST_IMAGE_TAG}"

echo
echo "==================== RESULT ===================="
echo "EC2 Public IP            : ${PUBLIC_IP}"
echo "Latest ECR Docker image  : ${LATEST_IMAGE_TAG}"
echo "================================================"

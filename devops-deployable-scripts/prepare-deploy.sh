#!/usr/bin/env bash
set -euo pipefail

rm -rf package-lock.json node_modules

# # --------------------------------------------------------------------------------------------------------
# echo "the following were missing --sudo enable docker, sudo usermod -aG docker, newgrp docker, "
# sudo systemctl enable --now docker
# sudo usermod -aG docker ec2-user
# newgrp docker
# # --- Following is to validate
# #  docker ps
# # --------------------------------------------------------------------------------------------------------


########################################
# Paths & Root Detection
########################################

# Directory where this script lives: .../MabelsAdminApp/devops-deployable-scripts
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Repo root: one level up: .../MabelsAdminApp
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

echo "Running from repo root: ${REPO_ROOT}"

########################################
# Args
########################################

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <local-image:tag> <remote-tag>"
  echo "Example: $0 mabels-admin:local mabels_rescue_v5"
  exit 1
fi

LOCAL_IMAGE="$1"    # e.g. mabels-admin:v5
REMOTE_TAG="$2"     # e.g. mabels_rescue_v5

########################################
# Config
########################################

# Use IAM role when running on EC2, fall back to profile for local execution
POHUALIZCALLI_AWS_PROFILE="${POHUALIZCALLI_AWS_PROFILE:-pohualizcalliTerraform}"
AWS_REGION="us-east-1"
ECR_ACCOUNT_ID="237019685937"
ECR_REPO_NAME="pohualizcalli-admin"
ECR_REGISTRY="${ECR_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="${ECR_REGISTRY}/${ECR_REPO_NAME}"

# # Detect if running on EC2 (use IAM role instead of profile)
# if curl -s --connect-timeout 1 http://169.254.169.254/latest/meta-data/iam/security-credentials/ >/dev/null 2>&1; then
#   echo "Detected EC2 instance - using IAM role for authentication"
#   unset POHUALIZCALLI_AWS_PROFILE
# fi

LOG_FILE="${REPO_ROOT}/deploy_$(date +%Y%m%d_%H%M%S).log"

########################################
# Logging
########################################

echo "Logging to ${LOG_FILE}"
exec > >(tee -i "${LOG_FILE}") 2>&1

echo "===== ENVIRONMENT INFO ====="
echo "LOCAL_IMAGE = ${LOCAL_IMAGE}"
echo "REMOTE_TAG  = ${REMOTE_TAG}"
echo "POHUALIZCALLI_AWS_PROFILE = ${POHUALIZCALLI_AWS_PROFILE:-<using-iam-role>}"
echo "AWS_REGION  = ${AWS_REGION}"
echo "ECR_REPO    = ${ECR_REPO}"
echo

########################################
# STEP 1: Node 22 / Yarn / Build
########################################

echo "===== STEP 1: Node 22 / Yarn setup & Build ====="

# Load NVM
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
else
  echo "WARNING: NVM not found at ~/.nvm/nvm.sh; nvm commands may fail."
fi

nvm install 22
nvm use 22

# npm install --global yarn

npm install --force

npm run build

# Ensure package.json exists in repo root
if [ ! -f "${REPO_ROOT}/package.json" ]; then
  echo "ERROR: package.json not found in ${REPO_ROOT}. Are you in the correct repo root?"
  exit 1
fi
echo 'current directory before yarn install'


########################################
# STEP 2: Docker build / tag / push
########################################
# --------------------------------------------------------------------------------------------------------
# echo "the following were missing --sudo enable docker, sudo usermod -aG docker, newgrp docker, "
# sudo systemctl enable --now docker
# sudo usermod -aG docker ec2-user
# newgrp docker
# --- Following is to validate
#  docker ps
# --------------------------------------------------------------------------------------------------------



echo "===== STEP 2: Docker login → build → tag → push ====="
ECR_LOGIN_ARGS=(--region "${AWS_REGION}")
if [ -n "${POHUALIZCALLI_AWS_PROFILE:-}" ]; then
  ECR_LOGIN_ARGS+=(--profile "${POHUALIZCALLI_AWS_PROFILE}")
fi
aws ecr get-login-password "${ECR_LOGIN_ARGS[@]}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

docker build -t "${LOCAL_IMAGE}" "${REPO_ROOT}"

docker tag "${LOCAL_IMAGE}" "${ECR_REPO}:${REMOTE_TAG}"

docker push "${ECR_REPO}:${REMOTE_TAG}"

echo "Docker image pushed to: ${ECR_REPO}:${REMOTE_TAG}"
echo

########################################
# STEP 3: Terraform in ./terraform
########################################

echo "===== STEP 3: Terraform execution (cd terraform/) ====="

TF_DIR="${REPO_ROOT}/terraform"

if [ ! -d "${TF_DIR}" ]; then
  echo "ERROR: Terraform directory not found at ${TF_DIR}"
  exit 1
fi

cd "${TF_DIR}"

TF_INIT_ARGS=(-reconfigure)
if [ -n "${POHUALIZCALLI_AWS_PROFILE:-}" ]; then
  TF_INIT_ARGS+=(-backend-config="profile=${POHUALIZCALLI_AWS_PROFILE}")
  TF_INIT_ARGS+=(-var="aws_profile=${POHUALIZCALLI_AWS_PROFILE}")
fi
terraform init "${TF_INIT_ARGS[@]}"

TF_PLAN_ARGS=()
if [ -n "${POHUALIZCALLI_AWS_PROFILE:-}" ]; then
  TF_PLAN_ARGS+=(-var="aws_profile=${POHUALIZCALLI_AWS_PROFILE}")
fi
TF_PLAN_ARGS+=(-var="ecr_remote_tag=${REMOTE_TAG}" -input=false)
terraform plan "${TF_PLAN_ARGS[@]}"

TF_APPLY_ARGS=()
if [ -n "${POHUALIZCALLI_AWS_PROFILE:-}" ]; then
  TF_APPLY_ARGS+=(-var="aws_profile=${POHUALIZCALLI_AWS_PROFILE}")
fi
TF_APPLY_ARGS+=(-var="ecr_remote_tag=${REMOTE_TAG}" -auto-approve)
terraform apply "${TF_APPLY_ARGS[@]}"

echo
echo "===== DEPLOYMENT COMPLETE ====="
echo "Terraform applied with ecr_remote_tag=${REMOTE_TAG}"
echo "Log file: ${LOG_FILE}"

#!/usr/bin/env bash
set -euo pipefail

########################################
# CONFIG - EDIT THESE FOR YOUR SETUP
########################################

# Path to your SSH private key
KEY_PATH=$POHUALIZCALLI_PEM

# Remote SSH user (for Amazon Linux: ec2-user, for Ubuntu: ubuntu)
REMOTE_USER="ec2-user"

# Local base directory of your web app
LOCAL_BASE_DIR=$ACADEMY_ADMIN_APP_PATH

# Remote base directory name under ~ on the EC2 instance
REMOTE_BASE_DIR="PohualizcalliAdminApp"

########################################
# VALIDATION
########################################

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <EC2_PUBLIC_IP>"
  exit 1
fi

EC2_IP="$1"

if [ ! -f "$KEY_PATH" ]; then
  echo "ERROR: SSH key not found at: $KEY_PATH"
  exit 1
fi

if [ ! -d "$LOCAL_BASE_DIR" ]; then
  echo "ERROR: Local base directory not found: $LOCAL_BASE_DIR"
  exit 1
fi

if [ ! -d "$LOCAL_BASE_DIR/client" ]; then
  echo "ERROR: Local client directory not found: $LOCAL_BASE_DIR/client"
  exit 1
fi

if [ ! -d "$LOCAL_BASE_DIR/server" ]; then
  echo "ERROR: Local server directory not found: $LOCAL_BASE_DIR/server"
  exit 1
fi

if [ ! -d "$LOCAL_BASE_DIR/shared" ]; then
  echo "ERROR: Local server directory not found: $LOCAL_BASE_DIR/shared"
  exit 1
fi


if [ ! -d "$LOCAL_BASE_DIR/terraform" ]; then
  echo "ERROR: Local server directory not found: $LOCAL_BASE_DIR/terraform"
  exit 1
fi

if [ ! -d "$LOCAL_BASE_DIR/attached_assets" ]; then
  echo "ERROR: Local server directory not found: $LOCAL_BASE_DIR/attached_assets"
  exit 1
fi

# Check for rsync
if ! command -v rsync >/dev/null 2>&1; then
  echo "ERROR: rsync is not installed. Install it with: sudo apt install rsync (or equivalent)."
  exit 1
fi

########################################
# COMMON VARS
########################################

SSH_OPTS="-i ${KEY_PATH} -o StrictHostKeyChecking=no"
REMOTE="${REMOTE_USER}@${EC2_IP}"

echo "==> Deploying to ${REMOTE}..."
echo "    Local base dir : ${LOCAL_BASE_DIR}"
echo "    Remote base dir: ~/${REMOTE_BASE_DIR}"
echo

########################################
# 1) CREATE REMOTE FOLDERS
########################################

echo "==> Creating remote folder structure..."
ssh ${SSH_OPTS} "${REMOTE}" "mkdir -p ~/${REMOTE_BASE_DIR}/client ~/${REMOTE_BASE_DIR}/server ~/${REMOTE_BASE_DIR}/attached_assets ~/${REMOTE_BASE_DIR}/shared ~/${REMOTE_BASE_DIR}/terraform ~/${REMOTE_BASE_DIR}/devops-deployable-scripts ~/${REMOTE_BASE_DIR}/lambda"

########################################
# 2) SYNC client/
########################################

echo "==> Syncing client/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/client/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/client/"

########################################
# 3) SYNC server/
########################################

echo "==> Syncing server/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/server/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/server/"


########################################
# 4) SYNC shared/
########################################

echo "==> Syncing shared/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/shared/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/shared/"

########################################
# 5) SYNC terraform/
########################################

echo "==> Syncing terraform/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/terraform/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/terraform/"

########################################
# 6) SYNC attached_assets/
########################################

echo "==> Syncing attached_assets/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/attached_assets/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/attached_assets/"

########################################
# 7) SYNC attached_assets/
########################################

echo "==> Syncing devops-deployable-scripts/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/devops-deployable-scripts/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/devops-deployable-scripts/"


########################################
# 8) SYNC lambda/
########################################

echo "==> Syncing lambda/..."
rsync -avz -e "ssh ${SSH_OPTS}" \
  "${LOCAL_BASE_DIR}/lambda/" \
  "${REMOTE}:~/${REMOTE_BASE_DIR}/lambda/"


########################################
# 9) SYNC ONLY TOP-LEVEL FILES (no subfolders)
########################################

echo "==> Syncing top-level files from ${LOCAL_BASE_DIR} (no extra folders)..."

cd "${LOCAL_BASE_DIR}"

# Create temporary file list
TMP_FILE_LIST="$(mktemp)"

# Find only files directly under LOCAL_BASE_DIR (no recursion)
# and write their relative paths into the temp file
find . -maxdepth 1 -type f -printf "%P\n" > "${TMP_FILE_LIST}"

if [ -s "${TMP_FILE_LIST}" ]; then
  rsync -avz -e "ssh ${SSH_OPTS}" \
    --files-from="${TMP_FILE_LIST}" \
    . \
    "${REMOTE}:~/${REMOTE_BASE_DIR}/"
  echo "   Top-level files synced."
else
  echo "   No top-level files to sync."
fi

rm -f "${TMP_FILE_LIST}"

########################################
# DONE
########################################



echo
echo "✅ Deployment complete to ${REMOTE}:~/${REMOTE_BASE_DIR}"

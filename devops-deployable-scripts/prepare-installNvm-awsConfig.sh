#!/usr/bin/env bash
set -euo pipefail

########################################
# CONFIG
########################################

# CSV file with AWS keys (second line: accessKey,secretKey)
AWS_KEY_CSV="$SECURITY_FILES_PATH/mabels_terraform_aws_accessKeys.csv"

# Remote SSH user (Amazon Linux: ec2-user, Ubuntu: ubuntu)
REMOTE_USER="ec2-user"

########################################
# ARGS
########################################

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <EC2_PUBLIC_IP>"
  echo "Example: $0 prepare-nvm-aws-remote.sh 3.88.10.20"
  exit 1
fi

KEY_PATH=$POHUALIZCALLI_PEM

EC2_IP="$1"

if [ ! -f "$KEY_PATH" ]; then
  echo "ERROR: PEM file not found: $KEY_PATH"
  exit 1
fi

if [ ! -f "$AWS_KEY_CSV" ]; then
  echo "ERROR: CSV file with AWS keys not found: $AWS_KEY_CSV"
  exit 1
fi

########################################
# PARSE AWS KEYS FROM CSV
#  Expected format:
#    line 1: header (ignored)
#    line 2: ACCESS_KEY_ID,SECRET_ACCESS_KEY
########################################

CSV_SECOND_LINE="$(sed -n '2p' "$AWS_KEY_CSV" || true)"

if [ -z "$CSV_SECOND_LINE" ]; then
  echo "ERROR: No second line in $AWS_KEY_CSV (expected 'ACCESS_KEY,SECRET_KEY')."
  exit 1
fi

AWS_ACCESS_KEY_ID="$(echo "$CSV_SECOND_LINE"  | cut -d',' -f1 | tr -d '[:space:]')"
AWS_SECRET_ACCESS_KEY="$(echo "$CSV_SECOND_LINE" | cut -d',' -f2 | tr -d '[:space:]')"

if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "ERROR: Could not parse access key / secret key from second line of $AWS_KEY_CSV"
  echo "Line was: $CSV_SECOND_LINE"
  exit 1
fi

echo "==> Using AWS access key from CSV (id: ${AWS_ACCESS_KEY_ID:0:4}********)"
echo "==> Connecting to ${REMOTE_USER}@${EC2_IP} to install NVM/Node/Yarn and configure AWS profile 'pohualizcalliTerraform'..."

########################################
# REMOTE EXECUTION
########################################
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "${REMOTE_USER}@${EC2_IP}" << EOSSH
set -euxo pipefail

exec > "/home/ec2-user/prepare-nvm-aws-configure.log" 2>&1


aws configure set aws_access_key_id "${AWS_ACCESS_KEY_ID}"     --profile pohualizcalliTerraform
aws configure set aws_secret_access_key "${AWS_SECRET_ACCESS_KEY}" --profile pohualizcalliTerraform
aws configure set region "us-east-1"                          --profile pohualizcalliTerraform
aws configure set output "json"                               --profile pohualizcalliTerraform

export AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
export AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}

mkdir /home/ec2-user/.nvm
unset NVM_DIR || true
export NVM_DIR="/home/ec2-user/.nvm"
# # mkdir -p "$NVM_DIR"

# # # curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# # # [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# # # source "/home/ec2-user/nvm.sh"


# # # 1. Download the NVM installer
# curl -o install_nvm.sh https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh
# chmod 755 *.sh
# ./install_nvm.sh

# # echo "it will bash install_nvm.sh"
# # # 2. Run it
# # bash install_nvm.sh

# . "/home/ec2-user/.nvm/nvm.sh"

# # echo "it will source /home/ec2-user/.nvm/nvm.sh"
# # # 3. Load NVM (expanded)
# # if [ -s "/home/ec2-user/.nvm/nvm.sh" ]; then
# #     . "/home/ec2-user/.nvm/nvm.sh"
# # fi


# # echo "it will install nvm 22"
# nvm install 22
# nvm use 22
# # echo "it will install nvm 22"
# # nvm alias default 22

# # node -v
# # npm -v

# # npm install --global yarn
# # yarn -v

# # aws configure set aws_access_key_id "${AWS_ACCESS_KEY_ID}"     --profile pohualizcalliTerraform
# # aws configure set aws_secret_access_key "${AWS_SECRET_ACCESS_KEY}" --profile pohualizcalliTerraform
# # aws configure set region "us-east-1"                          --profile pohualizcalliTerraform
# # aws configure set output "json"                               --profile pohualizcalliTerraform

echo "AWS profile 'pohualizcalliTerraform' configured."
echo "NVM, Node 22, and Yarn installed successfully."
EOSSH

echo "✅ Done."

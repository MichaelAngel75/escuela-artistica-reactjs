# Launch Template name and Id
# my-vpc-bastion
# lt-098dec2e7b5d14016
# obtain public IP and Public DNS


# kill instances tag Name:My-VPC-Bastion


# ---------------------------------------------------
# --- using  SSM Session Manager

# AmazonSSMManagedInstanceCore policy

# AMI images with SSM Agent installed
# Search AWS documenttion :  Amazon Machine Images (AMIs) with SSM Agent preinstalled

#     how to validate SSM is intalled:   
#           amazon) :   sudo systemctl status amazon-ssm-agent
#           ubuntu):    sudo status amazon-ssm-agent


# ------------------------------------------
##  ssh tunneling
# ssh -i /opt/security/pohualizcalli-ec2-key-pair.pem -N -L 35998:mabel-rescue-pohualizcalli-db-instance.cbiukbm2byhd.us-east-1.rds.amazonaws.com:5432 ec2-user@44.204.110.110


# ssh -i $POHUALIZCALLI_PEM -N -L 35998:<BASTION_PRIVATE_DATABASE_PORT> ec2-user@${PUBLIC_IP:-<none>}
# ssh -i $POHUALIZCALLI_PEM -N -L 35998:$BASTION_PRIVATE_DATABASE_PORT ec2-user@${PUBLIC_IP:-<none>}
#-----------------------------------------------------------------------
#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
#   DB_BASTION_EC2_TEMPLATE         -> Launch Template NAME or ID (lt-xxxxxxxx)
#   POHUALIZCALLI_PEM                        -> Path to SSH private key (.pem)
#   BASTION_PRIVATE_DATABASE_PORT   -> e.g. "mydb.abcdefg.us-east-1.rds.amazonaws.com:5432"
#
# Optional env vars:
#   AWS_REGION      -> default region (falls back to aws cli config)
#   INSTANCE_COUNT  -> default 1
#   TAG_NAME        -> default "db-bastion"
#   LOCAL_TUNNEL_PORT -> default 35998
#   SSH_USER        -> default ec2-user
#   DRY_RUN         -> "true" to run with --dry-run

: "${DB_BASTION_EC2_TEMPLATE:?DB_BASTION_EC2_TEMPLATE is required (launch template name or lt-... id)}"
: "${POHUALIZCALLI_PEM:?POHUALIZCALLI_PEM is required (path to .pem)}"
: "${BASTION_PRIVATE_DATABASE_PORT:?BASTION_PRIVATE_DATABASE_PORT is required (host:port)}"
: "${AWS_PROFILE_MICHAEL:?Must set AWS_PROFILE_MICHAEL}"

INSTANCE_COUNT="${INSTANCE_COUNT:-1}"
TAG_NAME="${TAG_NAME:-db-bastion}"
LOCAL_TUNNEL_PORT="${LOCAL_TUNNEL_PORT:-35998}"
SSH_USER="${SSH_USER:-ec2-user}"
DRY_RUN="${DRY_RUN:-false}"

AWS_REGION_ARG=()
if [[ -n "${AWS_REGION:-}" ]]; then
  AWS_REGION_ARG=(--region "$AWS_REGION")
fi

DRY_RUN_ARG=()
if [[ "$DRY_RUN" == "true" ]]; then
  DRY_RUN_ARG=(--dry-run)
fi

# Determine whether env value is a Launch Template ID or Name
LT_SPEC=()
if [[ "$DB_BASTION_EC2_TEMPLATE" =~ ^lt- ]]; then
  LT_SPEC=(LaunchTemplateId="$DB_BASTION_EC2_TEMPLATE",Version="1")
else
  LT_SPEC=(LaunchTemplateName="$DB_BASTION_EC2_TEMPLATE",Version="1")
fi

echo "Launching EC2 instance from Launch Template: $DB_BASTION_EC2_TEMPLATE (Version=1)"
echo "Count: $INSTANCE_COUNT"
echo "Region: ${AWS_REGION:-<aws-cli-default>}"
echo

INSTANCE_ID="$(
  aws ec2 run-instances \
    "${AWS_REGION_ARG[@]}" \
    "${DRY_RUN_ARG[@]}" \
    --launch-template "${LT_SPEC[*]}" \
    --count "$INSTANCE_COUNT" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${TAG_NAME}}]" \
    --profile "${AWS_PROFILE_MICHAEL}" \
    --query 'Instances[0].InstanceId' \
    --output text
)"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "Dry-run succeeded. No instance created."
  exit 0
fi

echo "InstanceId: $INSTANCE_ID"
echo "Waiting for instance to be running..."
aws ec2 wait instance-running "${AWS_REGION_ARG[@]}" --instance-ids "$INSTANCE_ID" --profile "${AWS_PROFILE_MICHAEL}"

# Wait until instance passes both system and instance status checks
echo "Waiting for EC2 status checks (system + instance) to be OK..."
aws ec2 wait instance-status-ok "${AWS_REGION_ARG[@]}" --instance-ids "$INSTANCE_ID" --profile "${AWS_PROFILE_MICHAEL}"

# Wait until Public IP/DNS are assigned (can take a few seconds)
echo "Waiting for Public IP/DNS assignment..."
PUBLIC_IP=""
PUBLIC_DNS=""
for _ in {1..60}; do
  PUBLIC_IP="$(
    aws ec2 describe-instances \
      "${AWS_REGION_ARG[@]}" \
      --instance-ids "$INSTANCE_ID" \
      --query 'Reservations[0].Instances[0].PublicIpAddress' \
      --profile "${AWS_PROFILE_MICHAEL}" \
      --output text 2>/dev/null || true
  )"
  PUBLIC_DNS="$(
    aws ec2 describe-instances \
      "${AWS_REGION_ARG[@]}" \
      --instance-ids "$INSTANCE_ID" \
      --query 'Reservations[0].Instances[0].PublicDnsName' \
      --profile "${AWS_PROFILE_MICHAEL}" \
      --output text 2>/dev/null || true
  )"

  if [[ "$PUBLIC_IP" != "None" && -n "$PUBLIC_IP" && "$PUBLIC_DNS" != "None" && -n "$PUBLIC_DNS" ]]; then
    break
  fi
  sleep 2
done

if [[ "$PUBLIC_IP" == "None" || -z "${PUBLIC_IP:-}" ]]; then
  echo "ERROR: No Public IP found. Your Launch Template/subnet may not auto-assign public IPv4."
  echo "Fix: ensure the instance is launched in a public subnet with auto-assign public IPv4 enabled,"
  echo "or the launch template network interface requests a public IP / associates an Elastic IP."
  exit 1
fi

echo
echo "=== Bastion Details ==="
echo "InstanceId : $INSTANCE_ID"
echo "Public IP  : $PUBLIC_IP"
echo "Public DNS : ${PUBLIC_DNS:-<none>}"
echo

# Ensure PEM permissions are acceptable to ssh
chmod 400 "$POHUALIZCALLI_PEM" 2>/dev/null || true

echo "Starting SSH tunnel (this will keep running; use Ctrl+C to stop)..."
echo "Local port: $LOCAL_TUNNEL_PORT -> $BASTION_PRIVATE_DATABASE_PORT via $PUBLIC_IP"
echo

ssh -i "$POHUALIZCALLI_PEM" -N \
  -L "${LOCAL_TUNNEL_PORT}:${BASTION_PRIVATE_DATABASE_PORT}" \
  "${SSH_USER}@${PUBLIC_IP}"

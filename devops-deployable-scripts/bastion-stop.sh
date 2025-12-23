#!/usr/bin/env bash
set -euo pipefail

: "${AWS_PROFILE_MICHAEL:?Must set AWS_PROFILE_MICHAEL}"

NAME_TAG_VALUE="db-bastion"
DRY_RUN="${DRY_RUN:-false}"

AWS_REGION_ARG=()
if [[ -n "${AWS_REGION:-}" ]]; then
  AWS_REGION_ARG=(--region "$AWS_REGION")
fi

DRY_RUN_ARG=()
if [[ "$DRY_RUN" == "true" ]]; then
  DRY_RUN_ARG=(--dry-run)
fi

echo "Finding instances with tag Name=${NAME_TAG_VALUE} ..."
INSTANCE_IDS="$(
  aws ec2 describe-instances \
    "${AWS_REGION_ARG[@]}" \
    --profile "${AWS_PROFILE_MICHAEL}" \
    --filters \
      "Name=tag:Name,Values=${NAME_TAG_VALUE}" \
      "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text
)"

if [[ -z "${INSTANCE_IDS// }" ]]; then
  echo "No instances found with Name=${NAME_TAG_VALUE}."
  exit 0
fi

echo "Instances found:"
for id in $INSTANCE_IDS; do
  echo " - $id"
done
echo

TO_STOP="$(
  aws ec2 describe-instances \
    "${AWS_REGION_ARG[@]}" \
    --profile "${AWS_PROFILE_MICHAEL}" \
    --filters \
      "Name=tag:Name,Values=${NAME_TAG_VALUE}" \
      "Name=instance-state-name,Values=pending,running" \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text
)"

if [[ -n "${TO_STOP// }" ]]; then
  echo "Stopping instances:"
  for id in $TO_STOP; do
    echo " - $id"
  done
  echo

  aws ec2 terminate-instances \
   --instance-ids $TO_STOP \
   --profile "$AWS_PROFILE_MICHAEL"

  # shellcheck disable=SC2086
#   aws ec2 terminate-instances \
#     "${AWS_REGION_ARG[@]}" \
#     "${DRY_RUN_ARG[@]}" \
#     --profile "${AWS_PROFILE_MICHAEL}" \
#     --instance-ids $TO_STOP \
#     >/dev/null

#   if [[ "$DRY_RUN" == "true" ]]; then
#     echo "Dry-run succeeded. No instances were stopped."
#     exit 0
#   fi

  echo "Waiting until all targeted instances are stopped..."
  aws ec2 wait instance-terminated \
    --instance-ids $TO_STOP \
    --profile "$AWS_PROFILE_MICHAEL"
  echo "💀 Instance(s) terminated successfully."
#   # shellcheck disable=SC2086
#   aws ec2 wait instance-stopped \
#     "${AWS_REGION_ARG[@]}" \
#     --profile "${AWS_PROFILE_MICHAEL}" \
#     --instance-ids $TO_STOP
else
  echo "No pending/running instances to stop (already stopped or stopping)."
  echo
fi

echo "Final status for Name=${NAME_TAG_VALUE}:"
aws ec2 describe-instances \
  "${AWS_REGION_ARG[@]}" \
  --profile "${AWS_PROFILE_MICHAEL}" \
  --filters "Name=tag:Name,Values=${NAME_TAG_VALUE}" \
  --query 'Reservations[].Instances[].{InstanceId:InstanceId,State:State.Name,PublicIp:PublicIpAddress,PublicDns:PublicDnsName,PrivateIp:PrivateIpAddress,LaunchTime:LaunchTime}' \
  --output table

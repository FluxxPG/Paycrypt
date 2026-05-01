#!/usr/bin/env bash
set -euo pipefail

# K3s Node Autoscaling (cheap microservices on EC2)
# - Creates/updates a Launch Template + AutoScalingGroup for K3s *agent* nodes
# - Works with Cluster Autoscaler (see infra/kubernetes/addons/cluster-autoscaler-aws.yaml)
#
# Requirements:
# - Run on a Linux machine with AWS CLI configured (or on the EC2 host).
# - The K3s server must already be running (this repo uses the existing EC2 host as server).
# - SSM parameter must exist: /paycrypt/k3s/node-token (SecureString)
#
# Safe defaults:
# - min=0 (scale to zero agents), desired=0, max=3
# - You can set MIN_SIZE=1 if you want HA capacity all the time.

AWS_REGION="${AWS_REGION:-ap-south-1}"
CLUSTER_NAME="${CLUSTER_NAME:-paycrypt}"

LAUNCH_TEMPLATE_NAME="${LAUNCH_TEMPLATE_NAME:-paycrypt-k3s-agents}"
ASG_NAME="${ASG_NAME:-paycrypt-k3s-agents-asg}"

AMI_ID="${AMI_ID:-ami-0f11fb0f6d8b520d4}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
KEY_NAME="${KEY_NAME:-paycrypt-ec2-key}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-sg-0bdf4cd9390679316}"
SUBNET_ID="${SUBNET_ID:-subnet-011ea83bf29e90289}"
INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-paycrypt-ssm-profile}"

K3S_SERVER_URL="${K3S_SERVER_URL:-https://172.31.41.59:6443}"
TOKEN_PARAM_NAME="${TOKEN_PARAM_NAME:-/paycrypt/k3s/node-token}"

MIN_SIZE="${MIN_SIZE:-0}"
MAX_SIZE="${MAX_SIZE:-3}"
DESIRED_CAPACITY="${DESIRED_CAPACITY:-0}"

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI not found. Install AWS CLI first." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

USER_DATA_FILE="$TMP_DIR/user-data.sh"
cat >"$USER_DATA_FILE" <<EOF
#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl unzip

# Install AWS CLI v2 (Ubuntu 24.04 may not ship awscli apt package)
cd /tmp
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip -o awscliv2.zip
unzip -q awscliv2.zip
./aws/install --update || true

REGION="${AWS_REGION}"
TOKEN=\$(aws ssm get-parameter --name "${TOKEN_PARAM_NAME}" --with-decryption --query Parameter.Value --output text --region "\$REGION")

curl -sfL https://get.k3s.io | K3S_URL="${K3S_SERVER_URL}" K3S_TOKEN="\$TOKEN" sh -s - agent --node-label paycrypt.io/pool=default
EOF

USER_DATA_B64="$(base64 -w0 <"$USER_DATA_FILE")"

LT_DATA_FILE="$TMP_DIR/lt.json"
cat >"$LT_DATA_FILE" <<EOF
{
  "ImageId": "${AMI_ID}",
  "InstanceType": "${INSTANCE_TYPE}",
  "KeyName": "${KEY_NAME}",
  "SecurityGroupIds": ["${SECURITY_GROUP_ID}"],
  "IamInstanceProfile": { "Name": "${INSTANCE_PROFILE_NAME}" },
  "UserData": "${USER_DATA_B64}",
  "TagSpecifications": [
    {
      "ResourceType": "instance",
      "Tags": [
        { "Key": "Name", "Value": "paycrypt-k3s-agent" },
        { "Key": "paycrypt:cluster", "Value": "${CLUSTER_NAME}" }
      ]
    }
  ]
}
EOF

if aws ec2 describe-launch-templates --launch-template-names "$LAUNCH_TEMPLATE_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo "Launch Template exists: $LAUNCH_TEMPLATE_NAME (creating new version)"
  aws ec2 create-launch-template-version \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --version-description "k3s-agent" \
    --launch-template-data "file://$LT_DATA_FILE" \
    --region "$AWS_REGION" >/dev/null
else
  echo "Creating Launch Template: $LAUNCH_TEMPLATE_NAME"
  aws ec2 create-launch-template \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --version-description "k3s-agent" \
    --launch-template-data "file://$LT_DATA_FILE" \
    --region "$AWS_REGION" >/dev/null
fi

LATEST_LT_VERSION="$(aws ec2 describe-launch-templates --launch-template-names "$LAUNCH_TEMPLATE_NAME" --query 'LaunchTemplates[0].LatestVersionNumber' --output text --region "$AWS_REGION")"

if aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" --region "$AWS_REGION" --query 'AutoScalingGroups[0].AutoScalingGroupName' --output text 2>/dev/null | grep -q "$ASG_NAME"; then
  echo "Updating ASG: $ASG_NAME"
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size "$MIN_SIZE" \
    --max-size "$MAX_SIZE" \
    --desired-capacity "$DESIRED_CAPACITY" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=$LATEST_LT_VERSION" \
    --region "$AWS_REGION" >/dev/null
else
  echo "Creating ASG: $ASG_NAME"
  aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --min-size "$MIN_SIZE" \
    --max-size "$MAX_SIZE" \
    --desired-capacity "$DESIRED_CAPACITY" \
    --vpc-zone-identifier "$SUBNET_ID" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=$LATEST_LT_VERSION" \
    --tags \
      "Key=Name,Value=paycrypt-k3s-agent,PropagateAtLaunch=true" \
      "Key=k8s.io/cluster-autoscaler/enabled,Value=true,PropagateAtLaunch=true" \
      "Key=k8s.io/cluster-autoscaler/${CLUSTER_NAME},Value=true,PropagateAtLaunch=true" \
    --region "$AWS_REGION" >/dev/null
fi

echo "Done."
echo "ASG=$ASG_NAME min=$MIN_SIZE desired=$DESIRED_CAPACITY max=$MAX_SIZE"
echo "Next: apply cluster autoscaler manifest (infra/kubernetes/addons/cluster-autoscaler-aws.yaml)"


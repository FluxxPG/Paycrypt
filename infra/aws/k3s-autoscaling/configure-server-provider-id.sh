#!/usr/bin/env bash
set -euo pipefail

# Configure the K3s *server* node to expose a valid AWS providerID.
# Required for Cluster Autoscaler on self-managed Kubernetes on EC2.
#
# Run on the K3s server node (the current EC2 host) as root:
#   sudo bash infra/aws/k3s-autoscaling/configure-server-provider-id.sh

IMDS_TOKEN="$(curl -fsS -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")"
IID="$(curl -fsS -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" http://169.254.169.254/latest/meta-data/instance-id)"
AZ="$(curl -fsS -H "X-aws-ec2-metadata-token: ${IMDS_TOKEN}" http://169.254.169.254/latest/meta-data/placement/availability-zone)"
PROVIDER_ID="aws:///${AZ}/${IID}"

mkdir -p /etc/rancher/k3s
CONFIG=/etc/rancher/k3s/config.yaml

if [ -f "$CONFIG" ] && grep -q "provider-id=" "$CONFIG"; then
  echo "provider-id already configured in $CONFIG"
else
  cat >>"$CONFIG" <<EOF

kubelet-arg:
  - "provider-id=${PROVIDER_ID}"
EOF
  echo "Wrote provider-id=${PROVIDER_ID} to $CONFIG"
fi

systemctl restart k3s
sleep 3
systemctl --no-pager --full status k3s | head -n 20 || true


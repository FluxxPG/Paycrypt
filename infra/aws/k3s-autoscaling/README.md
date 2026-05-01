## Paycrypt cheap autoscaling microservices (K3s + EC2)

This repo already runs the backend as separate deployments (microservices) on K3s:
- `api` (HTTP 4000)
- `ws` (Socket.IO 4001)
- `worker` (BullMQ 4002)

To make it **auto-scalable without manual intervention**, you need **two layers**:

1) **Pod autoscaling (HPA)** – scales api/ws/worker replicas based on CPU/memory  
2) **Node autoscaling** – adds/removes EC2 nodes automatically when pods can’t schedule

### What is already done

- K3s overlay now includes **metrics-server** + **HPA**:
  - `infra/kubernetes/overlays/k3s/metrics-server.yaml`
  - `infra/kubernetes/overlays/k3s/autoscaling.yaml`

### Node autoscaling (EC2 AutoScalingGroup + Cluster Autoscaler)

1) Ensure the K3s server node token exists in SSM:

- Parameter name: `/paycrypt/k3s/node-token` (SecureString)

2) Create an ASG for K3s agent nodes:

```bash
AWS_REGION=ap-south-1 \
CLUSTER_NAME=paycrypt \
K3S_SERVER_URL=https://<k3s-server-private-ip>:6443 \
SUBNET_ID=<subnet-id> \
SECURITY_GROUP_ID=<sg-id> \
bash infra/aws/k3s-autoscaling/create-asg.sh
```

This creates tags that Cluster Autoscaler uses for auto-discovery:
- `k8s.io/cluster-autoscaler/enabled=true`
- `k8s.io/cluster-autoscaler/paycrypt=true`

3) Deploy Cluster Autoscaler in Kubernetes:

```bash
sudo k3s kubectl apply -f infra/kubernetes/addons/cluster-autoscaler-aws.yaml
sudo k3s kubectl -n kube-system rollout status deploy/cluster-autoscaler
```

### Cost tips (cheapest setup)
- Use **t3.small** for base node.
- Add a second **spot** node group later for `worker` (optional).
- Keep min agent nodes at `0` if you only want burst capacity.


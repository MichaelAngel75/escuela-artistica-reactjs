# VPC Endpoint vs NAT Gateway Verification Guide

## Overview

This guide explains how to verify that your AWS services are routing through VPC Endpoints instead of NAT Gateway. This is critical during migration from NAT to VPC Endpoints to ensure:

1. **Cost Savings**: VPC Endpoints have fixed costs; NAT charges per GB
2. **Security**: Traffic stays within AWS network, never touching the internet
3. **Reliability**: No single point of failure (NAT Gateway)

## Quick Start

```bash
# Copy script to EC2 in private subnet
scp verify-vpc-endpoints-vs-nat.sh ec2-user@<bastion>:/tmp/

# From bastion, copy to private EC2 or run directly if bastion is in private subnet
ssh ec2-user@<private-ec2>
chmod +x /tmp/verify-vpc-endpoints-vs-nat.sh
/tmp/verify-vpc-endpoints-vs-nat.sh --verbose
```

## How Routing Works

### Interface Endpoints (Most AWS Services)

Interface Endpoints create **ENIs (Elastic Network Interfaces)** in your subnets with private IPs. When `private_dns_enabled = true`, DNS queries return the private IP instead of the public AWS IP.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DNS RESOLUTION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WITH VPC Endpoint (private_dns_enabled=true):                              │
│  ┌──────────────┐     logs.us-east-1.amazonaws.com      ┌────────────────┐  │
│  │   EC2/ECS    │ ─────────────────────────────────────>│  VPC DNS       │  │
│  │   Task       │                                       │  Resolver      │  │
│  └──────────────┘     Returns: 10.0.1.55 (PRIVATE)      └────────────────┘  │
│         │                                                       │           │
│         │  Traffic stays in VPC                                 │           │
│         ▼                                                       ▼           │
│  ┌──────────────┐                                       ┌────────────────┐  │
│  │ VPC Endpoint │ <─────────────────────────────────────│ Private Hosted │  │
│  │ ENI (10.0.1) │                                       │ Zone Override  │  │
│  └──────────────┘                                       └────────────────┘  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WITHOUT VPC Endpoint (or private_dns_enabled=false):                       │
│  ┌──────────────┐     logs.us-east-1.amazonaws.com      ┌────────────────┐  │
│  │   EC2/ECS    │ ─────────────────────────────────────>│  VPC DNS       │  │
│  │   Task       │                                       │  Resolver      │  │
│  └──────────────┘     Returns: 52.46.132.xx (PUBLIC)    └────────────────┘  │
│         │                                                                    │
│         │  Traffic goes through NAT                                         │
│         ▼                                                                    │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │ Route Table  │ ──> │ NAT Gateway  │ ──> │  Internet ──> AWS Public IP  │ │
│  │ 0.0.0.0/0    │     │ ($$$ cost)   │     │  (data transfer charges)     │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Gateway Endpoints (S3 and DynamoDB only)

Gateway Endpoints work differently - they add routes to your route tables. DNS always returns public IPs, but traffic is routed internally via the endpoint.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        S3 GATEWAY ENDPOINT ROUTING                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WITH S3 Gateway Endpoint:                                                   │
│  ┌──────────────┐     s3.us-east-1.amazonaws.com                            │
│  │   EC2/ECS    │ ─────────────────────────────────────────────────────┐    │
│  │   Task       │     DNS Returns: 52.xx.xx.xx (always public IP)      │    │
│  └──────────────┘                                                      │    │
│         │                                                              │    │
│         │  But route table sends to VPC Endpoint!                      │    │
│         ▼                                                              ▼    │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         ROUTE TABLE                                      ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Destination        │ Target                                         │││
│  │  ├────────────────────┼───────────────────────────────────────────────┤││
│  │  │ 10.0.0.0/16        │ local                                         │││
│  │  │ pl-63a5400a (S3)   │ vpce-0abc123... (Gateway Endpoint) ◄── HERE   │││
│  │  │ 0.0.0.0/0          │ nat-0xyz789... (NAT Gateway)                  │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│         │                                                                    │
│         │  S3 prefix list (pl-xxx) matches before 0.0.0.0/0                 │
│         ▼                                                                    │
│  ┌──────────────────┐                                                        │
│  │  S3 Gateway      │ ──────> AWS S3 (internal network, FREE)               │
│  │  Endpoint        │                                                        │
│  └──────────────────┘                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Script Usage

### Basic Usage

```bash
./verify-vpc-endpoints-vs-nat.sh
```

Output:
```
==============================================
    VPC Endpoint vs NAT Gateway Checker
==============================================

[INFO] Running pre-flight checks...
[INFO] Running on EC2 instance: i-0abc123456789
[INFO] Using AWS Region: us-east-1

Checking AWS service routing...

----------------------------------------------
Gateway Endpoints (Route Table Based)
----------------------------------------------
[✅ VPC Endpoint] S3 Storage (ECR layers, application buckets)
[⚠️  Warning] DynamoDB (if used) (no Gateway endpoint - optional if not using DynamoDB)

----------------------------------------------
Interface Endpoints (DNS Based)
----------------------------------------------
[✅ VPC Endpoint] CloudWatch Logs (container logging)
[✅ VPC Endpoint] ECR API (docker login, image management)
[✅ VPC Endpoint] ECR Docker (docker pull/push)
[❌ NAT/Public] SNS Notifications
[❌ NAT/Public] SQS Queues

==============================================
                  SUMMARY
==============================================

  Total Services Checked:      15
  ✅ Using VPC Endpoint:       10
  ❌ Using NAT/Public:         3
  ⚠️  Optional/Unknown:        2
```

### Verbose Mode

```bash
./verify-vpc-endpoints-vs-nat.sh --verbose
```

Shows additional details:
```
[✅ VPC Endpoint] CloudWatch Logs (container logging)
         └─ logs.us-east-1.amazonaws.com → 10.0.1.55 (private IP)
         └─ Connectivity: ✅ Port 443 reachable
[❌ NAT/Public] SNS Notifications
         └─ sns.us-east-1.amazonaws.com → 52.46.132.77 (public IP - using NAT)
         └─ Connectivity: ✅ Port 443 reachable
```

### JSON Output (for automation)

```bash
./verify-vpc-endpoints-vs-nat.sh --json
```

```json
[
    {
        "service": "s3",
        "endpoint_type": "gateway",
        "status": "vpc_endpoint",
        "fqdn": "s3.us-east-1.amazonaws.com",
        "resolved_ip": "-",
        "description": "S3 Storage (ECR layers, application buckets)",
        "using_vpc_endpoint": true
    },
    {
        "service": "logs",
        "endpoint_type": "interface",
        "status": "vpc_endpoint",
        "fqdn": "logs.us-east-1.amazonaws.com",
        "resolved_ip": "10.0.1.55",
        "description": "CloudWatch Logs (container logging)",
        "using_vpc_endpoint": true
    }
]
```

### Specify Region

```bash
./verify-vpc-endpoints-vs-nat.sh --region us-west-2
```

## Manual Verification Commands

### Check Interface Endpoint (DNS-based)

```bash
# Using dig
dig +short logs.us-east-1.amazonaws.com
# VPC Endpoint: 10.0.1.55 (private IP)
# NAT Gateway:  52.46.132.xx (public IP)

# Using nslookup
nslookup logs.us-east-1.amazonaws.com
```

### Check S3 Gateway Endpoint (Route Table-based)

```bash
# List VPC Endpoints
aws ec2 describe-vpc-endpoints \
    --filters "Name=service-name,Values=com.amazonaws.us-east-1.s3" \
    --query 'VpcEndpoints[*].[VpcEndpointId,VpcEndpointType,State]' \
    --output table

# Check route table for S3 prefix list
aws ec2 describe-route-tables \
    --route-table-ids rtb-xxxxxxxx \
    --query 'RouteTables[*].Routes[?DestinationPrefixListId!=`null`]'
```

### Test Connectivity

```bash
# Test CloudWatch Logs endpoint
curl -v --connect-timeout 5 https://logs.us-east-1.amazonaws.com 2>&1 | head -20

# Test S3 (will work via either NAT or Gateway endpoint)
aws s3 ls --region us-east-1

# Trace route (shows hops - fewer = VPC endpoint)
traceroute -T -p 443 logs.us-east-1.amazonaws.com
```

## Services Checked

### Required for ECS/Fargate

| Service | Endpoint Type | Purpose |
|---------|---------------|---------|
| `s3` | Gateway (FREE) | ECR image layers, application buckets |
| `ecr.api` | Interface | Docker login, image management |
| `ecr.dkr` | Interface | Docker pull/push |
| `logs` | Interface | Container logging (awslogs driver) |
| `ecs` | Interface | ECS control plane |
| `ecs-agent` | Interface | ECS agent communication |
| `ecs-telemetry` | Interface | Container metrics |

### Required for Security/Config

| Service | Endpoint Type | Purpose |
|---------|---------------|---------|
| `secretsmanager` | Interface | Database credentials |
| `ssm` | Interface | Parameter Store |
| `kms` | Interface | Encryption/decryption |
| `sts` | Interface | IAM role assumption |

### Optional (checked but not required)

| Service | Endpoint Type | Purpose |
|---------|---------------|---------|
| `dynamodb` | Gateway (FREE) | Only if using DynamoDB |
| `sns` | Interface | If publishing notifications |
| `sqs` | Interface | If using queues |
| `lambda` | Interface | If invoking Lambda from VPC |
| `monitoring` | Interface | CloudWatch metrics API |
| `events` | Interface | EventBridge |

## Troubleshooting

### "DNS resolution failed"

```
[⚠️  Warning] SNS Notifications - DNS resolution failed
```

**Cause**: No DNS resolver or network issue
**Fix**: Verify VPC DNS settings:
```bash
aws ec2 describe-vpc-attribute --vpc-id vpc-xxx --attribute enableDnsSupport
aws ec2 describe-vpc-attribute --vpc-id vpc-xxx --attribute enableDnsHostnames
```

### "Using NAT/Public" for Interface Endpoint

```
[❌ NAT/Public] CloudWatch Logs
         └─ logs.us-east-1.amazonaws.com → 52.46.132.77 (public IP)
```

**Causes**:
1. VPC Endpoint doesn't exist
2. `private_dns_enabled = false`
3. VPC DNS settings disabled

**Fix**:
```bash
# Check if endpoint exists
aws ec2 describe-vpc-endpoints \
    --filters "Name=service-name,Values=com.amazonaws.us-east-1.logs"

# Check private DNS setting
aws ec2 describe-vpc-endpoints \
    --filters "Name=service-name,Values=com.amazonaws.us-east-1.logs" \
    --query 'VpcEndpoints[*].PrivateDnsEnabled'
```

### "could not determine routing" for S3

```
[⚠️  Warning] S3 Storage (could not determine routing)
```

**Cause**: AWS CLI not available or no permissions
**Fix**: Install AWS CLI or run with proper IAM role:
```bash
sudo yum install -y aws-cli
# Or verify IAM permissions for ec2:DescribeVpcEndpoints
```

### Security Group Blocking

If connectivity test fails:
```
[✅ VPC Endpoint] CloudWatch Logs
         └─ logs.us-east-1.amazonaws.com → 10.0.1.55 (private IP)
         └─ Connectivity: ❌ Port 443 not reachable
```

**Fix**: Check VPC Endpoint security group allows inbound 443:
```bash
aws ec2 describe-security-groups --group-ids sg-xxx \
    --query 'SecurityGroups[*].IpPermissions'
```

## Integration with CI/CD

### Pre-deployment Check

```bash
#!/bin/bash
# ci-check-vpc-endpoints.sh

RESULT=$(./verify-vpc-endpoints-vs-nat.sh --json)
NAT_COUNT=$(echo "$RESULT" | jq '[.[] | select(.status == "nat")] | length')

if [[ $NAT_COUNT -gt 0 ]]; then
    echo "ERROR: $NAT_COUNT services still using NAT Gateway"
    echo "$RESULT" | jq '.[] | select(.status == "nat") | .service'
    exit 1
fi

echo "All services using VPC Endpoints"
exit 0
```

### CloudWatch Alarm (Optional)

Create a Lambda that runs this check periodically and sends alerts if services fall back to NAT.

## Cost Comparison Reference

| Configuration | Monthly Cost |
|---------------|--------------|
| **NAT Gateway** | $32.85 + $0.045/GB |
| **10 Interface Endpoints (1 AZ)** | ~$73 fixed |
| **10 Interface Endpoints (2 AZ)** | ~$146 fixed |
| **S3 Gateway Endpoint** | FREE |
| **DynamoDB Gateway Endpoint** | FREE |

**Break-even**: VPC Endpoints are cheaper when data transfer exceeds ~900 GB/month.

## Related Files

- `terraform/vpc_endpoints.tf` - VPC Endpoint Terraform configuration
- `terraform/VPC-endpoint-readme.md` - Architecture documentation
- `devops-deployable-scripts/verify-vpc-endpoints-vs-nat.sh` - This verification script

## Quick Reference Card

```
┌────────────────────────────────────────────────────────────────┐
│                  VPC ENDPOINT VERIFICATION                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  INTERFACE ENDPOINTS (most services):                          │
│    ✅ Private IP (10.x.x.x) = Using VPC Endpoint              │
│    ❌ Public IP (52.x.x.x)  = Using NAT Gateway               │
│                                                                │
│  GATEWAY ENDPOINTS (S3, DynamoDB):                             │
│    Check route table for prefix list entry (pl-xxxxx)          │
│    DNS always returns public IP (normal behavior)              │
│                                                                │
│  VERIFICATION COMMAND:                                         │
│    dig +short <service>.<region>.amazonaws.com                 │
│                                                                │
│  COMMON SERVICES:                                              │
│    logs.us-east-1.amazonaws.com     (CloudWatch Logs)         │
│    ecr.api.us-east-1.amazonaws.com  (ECR API)                 │
│    ecr.dkr.us-east-1.amazonaws.com  (ECR Docker)              │
│    secretsmanager.us-east-1.amazonaws.com                     │
│    ssm.us-east-1.amazonaws.com      (Parameter Store)         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

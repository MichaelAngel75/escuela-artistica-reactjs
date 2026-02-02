# VPC Endpoints Architecture

## Overview

This Terraform configuration deploys AWS VPC Endpoints to enable private subnet resources to access AWS services **without requiring a NAT Gateway**. This approach improves both security and cost efficiency.

```
                                    +---------------------------+
                                    |      AWS Services         |
                                    |  (S3, ECR, CloudWatch,    |
                                    |   Secrets Manager, etc.)  |
                                    +------------+--------------+
                                                 |
                                    +------------+--------------+
                                    |     VPC Endpoints         |
                                    |  (Gateway + Interface)    |
                                    +------------+--------------+
                                                 |
                    +----------------------------+----------------------------+
                    |                            |                            |
           +--------+--------+          +--------+--------+          +--------+--------+
           |  Private Subnet |          |  Private Subnet |          |  Private Subnet |
           |   us-east-1a    |          |   us-east-1b    |          |   us-east-1c    |
           |                 |          |  (Endpoints     |          |                 |
           |   ECS Tasks     |          |   deployed here)|          |   ECS Tasks     |
           +-----------------+          +-----------------+          +-----------------+
                    |                            |                            |
                    +----------------------------+----------------------------+
                                                 |
                                    +------------+--------------+
                                    |    Security Group         |
                                    |  (HTTPS 443 only)         |
                                    +---------------------------+
```

## Endpoints Deployed

| Endpoint | Type | Purpose | Cost |
|----------|------|---------|------|
| **S3** | Gateway | ECR image layers, application buckets | **FREE** |
| **ECR API** | Interface | Docker login, ECR API calls | ~$7.30/mo |
| **ECR DKR** | Interface | Docker pull/push operations | ~$7.30/mo |
| **CloudWatch Logs** | Interface | Container/application logging | ~$7.30/mo |
| **STS** | Interface | IAM role assumption | ~$7.30/mo |
| **Secrets Manager** | Interface | Database credentials, secrets | ~$7.30/mo |
| **KMS** | Interface | Encryption/decryption operations | ~$7.30/mo |
| **SSM** | Interface | Parameter Store access | ~$7.30/mo |
| **ECS Agent** | Interface | ECS agent registration | ~$7.30/mo |
| **ECS Telemetry** | Interface | Container metrics | ~$7.30/mo |
| **ECS** | Interface | ECS control plane | ~$7.30/mo |

---

## Cost Savings Analysis

### Current Configuration: Single AZ (us-east-1b)

| Component | Monthly Cost |
|-----------|--------------|
| S3 Gateway Endpoint | $0.00 |
| 10 Interface Endpoints (1 AZ) | ~$73.00 |
| **Total** | **~$73/month** |

### Alternative: NAT Gateway

| Component | Monthly Cost |
|-----------|--------------|
| NAT Gateway (1 AZ) | ~$32.85 |
| Data Processing (varies) | $0.045/GB |
| **Total** | **$33+ per NAT + data costs** |

### Cost Comparison

| Scenario | VPC Endpoints | NAT Gateway | Winner |
|----------|---------------|-------------|--------|
| Low traffic (<1TB/mo) | ~$73 | ~$78 | VPC Endpoints |
| Medium traffic (1-5TB/mo) | ~$73 | ~$78-$258 | VPC Endpoints |
| High traffic (>5TB/mo) | ~$73 | $258+ | VPC Endpoints |

**Key Insight**: VPC Endpoints have fixed costs regardless of data volume, while NAT Gateway costs scale with traffic. For most scenarios, VPC Endpoints are more cost-effective.

### Multi-AZ Cost Impact

| Configuration | Interface Endpoint Cost | Note |
|---------------|-------------------------|------|
| Single AZ (current) | ~$73/month | Lower cost, no HA |
| 2 AZs | ~$146/month | 2x cost, HA |
| 3 AZs | ~$219/month | 3x cost, full HA |

---

## Configuration Options

### Option 1: Single Subnet (Current - Cost Optimized)

The current configuration uses **one private subnet in us-east-1b** for all Interface endpoints:

```hcl
# In vpc_endpoints.tf (current configuration)
variable "vpc_endpoint_az" {
  description = "Availability Zone for VPC Interface Endpoints"
  type        = string
  default     = "us-east-1b"  # Single AZ
}

# Get single subnet
data "aws_subnet" "endpoint_subnet" {
  vpc_id            = local.vpc_id
  availability_zone = var.vpc_endpoint_az

  filter {
    name   = "tag:Name"
    values = ["Private*"]
  }
}

locals {
  endpoint_subnet_ids = [data.aws_subnet.endpoint_subnet.id]
}
```

**Pros:**
- Lowest cost (~$73/month for 10 endpoints)
- Simple configuration

**Cons:**
- No high availability for endpoints
- If us-east-1b has issues, AWS service access is impacted

### Option 2: Change to a Different Single Subnet

To use a different AZ (e.g., us-east-1a), simply update the variable:

```hcl
# Option A: Change the default in vpc_endpoints.tf
variable "vpc_endpoint_az" {
  default = "us-east-1a"  # Changed from us-east-1b
}

# Option B: Override via terraform.tfvars
vpc_endpoint_az = "us-east-1a"

# Option C: Override via CLI
terraform apply -var="vpc_endpoint_az=us-east-1a"
```

### Option 3: Multi-Subnet / Multi-AZ (High Availability)

To deploy endpoints across multiple AZs for high availability, modify the configuration:

```hcl
# Replace the single subnet lookup with multiple subnets

# Option A: Specify AZs explicitly
variable "vpc_endpoint_azs" {
  description = "Availability Zones for VPC Interface Endpoints (multi-AZ for HA)"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]  # 2 AZs
  # Or for full HA:
  # default   = ["us-east-1a", "us-east-1b", "us-east-1c"]  # 3 AZs
}

# Get multiple subnets
data "aws_subnets" "endpoint_subnets" {
  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  filter {
    name   = "availability-zone"
    values = var.vpc_endpoint_azs
  }

  filter {
    name   = "tag:Name"
    values = ["Private*"]
  }
}

locals {
  endpoint_subnet_ids = data.aws_subnets.endpoint_subnets.ids
}
```

Then update each endpoint resource to use the new `locals.endpoint_subnet_ids`:

```hcl
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids  # Now includes multiple subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  # ...
}
```

### Option 4: Use All Private Subnets

To automatically use all private subnets in the VPC:

```hcl
# Get all private subnets
data "aws_subnets" "all_private" {
  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  filter {
    name   = "tag:Name"
    values = ["Private*"]
  }
}

locals {
  endpoint_subnet_ids = data.aws_subnets.all_private.ids
}
```

---

## Security Configuration

### Security Group Rules

The VPC endpoints security group (`pohualizcalli-vpc-endpoints-sg`) allows:

| Direction | Port | Source | Purpose |
|-----------|------|--------|---------|
| Ingress | 443 | ECS Tasks SG | Container AWS API calls |
| Ingress | 443 | ALB SG | Health checks |
| Ingress | 443 | VPC CIDR | Other VPC resources |
| Egress | All | 0.0.0.0/0 | Response traffic |

### Best Practices

1. **Principle of Least Privilege**: The security group restricts access to known sources
2. **Private DNS**: Enabled for all Interface endpoints to use standard AWS service URLs
3. **No Internet Exposure**: Traffic stays within AWS network

---

## Adding More Endpoints

To add additional AWS service endpoints, follow this pattern:

```hcl
# =============================================================================
# [Service Name] Endpoint (Interface)
# =============================================================================
# Required for:
#   - [Use case 1]
#   - [Use case 2]
# =============================================================================

resource "aws_vpc_endpoint" "new_service" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.[service-name]"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-[service]-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# Add output
output "vpc_endpoint_new_service_id" {
  description = "[Service] Endpoint ID"
  value       = aws_vpc_endpoint.new_service.id
}
```

### Common Additional Endpoints

| Service | Service Name | Use Case |
|---------|--------------|----------|
| Lambda | `lambda` | Invoking Lambda functions |
| SNS | `sns` | Publishing notifications |
| SQS | `sqs` | Queue operations |
| DynamoDB | `dynamodb` (Gateway) | Database access (FREE) |
| API Gateway | `execute-api` | Private API access |

---

## Troubleshooting

### Endpoints Not Working

1. **Check Security Group**: Ensure HTTPS (443) is allowed from source
2. **Check Subnet Association**: Verify endpoints are in correct subnets
3. **Check Private DNS**: Must be enabled for Interface endpoints
4. **Check Route Tables**: S3 Gateway endpoint needs route table association

### Verify Endpoint Status

```bash
# List all endpoints
aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=<vpc-id>" \
  --query 'VpcEndpoints[*].[ServiceName,State]'

# Check specific endpoint
aws ec2 describe-vpc-endpoints \
  --vpc-endpoint-ids <endpoint-id>
```

### Test Connectivity

```bash
# From within a private subnet (e.g., ECS task or bastion)
# Test S3
aws s3 ls

# Test ECR
aws ecr describe-repositories

# Test Secrets Manager
aws secretsmanager list-secrets
```

---

## Migration Checklist

When switching from NAT Gateway to VPC Endpoints:

- [ ] Deploy all required VPC endpoints
- [ ] Verify endpoint status is "available"
- [ ] Test AWS service connectivity from private subnets
- [ ] Verify ECS tasks can pull images
- [ ] Verify CloudWatch logs are flowing
- [ ] Verify Secrets Manager access
- [ ] Remove NAT Gateway (after successful validation)
- [ ] Update route tables to remove NAT routes

---

## References

- [AWS VPC Endpoints Documentation](https://docs.aws.amazon.com/vpc/latest/privatelink/vpc-endpoints.html)
- [VPC Endpoint Pricing](https://aws.amazon.com/privatelink/pricing/)
- [AWS PrivateLink](https://aws.amazon.com/privatelink/)

# =============================================================================
# VPC Endpoints for Private Subnet Access (No NAT Required)
# =============================================================================
# These endpoints allow resources in private subnets to access AWS services
# without requiring a NAT Gateway, reducing costs and improving security.
#
# SINGLE AZ CONFIGURATION: us-east-1b
# To reduce costs, all Interface endpoints are deployed in a single AZ.
# This cuts Interface endpoint costs by ~50% compared to multi-AZ.
#
# Cost Considerations:
#   - S3 Gateway Endpoint: FREE
#   - Interface Endpoints: ~$0.01/hour each (single AZ) + data processing fees
#   - Compare to NAT Gateway: ~$0.045/hour + $0.045/GB data processed
#
# For low-traffic scenarios, VPC endpoints are more cost-effective than NAT.
# =============================================================================

# -----------------------------------------------------------------------------
# Configuration: Single AZ for VPC Endpoints
# -----------------------------------------------------------------------------

variable "vpc_endpoint_az" {
  description = "Availability Zone for VPC Interface Endpoints (single AZ to reduce costs)"
  type        = string
  default     = "us-east-1b"
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

# Get the private subnet in the specified AZ (us-east-1b)
data "aws_subnet" "endpoint_subnet" {
  vpc_id            = local.vpc_id
  availability_zone = var.vpc_endpoint_az

  filter {
    name   = "tag:Name"
    values = ["Private*"]
  }
}

# Get private route tables associated with private subnets
data "aws_route_tables" "private" {
  vpc_id = local.vpc_id

  filter {
    name   = "association.subnet-id"
    values = local.ecs_subnet_ids
  }
}

# Fallback: Get all route tables in VPC if association filter returns empty
data "aws_route_tables" "vpc_all" {
  vpc_id = local.vpc_id
}

# Local for the single subnet to use for all Interface endpoints
locals {
  endpoint_subnet_ids = [data.aws_subnet.endpoint_subnet.id]
}

# -----------------------------------------------------------------------------
# Security Group for VPC Endpoints
# -----------------------------------------------------------------------------

resource "aws_security_group" "vpc_endpoints" {
  name        = "pohualizcalli-vpc-endpoints-sg"
  description = "Security group for VPC Interface Endpoints - allows HTTPS from ECS tasks"
  vpc_id      = local.vpc_id

  # Allow HTTPS (443) from ECS tasks security group
  ingress {
    description     = "HTTPS from ECS tasks"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks_sg.id]
  }

  # Allow HTTPS (443) from ALB security group (for health checks if needed)
  ingress {
    description     = "HTTPS from ALB"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  # Fallback: Allow HTTPS from VPC CIDR (for other resources like bastion, Lambda, etc.)
  ingress {
    description = "HTTPS from VPC CIDR"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.my_vpc.cidr_block]
  }

  # Allow all outbound (endpoints need to respond)
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "pohualizcalli-vpc-endpoints-sg"
    Project = "Pohualizcalli"
  }
}

# =============================================================================
# S3 Gateway Endpoint (FREE - Always use Gateway type for S3)
# =============================================================================
# Required for:
#   - ECR image layer downloads (stored in S3)
#   - Application S3 access (pohualizcalli-several-files bucket)
#   - Terraform state backend (if using S3)
# =============================================================================

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = local.vpc_id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"

  # Associate with route tables (use private route tables or all if filter returns empty)
  route_table_ids = length(data.aws_route_tables.private.ids) > 0 ? data.aws_route_tables.private.ids : data.aws_route_tables.vpc_all.ids

  tags = {
    Name    = "pohualizcalli-s3-endpoint"
    Project = "Pohualizcalli"
    Type    = "Gateway"
    Cost    = "Free"
  }
}

# =============================================================================
# ECR API Endpoint (Interface)
# =============================================================================
# Required for:
#   - docker login (ECR authentication)
#   - ECR API calls (describe images, create repository, etc.)
# =============================================================================

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ecr-api-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# ECR DKR Endpoint (Interface)
# =============================================================================
# Required for:
#   - docker pull (downloading container images)
#   - docker push (uploading container images)
# =============================================================================

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ecr-dkr-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# CloudWatch Logs Endpoint (Interface)
# =============================================================================
# Required for:
#   - ECS container logs (awslogs driver)
#   - Application logging
#   - Lambda function logs
# =============================================================================

resource "aws_vpc_endpoint" "logs" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-logs-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# STS Endpoint (Interface)
# =============================================================================
# Required for:
#   - IAM role assumption (ECS task roles, Lambda execution roles)
#   - AWS SDK credential retrieval
#   - Cross-account access
# =============================================================================

resource "aws_vpc_endpoint" "sts" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.sts"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-sts-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# Secrets Manager Endpoint (Interface)
# =============================================================================
# Required for:
#   - Database credentials retrieval (db_secret_manager)
#   - Application secrets
#   - Automatic secret rotation
# =============================================================================

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-secretsmanager-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# KMS Endpoint (Interface)
# =============================================================================
# Required for:
#   - Decrypting SSM SecureString parameters
#   - Decrypting Secrets Manager secrets
#   - S3 server-side encryption (SSE-KMS)
#   - EBS volume encryption
# =============================================================================

resource "aws_vpc_endpoint" "kms" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.kms"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-kms-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# SSM Endpoint (Interface) - For Parameter Store Access
# =============================================================================
# Required for:
#   - SSM Parameter Store access (/pohualizcalli/ssm/* parameters)
#   - ECS container agent configuration
#   - Systems Manager capabilities
# =============================================================================

resource "aws_vpc_endpoint" "ssm" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ssm"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ssm-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# ECS Endpoints (Interface) - For ECS Agent Communication
# =============================================================================
# Required for:
#   - ECS agent registration with cluster
#   - Task state management
#   - Container instance health reporting
# =============================================================================

resource "aws_vpc_endpoint" "ecs_agent" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecs-agent"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ecs-agent-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

resource "aws_vpc_endpoint" "ecs_telemetry" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecs-telemetry"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ecs-telemetry-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

resource "aws_vpc_endpoint" "ecs" {
  vpc_id              = local.vpc_id
  service_name        = "com.amazonaws.${var.aws_region}.ecs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name    = "pohualizcalli-ecs-endpoint"
    Project = "Pohualizcalli"
    Type    = "Interface"
  }
}

# =============================================================================
# Outputs
# =============================================================================

output "vpc_endpoint_s3_id" {
  description = "S3 Gateway Endpoint ID"
  value       = aws_vpc_endpoint.s3.id
}

output "vpc_endpoint_ecr_api_id" {
  description = "ECR API Endpoint ID"
  value       = aws_vpc_endpoint.ecr_api.id
}

output "vpc_endpoint_ecr_dkr_id" {
  description = "ECR DKR Endpoint ID"
  value       = aws_vpc_endpoint.ecr_dkr.id
}

output "vpc_endpoint_logs_id" {
  description = "CloudWatch Logs Endpoint ID"
  value       = aws_vpc_endpoint.logs.id
}

output "vpc_endpoint_sts_id" {
  description = "STS Endpoint ID"
  value       = aws_vpc_endpoint.sts.id
}

output "vpc_endpoint_secretsmanager_id" {
  description = "Secrets Manager Endpoint ID"
  value       = aws_vpc_endpoint.secretsmanager.id
}

output "vpc_endpoint_kms_id" {
  description = "KMS Endpoint ID"
  value       = aws_vpc_endpoint.kms.id
}

output "vpc_endpoint_ssm_id" {
  description = "SSM Parameter Store Endpoint ID"
  value       = aws_vpc_endpoint.ssm.id
}

output "vpc_endpoints_security_group_id" {
  description = "Security Group ID for VPC Endpoints"
  value       = aws_security_group.vpc_endpoints.id
}

output "vpc_endpoint_subnet_id" {
  description = "Subnet ID used for VPC Interface Endpoints (single AZ)"
  value       = data.aws_subnet.endpoint_subnet.id
}

output "vpc_endpoint_az" {
  description = "Availability Zone for VPC Interface Endpoints"
  value       = var.vpc_endpoint_az
}

# =============================================================================
# Cost Summary (Estimates for us-east-1) - SINGLE AZ: us-east-1b
# =============================================================================
#
# Gateway Endpoints (FREE):
#   - S3: $0.00/month
#
# Interface Endpoints (~$7.30/month each for 1 AZ = $0.01/hour × 730 hours):
#   - ECR API:         ~$7.30/month
#   - ECR DKR:         ~$7.30/month
#   - CloudWatch Logs: ~$7.30/month
#   - STS:             ~$7.30/month
#   - Secrets Manager: ~$7.30/month
#   - KMS:             ~$7.30/month
#   - SSM:             ~$7.30/month
#   - ECS Agent:       ~$7.30/month
#   - ECS Telemetry:   ~$7.30/month
#   - ECS:             ~$7.30/month
#
# TOTAL: ~$73/month for 10 Interface Endpoints (1 AZ: us-east-1b)
#        (vs ~$146/month for 2 AZs - 50% savings!)
#
# Compare to NAT Gateway:
#   - $0.045/hour × 730 hours = $32.85/month (per NAT)
#   - $0.045/GB data processed (can add up quickly!)
#   - Single NAT = ~$33/month + data costs
#
# IMPORTANT: Single AZ means no HA for endpoints. If us-east-1b has issues,
# AWS service access will be impacted. For production HA, consider multi-AZ.
#
# VPC endpoints are REQUIRED once NAT is removed for AWS service access.
# =============================================================================

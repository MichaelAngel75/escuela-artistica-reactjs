# AWS AMI Creation Guide for Private Subnet Deployment

This document describes how to create a custom AWS AMI with all required dependencies pre-installed for deploying Node.js/React.js applications in a private subnet VPC **without NAT gateway or internet access**.

## Table of Contents
1. [Overview](#overview)
2. [Internet-Required Dependencies Analysis](#internet-required-dependencies-analysis)
3. [Architecture Considerations (x86_64 vs ARM/Graviton)](#architecture-considerations)
4. [AMI Creation Process](#ami-creation-process)
5. [Post-AMI Usage in Private Subnet](#post-ami-usage-in-private-subnet)
6. [Troubleshooting](#troubleshooting)

---

## Overview

### Problem Statement
When deploying applications in a private subnet without NAT gateway:
- No internet access for package downloads (`yum`, `dnf`, `npm`, `pip`, `docker pull`)
- All dependencies must be pre-baked into the AMI
- Docker images must be pulled from ECR via VPC endpoints (not public Docker Hub)

### Solution
Create a custom AMI in a **public subnet** with internet access, install all required packages, then use this AMI for ECS/EC2 instances in private subnets.

---

## Internet-Required Dependencies Analysis

Based on analysis of terraform files and shell scripts in this project, the following components require internet access during installation:

### 1. Operating System Packages

| Package | Purpose | Amazon Linux 2 | Amazon Linux 2023 |
|---------|---------|----------------|-------------------|
| `ecs-init` | ECS agent for container orchestration | `yum install -y ecs-init` | `dnf install -y ecs-init` |
| `docker` | Container runtime | Pre-installed in ECS-optimized AMI | Pre-installed |
| `git` | Source control | `yum install -y git` | `dnf install -y git` |
| `jq` | JSON processing | `yum install -y jq` | `dnf install -y jq` |
| `unzip` | Archive extraction | `yum install -y unzip` | `dnf install -y unzip` |
| `tar` | Archive handling | Pre-installed | Pre-installed |
| `curl` | HTTP requests | Pre-installed | Pre-installed |

### 2. Node.js Environment (via NVM)

From `devops-deployable-scripts/prepare-deploy.sh`:
```bash
# Downloads from: https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
nvm use 22
npm install --global yarn  # Optional
```

### 3. AWS CLI v2

Required for ECR login and deployment operations:
```bash
# Downloads from: https://awscli.amazonaws.com/
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
# ARM: curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 4. Terraform

From `devops-deployable-scripts/prepare-deploy.sh`:
```bash
# Downloads from: https://releases.hashicorp.com/terraform/
# Install via HashiCorp repo or direct download
```

### 5. AWS SAM CLI (for Lambda development)

From `lambda/diploma_generator/deploy.sh`:
```bash
# Downloads from: https://github.com/aws/aws-sam-cli/releases
pip install aws-sam-cli
# Or use brew on macOS
```

### 6. Python 3.11 + pip

From `lambda/diploma_generator/requirements.txt`:
```bash
pip install boto3 reportlab Pillow pypdf PyPDF2 requests
```

### 7. Docker Images (Pre-pull)

From `terraform/main.tf` user_data:
```bash
docker pull amazon/amazon-ecs-agent:latest
# Pre-pull base images for faster container startup:
docker pull node:22-alpine
docker pull python:3.11-slim
```

---

## Architecture Considerations

### x86_64 (Intel/AMD) - Default

**Base AMI**: Amazon Linux 2023 ECS-Optimized
```bash
# SSM Parameter for latest AMI ID:
/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id
# Example: ami-0abcdef1234567890
```

**Terraform Reference** (from `terraform/main.tf`):
```hcl
data "aws_ssm_parameter" "ecs_optimized_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
}

resource "aws_launch_template" "ecs" {
  image_id      = data.aws_ssm_parameter.ecs_optimized_ami.value
  instance_type = "t3.small"  # x86_64
}
```

### ARM/Graviton (aarch64) - Cost-Effective

**Base AMI**: Amazon Linux 2023 ECS-Optimized for ARM
```bash
# SSM Parameter for ARM AMI ID:
/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/arm64/image_id
```

**Terraform Reference**:
```hcl
data "aws_ssm_parameter" "ecs_optimized_ami_arm" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/arm64/image_id"
}

resource "aws_launch_template" "ecs" {
  image_id      = data.aws_ssm_parameter.ecs_optimized_ami_arm.value
  instance_type = "t4g.small"  # ARM/Graviton - ~20% cheaper
}
```

### Architecture-Specific Conflicts and Fixes

| Component | x86_64 | ARM (aarch64) | Notes |
|-----------|--------|---------------|-------|
| **AWS CLI v2** | `awscli-exe-linux-x86_64.zip` | `awscli-exe-linux-aarch64.zip` | Different download URLs |
| **Node.js native modules** | Pre-compiled binaries | May need compilation | `npm rebuild` after switching |
| **Docker images** | `node:22-alpine` | Same tag, multi-arch | Docker handles automatically |
| **Python packages** | Wheels available | Some need compilation | Install `gcc`, `python3-devel` |
| **Terraform** | `terraform_*_linux_amd64.zip` | `terraform_*_linux_arm64.zip` | HashiCorp provides both |

#### ARM-Specific Python Compilation Dependencies

```bash
# Required for compiling Python packages with C extensions on ARM
sudo dnf install -y \
  gcc \
  gcc-c++ \
  python3-devel \
  libffi-devel \
  openssl-devel \
  zlib-devel \
  libjpeg-turbo-devel  # For Pillow
```

---

## AMI Creation Process

### Option A: Manual AMI Creation (Recommended for Learning)

#### Step 1: Launch Base EC2 Instance

```bash
# Get latest AL2023 ECS-optimized AMI ID:  ami-05a9d3c6794653577
AMI_ID=$(aws ssm get-parameter \
  --name "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id" \
  --query "Parameter.Value" \
  --output text \
  --region us-east-1)

# For ARM:
# AMI_ID=$(aws ssm get-parameter \
#   --name "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/arm64/image_id" \
#   --query "Parameter.Value" \
#   --output text \
#   --region us-east-1)

# obtain all AMI:
# aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn*" --query 'sort_by(Images, &CreationDate)[].Name' --region us-east-1  --profile <profile>

echo "Using AMI: $AMI_ID"

# Launch instance in PUBLIC subnet with internet access
aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name your-key-pair \
  --subnet-id subnet-public-12345 \
  --security-group-ids sg-allow-ssh \
  --associate-public-ip-address \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=AMI-Builder}]' \
  --region us-east-1
```

#### Step 2: Install All Dependencies

SSH into the instance and run the following script:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "AMI Builder - Installing Dependencies"
echo "========================================"

# Detect architecture
ARCH=$(uname -m)
echo "Detected architecture: $ARCH"

# -----------------------------------------
# 1. System Updates and Base Packages
# -----------------------------------------
echo ">>> Installing system packages..."
sudo dnf update -y
sudo dnf install -y \
  git \
  jq \
  unzip \
  tar \
  curl \
  wget \
  rsync \
  make \
  gcc \
  gcc-c++ \
  python3 \
  python3-pip \
  python3-devel

# -----------------------------------------
# 2. Docker Configuration
# -----------------------------------------
echo ">>> Configuring Docker..."
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ec2-user

# -----------------------------------------
# 3. ECS Agent
# -----------------------------------------
echo ">>> Installing/updating ECS agent..."
sudo dnf install -y ecs-init || true
sudo systemctl enable ecs

# -----------------------------------------
# 4. AWS CLI v2
# -----------------------------------------
echo ">>> Installing AWS CLI v2..."
if [ "$ARCH" = "x86_64" ]; then
  curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "/tmp/awscliv2.zip"
elif [ "$ARCH" = "aarch64" ]; then
  curl -s "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "/tmp/awscliv2.zip"
fi
cd /tmp && unzip -q awscliv2.zip
sudo ./aws/install --update
rm -rf /tmp/aws /tmp/awscliv2.zip

# -----------------------------------------
# 5. NVM + Node.js 22
# -----------------------------------------
echo ">>> Installing NVM and Node.js 22..."
export NVM_DIR="/home/ec2-user/.nvm"
mkdir -p "$NVM_DIR"

curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Source NVM
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 22
nvm use 22
nvm alias default 22

# Verify
node --version
npm --version

# Install global npm packages
npm install -g yarn

# -----------------------------------------
# 6. Terraform
# -----------------------------------------
echo ">>> Installing Terraform..."
TERRAFORM_VERSION="1.7.5"
if [ "$ARCH" = "x86_64" ]; then
  TERRAFORM_ARCH="amd64"
elif [ "$ARCH" = "aarch64" ]; then
  TERRAFORM_ARCH="arm64"
fi

curl -sLO "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_${TERRAFORM_ARCH}.zip"
unzip -q "terraform_${TERRAFORM_VERSION}_linux_${TERRAFORM_ARCH}.zip"
sudo mv terraform /usr/local/bin/
rm -f "terraform_${TERRAFORM_VERSION}_linux_${TERRAFORM_ARCH}.zip"
terraform --version

# -----------------------------------------
# 7. AWS SAM CLI
# -----------------------------------------
echo ">>> Installing AWS SAM CLI..."
pip3 install --user aws-sam-cli
echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/ec2-user/.bashrc

# -----------------------------------------
# 8. Python Dependencies for Lambda Development
# -----------------------------------------
echo ">>> Installing Python dependencies..."
pip3 install --user \
  boto3 \
  reportlab \
  Pillow \
  pypdf \
  PyPDF2 \
  requests

# -----------------------------------------
# 9. Pre-pull Docker Images (Optional but Recommended)
# -----------------------------------------
echo ">>> Pre-pulling Docker images..."
# Note: These will be pulled via ECR in private subnet
# Pre-pull common base images for faster startup
docker pull amazon/amazon-ecs-agent:latest || true
docker pull node:22-alpine || true
docker pull python:3.11-slim || true

# -----------------------------------------
# 10. Configure NVM for all users
# -----------------------------------------
echo ">>> Configuring NVM system-wide..."
cat >> /home/ec2-user/.bashrc << 'EOF'

# NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
EOF

# -----------------------------------------
# 11. Clean up
# -----------------------------------------
echo ">>> Cleaning up..."
sudo dnf clean all
rm -rf /var/cache/dnf/*
rm -rf /tmp/*

echo "========================================"
echo "AMI Builder - Installation Complete!"
echo "========================================"
echo ""
echo "Installed versions:"
echo "  - AWS CLI: $(aws --version)"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - Terraform: $(terraform --version | head -1)"
echo "  - Docker: $(docker --version)"
echo "  - Python: $(python3 --version)"
```

#### Step 3: Prepare for AMI Creation

```bash
# Clear sensitive data before creating AMI
sudo rm -rf /home/ec2-user/.aws/credentials
sudo rm -rf /home/ec2-user/.ssh/authorized_keys  # Will be re-injected by EC2

# Clear logs
sudo rm -rf /var/log/*

# Stop the instance (optional - can create AMI from running instance)
# sudo shutdown -h now
```

#### Step 4: Create the AMI

```bash
# From your local machine or bastion host
INSTANCE_ID="i-0123456789abcdef0"  # Your builder instance ID

aws ec2 create-image \
  --instance-id $INSTANCE_ID \
  --name "pohualizcalli-private-subnet-ami-$(date +%Y%m%d)" \
  --description "Custom AMI for Node.js/React.js deployment in private subnet without NAT" \
  --no-reboot \
  --tag-specifications 'ResourceType=image,Tags=[{Key=Name,Value=pohualizcalli-private-subnet-ami},{Key=Project,Value=Pohualizcalli}]' \
  --region us-east-1

# Note the AMI ID from the output
```

### Option B: Packer Automation (Production Recommended)

Create a file `packer/ami-builder.pkr.hcl`:

```hcl
packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "architecture" {
  type    = string
  default = "x86_64"  # or "arm64"
}

data "amazon-ami" "al2023_ecs" {
  filters = {
    name                = "al2023-ami-ecs-hvm-*"
    root-device-type    = "ebs"
    virtualization-type = "hvm"
    architecture        = var.architecture
  }
  most_recent = true
  owners      = ["amazon"]
  region      = var.aws_region
}

source "amazon-ebs" "private_subnet_ami" {
  ami_name      = "pohualizcalli-private-subnet-${var.architecture}-{{timestamp}}"
  instance_type = var.architecture == "x86_64" ? "t3.medium" : "t4g.medium"
  region        = var.aws_region
  source_ami    = data.amazon-ami.al2023_ecs.id

  ssh_username = "ec2-user"

  tags = {
    Name         = "Pohualizcalli Private Subnet AMI"
    Architecture = var.architecture
    BaseAMI      = "{{ .SourceAMI }}"
    Project      = "Pohualizcalli"
  }
}

build {
  sources = ["source.amazon-ebs.private_subnet_ami"]

  provisioner "shell" {
    script = "scripts/install-dependencies.sh"
    environment_vars = [
      "ARCH=${var.architecture}"
    ]
  }

  provisioner "shell" {
    inline = [
      "sudo dnf clean all",
      "sudo rm -rf /var/cache/dnf/*",
      "sudo rm -rf /tmp/*"
    ]
  }
}
```

Build command:
```bash
# For x86_64
packer build -var 'architecture=x86_64' packer/ami-builder.pkr.hcl

# For ARM
packer build -var 'architecture=arm64' packer/ami-builder.pkr.hcl
```

---

## Post-AMI Usage in Private Subnet

### Required VPC Endpoints

VPC endpoints are already configured in this project at `terraform/vpc_endpoints.tf`.

**Endpoints included (Single AZ: us-east-1b for cost savings):**

| Endpoint | Type | Purpose | Cost (1 AZ) |
|----------|------|---------|-------------|
| S3 | Gateway | ECR image layers, app S3 access | FREE |
| ECR API | Interface | Docker login, ECR API calls | ~$7.30/mo |
| ECR DKR | Interface | Docker pull/push | ~$7.30/mo |
| CloudWatch Logs | Interface | ECS/Lambda logging | ~$7.30/mo |
| STS | Interface | IAM role assumption | ~$7.30/mo |
| Secrets Manager | Interface | Database credentials | ~$7.30/mo |
| KMS | Interface | Decrypt SSM/Secrets | ~$7.30/mo |
| SSM | Interface | Parameter Store access | ~$7.30/mo |
| ECS (3 endpoints) | Interface | Agent, telemetry, API | ~$21.90/mo |

**Total: ~$73/month** (vs ~$146/month for 2 AZs - 50% savings!)

**Deploy VPC Endpoints:**
```bash
cd terraform
terraform plan -var="aws_profile=pohualizcalliTerraform" -var="ecr_remote_tag=current"
terraform apply -var="aws_profile=pohualizcalliTerraform" -var="ecr_remote_tag=current"
```

**Verify Endpoints Created:**
```bash
aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=$(terraform output -raw vpc_id)" \
  --query 'VpcEndpoints[].{Service:ServiceName,State:State}' \
  --output table \
  --profile pohualizcalliTerraform
```

### Using Custom AMI in Terraform

Update `terraform/main.tf` to use your custom AMI:

```hcl
# Option 1: Hardcode AMI ID
variable "custom_ami_id" {
  description = "Custom AMI with pre-baked dependencies"
  default     = "ami-0123456789abcdef0"  # Your custom AMI ID
}

# Option 2: Use data source to find latest custom AMI
data "aws_ami" "custom_private_subnet" {
  most_recent = true
  owners      = ["self"]

  filter {
    name   = "name"
    values = ["pohualizcalli-private-subnet-*"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "pohualizcalli-ecs-"

  # Use custom AMI instead of ECS-optimized public AMI
  image_id      = data.aws_ami.custom_private_subnet.id
  # Or: image_id = var.custom_ami_id

  instance_type = "t3.small"  # or t4g.small for ARM

  # Simplified user_data (no package installation needed)
  user_data = base64encode(<<EOF
#!/usr/bin/env bash
echo "ECS_CLUSTER=pohualizcalli-ecs-cluster" >> /etc/ecs/ecs.config
systemctl enable --now docker
systemctl enable --now ecs
EOF
  )
}
```

### Deployment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVELOPMENT MACHINE (macOS)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 1. npm install && npm run build                          │   │
│  │ 2. docker build -t app:tag .                             │   │
│  │ 3. docker push <ECR_REPO>:tag                            │   │
│  │ 4. terraform apply (via bastion SSH tunnel)              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AWS VPC                                   │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │   PUBLIC SUBNET     │    │      PRIVATE SUBNET             │ │
│  │                     │    │                                 │ │
│  │  ┌───────────────┐  │    │  ┌───────────────────────────┐ │ │
│  │  │ Bastion Host  │◄─┼────┼─►│  ECS Instance (Custom AMI)│ │ │
│  │  │ (Optional)    │  │    │  │  - No internet access     │ │ │
│  │  └───────────────┘  │    │  │  - VPC Endpoints only     │ │ │
│  │                     │    │  │  - Pre-baked dependencies │ │ │
│  │  ┌───────────────┐  │    │  │  - Pulls from ECR via     │ │ │
│  │  │     ALB       │◄─┼────┼──│    VPC endpoint           │ │ │
│  │  └───────────────┘  │    │  └───────────────────────────┘ │ │
│  └─────────────────────┘    │                                 │ │
│                             │  ┌───────────────────────────┐  │ │
│   VPC Endpoints:            │  │  Docker Container         │  │ │
│   - ECR (api + dkr)         │  │  (node:22-alpine from ECR)│  │ │
│   - S3                      │  │  - React frontend         │  │ │
│   - CloudWatch Logs         │  │  - Node.js backend        │  │ │
│   - SSM                     │  └───────────────────────────┘  │ │
│   - Secrets Manager         └─────────────────────────────────┘ │
│   - ECS (agent + telemetry)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Common Issues

#### 1. Docker Pull Fails in Private Subnet
**Symptom**: `Error: pull access denied` or `timeout`

**Cause**: Missing VPC endpoints or security group rules

**Fix**:
```bash
# Verify VPC endpoints exist
aws ec2 describe-vpc-endpoints --filters "Name=vpc-id,Values=vpc-xxx" --query 'VpcEndpoints[].ServiceName'

# Ensure security group allows 443 from VPC CIDR
```

#### 2. ECS Agent Not Registering
**Symptom**: Instance not appearing in ECS cluster

**Cause**: Missing ECS VPC endpoints

**Fix**:
```bash
# Check ECS agent logs
sudo cat /var/log/ecs/ecs-agent.log

# Verify ECS config
cat /etc/ecs/ecs.config

# Ensure ecs-agent, ecs-telemetry endpoints are created
```

#### 3. npm install Fails (ARM Architecture)
**Symptom**: Native module compilation errors

**Cause**: Missing build tools for ARM

**Fix**:
```bash
sudo dnf install -y gcc gcc-c++ make python3-devel

# Rebuild native modules
npm rebuild
```

#### 4. Pillow Installation Fails on ARM
**Symptom**: `error: command 'gcc' failed`

**Cause**: Missing image library headers

**Fix**:
```bash
sudo dnf install -y \
  libjpeg-turbo-devel \
  zlib-devel \
  libpng-devel \
  freetype-devel

pip3 install --user Pillow
```

#### 5. SSM/Secrets Access Denied
**Symptom**: `AccessDeniedException` when accessing SSM parameters

**Cause**: Missing VPC endpoint or IAM permissions

**Fix**:
- Verify SSM VPC endpoint exists
- Check IAM role has `ssm:GetParameter` permission
- Verify security group allows 443 to VPC endpoint

### Verification Commands

```bash
# Check if instance can reach AWS services via VPC endpoints
aws sts get-caller-identity  # Should work
aws ecr get-login-password --region us-east-1  # Should return token
aws ssm get-parameter --name /your/param  # Should return value

# Check Docker can pull from ECR
aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker pull <account>.dkr.ecr.us-east-1.amazonaws.com/your-repo:tag

# Check ECS agent status
sudo systemctl status ecs
sudo cat /var/log/ecs/ecs-agent.log | tail -50
```

---

## Summary Checklist

### Pre-AMI Creation
- [ ] Launch EC2 in public subnet with internet access
- [ ] Install system packages (git, jq, unzip, gcc)
- [ ] Install Docker and configure for ec2-user
- [ ] Install ECS agent (ecs-init)
- [ ] Install AWS CLI v2 (correct architecture)
- [ ] Install NVM + Node.js 22
- [ ] Install Terraform
- [ ] Install AWS SAM CLI (optional, for Lambda dev)
- [ ] Pre-pull common Docker images
- [ ] Clean up sensitive data and caches
- [ ] Create AMI

### Post-AMI (Private Subnet Setup)
- [ ] Create VPC endpoints (ECR, S3, Logs, SSM, Secrets, ECS)
- [ ] Configure security groups for VPC endpoints
- [ ] Update Launch Template to use custom AMI
- [ ] Simplify user_data (no package installation)
- [ ] Test ECS agent registration
- [ ] Test ECR pull via VPC endpoint
- [ ] Test application deployment

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-31 | 1.0.0 | Initial documentation |

---

## References

- [Amazon ECS-Optimized AMIs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html)
- [VPC Endpoints for ECR](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html)
- [AWS CLI Installation](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- [HashiCorp Packer](https://developer.hashicorp.com/packer/tutorials/aws-get-started)
- [NVM Installation](https://github.com/nvm-sh/nvm)

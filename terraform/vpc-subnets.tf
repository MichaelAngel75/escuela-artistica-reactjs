#########################
# 1) Get VPC by tag
#########################
data "aws_vpc" "my_vpc" {
  filter {
    name   = "tag:Name"
    values = ["MyVPC"]
  }
}

# "Variable" holding the VPC id
locals {
  vpc_id = data.aws_vpc.my_vpc.id
}

#########################
# 2) Get PRIVATE subnets (Name starts with "Private*")
#########################
data "aws_subnets" "private_subnets" {
  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  # EC2 API supports wildcards like "Private*"
  filter {
    name   = "tag:Name"
    values = ["Private*"]
  }
}

#########################
# 3) Get PUBLIC subnets (Name starts with "Public*")
#########################
data "aws_subnets" "public_subnets" {
  filter {
    name   = "vpc-id"
    values = [local.vpc_id]
  }

  filter {
    name   = "tag:Name"
    values = ["Public*"]
  }
}

# Terraform "variable" with all public subnet IDs (for ALB, NAT, etc.)
locals {
  public_subnet_ids = data.aws_subnets.public_subnets.ids
}
# Terraform "variable" with all private subnet IDs (for ECS)
locals {
  ecs_subnet_ids = data.aws_subnets.private_subnets.ids
  # ecs_subnet_ids = data.aws_subnets.public_subnets.ids
}

#########################
# 4) (Optional) expose them as outputs
#########################
output "vpc_id" {
  value = local.vpc_id
}

output "ecs_subnet_ids" {
  value = local.ecs_subnet_ids
}

output "public_subnets_ids" {
  value = local.public_subnet_ids
}

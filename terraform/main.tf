# ----------------------------------------------------
# ECS Cluster
# ----------------------------------------------------

resource "aws_ecs_cluster" "this" {
  name = "pohualizcalli-ecs-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

# ----------------------------------------------------
# ECR repository for the full-stack image
# ----------------------------------------------------
# resource "null_resource" "build_and_push_image" {
#   # Rebuild if Dockerfile or key app files change
#   triggers = {
#     dockerfile_hash = filesha1("${var.docker_build_context}/Dockerfile")
#   }

#   provisioner "local-exec" {
#     command = <<EOT
#       set -e

#       AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
#       AWS_REGION=${var.aws_region}
#       REPO_URL=${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_ssm_parameter.aws_region_param.value}.amazonaws.com/pohualizcalli-admin:${local.ecr_image_tag}

#       echo "Logging in to ECR..."
#       aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $REPO_URL

#       echo "Building Docker image..."
#       docker build -t pohualizcalli-app:${local.ecr_image_tag} ${var.docker_build_context}
#       echo # NOT DOING THIS docker build -t pohualizcalli-app:${local.ecr_image_tag} ${var.docker_build_context}

#       echo "Tagging image..."
#       docker tag pohualizcalli-app:${local.ecr_image_tag} $REPO_URL
#       echo # NOT DOING THIS docker tag pohualizcalli-app:${local.ecr_image_tag} $REPO_URL:${local.ecr_image_tag}

#       echo "Pushing image..."
#       docker push $REPO_URL
#       echo # NOT DOING THIS docker push $REPO_URL:${local.ecr_image_tag}
#     EOT
#   }
# }

# ----------------------------------------------------
# IAM Role for ECS task execution
# ----------------------------------------------------

resource "aws_iam_role" "ecs_task_execution" {
  name = "pohualizcalli-ecs-task-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# If your app reads from S3, SSM, etc., add more policies here.

# ----------------------------------------------------
# Security Groups
# ----------------------------------------------------

resource "aws_security_group" "alb_sg" {
  name        = "pohualizcalli-alb-sg"
  description = "ALB security group"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # HTTPS 443
  ingress {
    description      = "HTTPS from anywhere"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

resource "aws_security_group" "ecs_tasks_sg" {
  name        = "pohualizcalli-ecs-tasks-sg"
  description = "Allow traffic from ALB to ECS tasks"
  vpc_id      = local.vpc_id

  ingress {
    description     = "From ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# ----------------------------------------------------
# Application Load Balancer + Target Group + Listener
# ----------------------------------------------------

resource "aws_lb" "this" {
  name               = "pohualizcalli-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = local.public_subnet_ids
}

resource "aws_lb_target_group" "this" {
  name     = "pohualizcalli-tg"
  port     = var.container_port
  protocol = "HTTP"
  vpc_id   = local.vpc_id
  target_type = "ip" # works well with ECS awsvpc mode

  health_check {
    path                = var.health_check_path
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 5
    interval            = 30
    matcher             = "200-399"
  }
}



# ----------------------------------------------------
# Now create Route53 record pointing to ALB
# ----------------------------------------------------

resource "aws_route53_record" "subdomain" {
  zone_id = local.hosted_zone_id
  name    = local.fqdn
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

# ----------------------------------------------------
# ECS Task Definition (single image, full stack)
# ----------------------------------------------------

# Existing IAM role created manually in AWS console
data "aws_iam_role" "app_task_role" {
  name = "mabels-rescue-role"
}

resource "aws_ecs_task_definition" "pohualizcalli_task" {
  family                   = "pohualizcalli-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["EC2"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = data.aws_iam_role.app_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "pohualizcalli-app"
      image     = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_ssm_parameter.aws_region_param.value}.amazonaws.com/pohualizcalli-admin:${var.ecr_remote_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        # Add your env vars here or from SSM/Secrets Manager
        # { name = "NODE_ENV", value = "production" }
        # {
        #   name      = "AWS_ACCESS_KEY_ID"
        #   value = data.aws_ssm_parameter.aws_access_key.value
        # },
        # {
        #   name      = "AWS_SECRET_ACCESS_KEY"
        #   value = data.aws_ssm_parameter.aws_secret_key.value
        # }, 
        {
          name     = "ACADEMY_NODE_ENV",
          value    = "production"
        },
        {
          name     = "ACADEMY_DB_SECRET_MANAGER"
          value    = data.aws_ssm_parameter.aws_db_secret_manager.value
        },
        {
          name     = "ACADEMY_DB_SCHEMA",
          value    = data.aws_ssm_parameter.aws_db_schema.value
        },
        {
          name      = "ACADEMY_SESSION_SECRET"
          value = data.aws_ssm_parameter.session_secret.value
        },
        {
          name      = "ACADEMY_GOOGLE_CLIENT_ID"
          value = data.aws_ssm_parameter.google_client_id.value
        },
        {
          name      = "ACADEMY_GOOGLE_CLIENT_SECRET"
          value = data.aws_ssm_parameter.google_client_secret.value
        }, 
        {
          name     = "ACADEMY_GOOGLE_CALLBACK_URL",
          value    = data.aws_ssm_parameter.google_callback_url.value
        },
        {
          name  = "ACADEMY_PORT"
          value = data.aws_ssm_parameter.port.value
        },
        {
          name  = "ACADEMY_PRIVATE_OBJECT_DIR"
          value = data.aws_ssm_parameter.academy_private_object_dir.value
        },
                {
          name  = "ACADEMY_SQS_DIPLOMA_GENERATION"
          value = data.aws_ssm_parameter.academy_sqs_diploma_generation.value
        },
        {
          name  = "ACADEMY_AWS_REGION"
          value = data.aws_ssm_parameter.aws_region_param.value
        },
        {
          name  = "ACADEMY_S3_BUCKET"
          value = data.aws_ssm_parameter.aws_bucket_name.value
        },
        {
          name  = "ACADEMY_RESOURCES_DOMAIN"
          value = data.aws_ssm_parameter.academy_resources_domain.value
        },
        {
          name  = "ACADEMY_INTERNAL_API_HEADER"
          value = data.aws_ssm_parameter.academy_internal_api_header.value
        },
        {
          name  = "ACADEMY_API_KEY_INTERNAL_CALL_PARAM_NAME"
          value = data.aws_ssm_parameter.academy_internal_api_key_param_name.value
        },        
        # {
        #   name     = "DB_SECRET_MANAGER",
        #   value    = data.aws_ssm_parameter.aws_db_secret_manager.value
        # },
        # {
        #   name     = "GOOGLE_SHEETS_SECRET_MANAGER",
        #   value    = data.aws_ssm_parameter.google_sheets_secret_manager.value
        # },
        # {
        #   name     = "DB_USER_NAME",
        #   value    = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)["db_user"]
        # },
        # {
        #   name     = "DB_PASSWORD",
        #   value    = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)["db_password"]
        # },
        # {
        #   name     = "DB_URL_1",
        #   value    = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)["db_to_concatenate_1"]
        # },
        # {
        #   name     = "DB_URL_2",
        #   value    = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)["db_to_concatenate_2"]
        # }   
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/pohualizcalli"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  # depends_on = [
  #   null_resource.build_and_push_image
  # ]
}

# CloudWatch Log Group (for ecs logs)
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/pohualizcalli"
  retention_in_days = 30
}

# ----------------------------------------------------
# ECS Service (desired counte1 = 1)
# NOTE: Underlying EC2 instances must already be joined
# to this cluster (ECS agent configured).
# ----------------------------------------------------

resource "aws_ecs_service" "pohualizcalli_service" {
  name            = "pohualizcalli-service"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.pohualizcalli_task.arn
  desired_count   = 1
  launch_type     = "EC2"

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  network_configuration {
    subnets         = local.ecs_subnet_ids
    security_groups = [aws_security_group.ecs_tasks_sg.id]
    # assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "pohualizcalli-app"
    container_port   = var.container_port
  }

  lifecycle {
    ignore_changes = [desired_count] # optional
  }

  depends_on = [
    aws_lb_listener.http,
    aws_autoscaling_group.ecs     # AFP missing
  ]
}



# ----------------------------------------------------
# IAM role & instance profile for ECS container instances
# ----------------------------------------------------
resource "aws_iam_role" "ecs_instance_role" {
  name = "pohualizcalli-ecs-instance-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = {
        Service = "ec2.amazonaws.com"
      },
      Action = "sts:AssumeRole"
    }]
  })
}


# ------- added probably not requried -----
data "aws_iam_policy" "pohualizcalli_terraform_policy_01" {
  name = "mabels-terraform-policy"
}

# ✅ Attach the SAME policy to the ECS instance role
resource "aws_iam_role_policy_attachment" "ecs_instance_extra_policy_01" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = data.aws_iam_policy.pohualizcalli_terraform_policy_01.arn
}

data "aws_iam_policy" "pohualizcalli_terraform_policy_02" {
  name = "mabels-terraform-policy-more-01"
}

resource "aws_iam_role_policy_attachment" "ecs_instance_extra_policy_02" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = data.aws_iam_policy.pohualizcalli_terraform_policy_02.arn
}



# --------------------------------------------------
resource "aws_iam_role_policy_attachment" "ecs_instance_role_attach" {
  role       = aws_iam_role.ecs_instance_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_instance_profile" "ecs_instance_profile" {
  name = "pohualizcalli-ecs-instance-profile-v5"
  role = aws_iam_role.ecs_instance_role.name
}

# ----------------------------------------------------
# Launch template for ECS container instances
# ----------------------------------------------------
data "aws_ssm_parameter" "ecs_optimized_ami" {
  name = "/aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id"
  # is using ami id: ami-03c372984aa87defd
  # with location: amazon/amzn2-ami-ecs-hvm-2.0.20251119-x86_64-ebs
          # /aws/service/ecs/optimized-ami/amazon-linux-2023/<version>
}

resource "aws_launch_template" "ecs" {
  name_prefix   = "pohualizcalli-ecs-"
  image_id      = data.aws_ssm_parameter.ecs_optimized_ami.value
  instance_type = "t3.small"

  iam_instance_profile {
    name = aws_iam_instance_profile.ecs_instance_profile.name
  }

  network_interfaces {
    security_groups = [aws_security_group.ecs_tasks_sg.id]
    associate_public_ip_address = false
  }

# #!/bin/bash
# echo "ECS_CLUSTER=${aws_ecs_cluster.this.name}" >> /etc/ecs/ecs.config

  user_data = base64encode(<<EOF
#!/usr/bin/env bash
echo "ECS_CLUSTER=pohualizcalli-ecs-cluster" >> /etc/ecs/ecs.config
sudo yum update -y ecs-init
#this will update ECS agent, better when using custom AMI
/usr/bin/docker pull amazon/amazon-ecs-agent:latest
#Restart docker and ECS agent
sudo service docker restart
sudo start ecs
EOF
  )
}

# ----------------------------------------------------
# Auto Scaling Group for ECS cluster capacity
# ----------------------------------------------------
resource "aws_autoscaling_group" "ecs" {
  name                      = "pohualizcalli-ecs-asg"
  max_size                  = 1
  min_size                  = 1
  desired_capacity          = 1
  vpc_zone_identifier       = local.ecs_subnet_ids  # your private subnets
  health_check_type         = "EC2"
  force_delete              = true

  launch_template {
    id      = aws_launch_template.ecs.id
    version = "$Latest"
  }

  lifecycle {
    create_before_destroy = true
  }


  # 👇 THIS is what sets the Name in the EC2 console
  tag {
    key                 = "Name"
    value               = "Pohualizcalli-Admin-App"
    propagate_at_launch = true
  }

  tag {
    key                 = "Project"
    value               = "Pohualizcalli"
    propagate_at_launch = true
  }
}


# ----------------------------------------------------
# Outputs
# ----------------------------------------------------

output "subdomain_fqdn" {
  value = aws_route53_record.subdomain.fqdn
}

output "alb_dns_name" {
  value = aws_lb.this.dns_name
}

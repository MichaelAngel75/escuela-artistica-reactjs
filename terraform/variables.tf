variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "us-east-1"
}

variable "subdomain" {
  type        = string
  description = "Subdomain prefix (e.g. admin, app, api)"
  default     = "admin"
}

variable "container_port" {
  type        = number
  description = "Port your Express app listens on in the container"
  default     = 8080
}

variable "health_check_path" {
  type        = string
  description = "ALB health check path"
  default     = "/health"
}

variable "ecs_task_cpu" {
  type        = string
  default     = "512"
}

variable "ecs_task_memory" {
  type        = string
  default     = "1024"
}

variable "docker_build_context" {
  type        = string
  description = "Path to project root where Dockerfile lives"
  default     = "../"
}

variable "aws_profile" {
  type        = string
  description = "Aws profile"
}

variable "ecr_remote_tag" {
  type = string
  description = "ECR remote tag naming"
}

# S3 bucket:  pohualizcalli-several-files

data "aws_caller_identity" "current" {}

locals {
  hosted_zone_id             = data.aws_ssm_parameter.route53_zone_id.value
  root_domain                = data.aws_ssm_parameter.route53_domain.value
  fqdn                       = local.root_domain
  account_id                 = data.aws_caller_identity.current.account_id


  ##### --------------------------------
  google_client_id           = data.aws_ssm_parameter.google_client_id.value
  google_client_secret       = data.aws_ssm_parameter.google_client_secret.value
  port                       = data.aws_ssm_parameter.port.value
  session_secret             = data.aws_ssm_parameter.session_secret.value
  aws_bucket_name            = data.aws_ssm_parameter.aws_bucket_name.value
  aws_region_param           = data.aws_ssm_parameter.aws_region_param.value
  aws_db_secret_manager      = data.aws_ssm_parameter.aws_db_secret_manager.value
  google_callback_url        = data.aws_ssm_parameter.google_callback_url.value

  # aws_access_key             = data.aws_ssm_parameter.aws_access_key.value
  # aws_secret_key             = data.aws_ssm_parameter.aws_secret_key.value

 
}



# ----------------------------------------------------
# SSM parameters for Route53 zone id & root domain
# ----------------------------------------------------

data "aws_ssm_parameter" "route53_zone_id" {
  name = "/pohualizcalli/ssm/aws_route53_id"
}

data "aws_ssm_parameter" "route53_domain" {
  name = "/pohualizcalli/ssm/aws_route53_domain"
}

#########################################
# SSM parameters for app configuration
#########################################google_client_id

# data "aws_ssm_parameter" "aws_access_key" {
#   name           = "/pohualizcalli/ssm/aws_access_key"
#   with_decryption = true
# }

# data "aws_ssm_parameter" "aws_secret_key" {
#   name           = "/pohualizcalli/ssm/aws_secret_key"
#   with_decryption = true
# }

data "aws_ssm_parameter" "google_client_id" {
  name           = "/pohualizcalli/ssm/academy_google_client_id"
  with_decryption = true
}

data "aws_ssm_parameter" "google_client_secret" {
  name           = "/pohualizcalli/ssm/academy_google_client_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "port" {
  name           = "/pohualizcalli/ssm/academy_port"
  with_decryption = true
}

data "aws_ssm_parameter" "session_secret" {
  name           = "/pohualizcalli/ssm/academy_session_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_bucket_name" {
  name           = "/pohualizcalli/ssm/academy_s3_bucket"
  with_decryption = true
}

data "aws_ssm_parameter" "academy_resources_domain" {
  name           = "/pohualizcalli/ssm/academy_resources_domain"
  with_decryption = true
}

data "aws_ssm_parameter" "academy_private_object_dir" {
  name           = "/pohualizcalli/ssm/academy_private_object_dir"
  with_decryption = true
}

data "aws_ssm_parameter" "academy_sqs_diploma_generation" {
  name           = "/pohualizcalli/ssm/academy_sqs_diploma_generation"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_region_param" {
  name           = "/pohualizcalli/ssm/academy_aws_region"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_db_secret_manager" {
  name           = "/pohualizcalli/ssm/db_secret_manager"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_db_schema" {
  name           = "/pohualizcalli/ssm/academy_db_schema"
  with_decryption = true
}

data "aws_ssm_parameter" "google_callback_url" {
  name           = "/pohualizcalli/ssm/academy_google_callback_url"
  with_decryption = true
}

data "aws_ssm_parameter" "academy_internal_api_header" {
  name           = "/pohualizcalli/ssm/academy_internal_api_header"
  with_decryption = true
}

data "aws_ssm_parameter" "academy_internal_api_key_param_name" {
  name           = "/pohualizcalli/ssm/academy_internal_key_param_name"
  with_decryption = true
}

# ----------------------------------------------------
# Route53 record for subdomain -> ALB
# (ALB created later; we use depends_on)
# ----------------------------------------------------

# Placeholder, real alias target wired after ALB is defined
# We'll define this after ALB resource.

# ----------------------------------------------------
# Look up existing EC2 instances with tag App = mabels_app
# NOTE: they must already be configured as ECS container
# instances joining this cluster.
# ----------------------------------------------------
# data "aws_instances" "mabels_app_instances" {
#   filter {
#     name   = "tag:App"
#     values = ["Mabels_app"]
#   }

#   filter {
#     name   = "instance-state-name"
#     values = ["running"]
#   }
# }

# ----------------------------------------------------
# Build & push Docker image (React + Express) locally
# Assumes: Docker is installed locally and you are logged
# in to ECR with `aws ecr get-login-password`.
# ----------------------------------------------------

# locals {
#   ecr_image_tag = "latest"
#   mabels_app_ec2_instance_id = element(data.aws_instances.mabels_app_instances.ids, 0)
# }

# ---------------------------------------------------------
#  Read secret value from AWS Secrets Manager
# ---------------------------------------------------------
data "aws_secretsmanager_secret" "db" {
  name = data.aws_ssm_parameter.aws_db_secret_manager.value
  depends_on = [ data.aws_ssm_parameter.aws_db_secret_manager ]
}

data "aws_secretsmanager_secret_version" "db" {
  secret_id = data.aws_secretsmanager_secret.db.id
}

# ---------------------------------------------------------
#  Decode JSON and expose as locals
# ---------------------------------------------------------
locals {
  db_secret_data = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)
  db_user       = local.db_secret_data["db_user"]
  db_password   = local.db_secret_data["db_password"]
  db_url        = local.db_secret_data["db_url"]
  db_url_2      = local.db_secret_data["db_to_concatenate_2"]
  db_url_1      = local.db_secret_data["db_to_concatenate_1"]
}

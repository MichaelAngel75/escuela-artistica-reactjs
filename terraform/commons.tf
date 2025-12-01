
# S3 bucket:  pohualizcalli-several-files

data "aws_caller_identity" "current" {}

locals {
  hosted_zone_id             = data.aws_ssm_parameter.route53_zone_id.value
  root_domain                = data.aws_ssm_parameter.route53_domain.value
  fqdn                       = local.root_domain
  account_id                 = data.aws_caller_identity.current.account_id

  aws_access_key             = data.aws_ssm_parameter.aws_access_key.value
  aws_secret_key             = data.aws_ssm_parameter.aws_secret_key.value
  google_client_id           = data.aws_ssm_parameter.google_client_id.value
  google_client_secret       = data.aws_ssm_parameter.google_client_secret.value
  google_sheet_service_email = data.aws_ssm_parameter.google_sheet_service_email.value
  google_sheet_private_key   = data.aws_ssm_parameter.google_sheet_private_key.value
  adoption_sheet_id          = data.aws_ssm_parameter.adoption_sheet_id.value
  foster_sheet_id            = data.aws_ssm_parameter.foster_sheet_id.value
  port                       = data.aws_ssm_parameter.port.value
  session_secret             = data.aws_ssm_parameter.session_secret.value
  aws_bucket_name            = data.aws_ssm_parameter.aws_bucket_name.value
  aws_region_param           = data.aws_ssm_parameter.aws_region_param.value
  aws_db_secret_manager      = data.aws_ssm_parameter.aws_db_secret_manager.value
  google_callback_url        = data.aws_ssm_parameter.google_callback_url.value


  

}



# ----------------------------------------------------
# SSM parameters for Route53 zone id & root domain
# ----------------------------------------------------

data "aws_ssm_parameter" "route53_zone_id" {
  name = "/mabelsrescue/ssm/aws_route53_id"
}

data "aws_ssm_parameter" "route53_domain" {
  name = "/mabelsrescue/ssm/aws_route53_domain"
}

#########################################
# SSM parameters for app configuration
#########################################

data "aws_ssm_parameter" "aws_access_key" {
  name           = "/mabelsrescue/ssm/aws_access_key"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_secret_key" {
  name           = "/mabelsrescue/ssm/aws_secret_key"
  with_decryption = true
}

data "aws_ssm_parameter" "google_client_id" {
  name           = "/mabelsrescue/ssm/google_client_id"
  with_decryption = true
}

data "aws_ssm_parameter" "google_client_secret" {
  name           = "/mabelsrescue/ssm/google_client_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "google_sheet_service_email" {
  name           = "/mabelsrescue/ssm/google_sheet_service_email"
  with_decryption = true
}

data "aws_ssm_parameter" "google_sheet_private_key" {
  name           = "/mabelsrescue/ssm/google_sheet_private_key"
  with_decryption = true
}

data "aws_ssm_parameter" "adoption_sheet_id" {
  name           = "/mabelsrescue/ssm/adoption_sheet_id"
  with_decryption = true
}

data "aws_ssm_parameter" "foster_sheet_id" {
  name           = "/mabelsrescue/ssm/foster_sheet_id"
  with_decryption = true
}

data "aws_ssm_parameter" "port" {
  name           = "/mabelsrescue/ssm/port"
  with_decryption = true
}

data "aws_ssm_parameter" "session_secret" {
  name           = "/mabelsrescue/ssm/session_secret"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_bucket_name" {
  name           = "/mabelsrescue/ssm/aws_bucket_name"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_www_bucket_name" {
  name           = "/mabelsrescue/ssm/aws_www_bucket_name"
  with_decryption = true
}



data "aws_ssm_parameter" "aws_region_param" {
  name           = "/mabelsrescue/ssm/aws_region"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_db_secret_manager" {
  name           = "/mabelsrescue/ssm/db_secret_manager"
  with_decryption = true
}

data "aws_ssm_parameter" "google_sheets_secret_manager" {
  name           = "/mabelsrescue/ssm/google_sheets_secret_manager"
  with_decryption = true
}

data "aws_ssm_parameter" "google_callback_url" {
  name           = "/mabelsrescue/ssm/google_callback_url"
  with_decryption = true
}

data "aws_ssm_parameter" "aws_image_domain" {
  name           = "/mabelsrescue/ssm/image_domain"
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

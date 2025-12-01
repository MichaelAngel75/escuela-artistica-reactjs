# - dynamoDB table done
# - Terraform S3 bucket done
# - Iam user for Terraform done (create aws cli credentials)
# - Iam policy permission:  pending (dynamodb, s3, et)
# - Create ECR for docker snapshot
# - REview dockerfile generation (all in one)s
# - Create Google Client/secret for new domain
# - Create AWS access/secret AWS CLI
# - GoogleSheet Service email/GoogleSheet PrivateKey
# - Change AWS Cli for accessing Cat Pictures bucket

provider "aws" {
  region = var.aws_region
  profile = var.aws_profile
}

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
    #   version = "~> 5.0"
      version = "< 6.0.0"
    }
  }

  backend "s3" {
    bucket    =  "pohualizcalli-terraform"  # "@bucketName-env@"
    key       =  "pohualizcalli/terraform.tfstate" # @projectKey@/@UCD_ENV@/tf-base-infrastructure.tfstate
    region    =  "us-east-1" 
    profile   =  "pohualizcalliTerraform"  # @projectKey@-env
    encrypt   = true
    dynamodb_table = "terraform-lock"
  }
}
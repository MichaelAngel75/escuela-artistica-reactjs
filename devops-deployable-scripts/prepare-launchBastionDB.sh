# Launch Template name and Id
# my-vpc-bastion
# lt-098dec2e7b5d14016

# kill instances tag Name:My-VPC-Bastion

# obtain public IP and Public DNS

# ---------------------------------------------------
# --- using  SSM Session Manager

# AmazonSSMManagedInstanceCore policy

# AMI images with SSM Agent installed
# Search AWS documenttion :  Amazon Machine Images (AMIs) with SSM Agent preinstalled

#     how to validate SSM is intalled:   
#           amazon) :   sudo systemctl status amazon-ssm-agent
#           ubuntu):    sudo status amazon-ssm-agent


# ------------------------------------------
##  ssh tunneling
# ssh -i /opt/security/pohualizcalli-ec2-key-pair.pem -N -L 35998:mabel-rescue-pohualizcalli-db-instance.cbiukbm2byhd.us-east-1.rds.amazonaws.com:5432 ec2-user@44.204.110.110
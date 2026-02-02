
ssh -i "/opt/security/ec2-key-pair.pem" ec2-user@100.48.197.20

chmod 600 ec2-key-pair.pem


scp -i "ec2-key-pair.pem" *.sh  ec2-user@10.0.4.194:/home/ec2-user


ssh -i "ec2-key-pair.pem" ec2-user@10.0.4.194

CloudWatch VPC Interface Endpoints:
https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch-logs-and-interface-VPC.html
https://www.youtube.com/watch?v=AyFiJqoulpY


0.0.0.0/0  --> destination 
nat --> target
propagate:  No
route origin: Create Route


destination: pl-63a5400a
target: vpce-






An error occurred (AccessDenied) when calling the ListObjectsV2 operation: User: arn:aws:sts::333333:assumed-role/pohualizcalli-ecs-instance-role/i-02f3fdfer52b2dd5b is not authorized to perform: s3:ListBucket on resource: "arn:aws:s3:::my-bucket" because no identity-based policy allows the s3:ListBucket action

Whole VPC 10.0.0.0/16 ( vpc- | MyVPC )
private 1a (subnet-) : 10.0.3.0/24   AZ( use1-az1 (us-east-1a) )


VPC security endpont for ECS:  
ecs_to_vpc-endpoint


{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "VisualEditor0",
			"Effect": "Allow",
			"Principal": "*",
			"Action": [
				"s3:PutObject",
				"s3:GetObject",
				"s3:ListBucket",
				"s3:DeleteObject",
                "s3:ListAllMyBuckets",
                "s3:GetObjectAcl",
                "s3:PutObjectAcl",
                "s3:ReplicateObject",
                "s3:getBucketVersioning"                
			],
			"Resource": [
				"arn:aws:s3:::cats-pics",
				"arn:aws:s3:::www.mydomain.com",
				"arn:aws:s3:::several-files",
				"arn:aws:s3:::cats-pics/*",
				"arn:aws:s3:::www.mydomain.com/*",
				"arn:aws:s3:::several-files/*"
			]
		}
	]
}
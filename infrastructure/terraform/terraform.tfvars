# Paycrypt Terraform Variables

project_name = "paycrypt"
environment = "production"
aws_region = "ap-south-1"

# VPC Configuration
vpc_cidr = "10.0.0.0/16"
availability_zones = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
public_subnet_cidrs = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
database_subnet_cidrs = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]

# ACM Certificate (empty for now, can be added later)
acm_certificate_arn = ""

# ECR Repository URL
ecr_repository_url = "359924468730.dkr.ecr.ap-south-1.amazonaws.com/paycrypt"
image_tag = "latest"

# API Gateway Configuration
api_gateway_cpu = 256
api_gateway_memory = 512
api_gateway_desired_count = 2
api_gateway_min_capacity = 2
api_gateway_max_capacity = 20

# Database Configuration - Using Supabase instead of AWS RDS
# Commented out since we use Supabase
# db_instance_class = "db.t3.medium"
# db_allocated_storage = 100
# db_max_allocated_storage = 1000
# db_username = "paycrypt_admin"
# db_password = "ChangeThisPassword123!@#"
# db_backup_retention_period = 30
# db_read_replica_count = 3

# Redis Configuration
redis_node_type = "cache.t3.medium"
redis_node_count = 3
redis_auth_token = "ChangeThisRedisToken123"

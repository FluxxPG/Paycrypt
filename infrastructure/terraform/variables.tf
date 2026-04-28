# Variables for Paycrypt AWS Infrastructure

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "paycrypt"
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for HTTPS"
  type        = string
  default     = ""
}

variable "ecr_repository_url" {
  description = "ECR repository URL for container images"
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

# API Gateway Configuration
variable "api_gateway_cpu" {
  description = "CPU units for API Gateway task"
  type        = number
  default     = 256
}

variable "api_gateway_memory" {
  description = "Memory for API Gateway task (MB)"
  type        = number
  default     = 512
}

variable "api_gateway_desired_count" {
  description = "Desired count of API Gateway tasks"
  type        = number
  default     = 2
}

variable "api_gateway_min_capacity" {
  description = "Minimum capacity for API Gateway auto-scaling"
  type        = number
  default     = 2
}

variable "api_gateway_max_capacity" {
  description = "Maximum capacity for API Gateway auto-scaling"
  type        = number
  default     = 20
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Initial storage for RDS (GB)"
  type        = number
  default     = 100
}

variable "db_max_allocated_storage" {
  description = "Maximum storage for RDS (GB)"
  type        = number
  default     = 1000
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "paycrypt_admin"
}

variable "db_password" {
  description = "Database password (not used - using Supabase)"
  type        = string
  sensitive   = true
  default     = "not-used-supabase-instead"
}

variable "db_backup_retention_period" {
  description = "Backup retention period in days"
  type        = number
  default     = 30
}

variable "db_read_replica_count" {
  description = "Number of read replicas"
  type        = number
  default     = 3
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "redis_node_count" {
  description = "Number of Redis nodes"
  type        = number
  default     = 3
}

variable "redis_auth_token" {
  description = "Redis auth token"
  type        = string
  sensitive   = true
}

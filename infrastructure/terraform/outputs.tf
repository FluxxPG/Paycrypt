# Outputs for Paycrypt AWS Infrastructure

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "vpc_cidr" {
  description = "VPC CIDR block"
  value       = module.vpc.vpc_cidr_block
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "database_subnet_ids" {
  description = "Database subnet IDs"
  value       = module.vpc.database_subnets
}

output "api_alb_dns_name" {
  description = "API Load Balancer DNS name"
  value       = aws_lb.api.dns_name
}

output "api_alb_zone_id" {
  description = "API Load Balancer zone ID"
  value       = aws_lb.api.zone_id
}

output "ecs_cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ECS Cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

# Database outputs - Using Supabase instead of AWS RDS
# output "database_endpoint" {
#   description = "RDS Database endpoint"
#   value       = aws_db_instance.main.endpoint
#   sensitive   = true
# }
# 
# output "database_port" {
#   description = "RDS Database port"
#   value       = aws_db_instance.main.port
# }
# 
# output "database_read_replica_endpoints" {
#   description = "RDS Read Replica endpoints"
#   value       = aws_db_instance.read_replica[*].endpoint
#   sensitive   = true
# }

output "redis_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_reader_endpoints" {
  description = "Redis reader endpoints"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  sensitive   = true
}

output "kms_database_key_arn" {
  description = "KMS key ARN for database encryption"
  value       = aws_kms_key.database.arn
}

output "kms_secrets_key_arn" {
  description = "KMS key ARN for secrets encryption"
  value       = aws_kms_key.secrets.arn
}

output "jwt_secret_arn" {
  description = "JWT secret ARN"
  value       = aws_secretsmanager_secret.jwt_secret.arn
}

output "supabase_url_secret_arn" {
  description = "Supabase URL secret ARN"
  value       = aws_secretsmanager_secret.supabase_url.arn
}

output "sns_alerts_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = aws_sns_topic.alerts.arn
}

output "api_gateway_service_name" {
  description = "API Gateway ECS service name"
  value       = aws_ecs_service.api_gateway.name
}

output "api_gateway_target_group_arn" {
  description = "API Gateway target group ARN"
  value       = aws_lb_target_group.api_gateway.arn
}

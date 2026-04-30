# AWS ECR Deployment Script for Paycrypt Microservices
# This script builds and pushes Docker images to ECR

$ErrorActionPreference = "Stop"

$AWS_REGION = "ap-south-1"
$PROJECT_NAME = "paycrypt"
$ACCOUNT_ID = "359924468730"

$SERVICES = @(
  @{ name = "api-gateway"; path = "."; dockerfile = "apps/api/Dockerfile" },
  @{ name = "ws-service"; path = "."; dockerfile = "apps/ws/Dockerfile" },
  @{ name = "worker-service"; path = "."; dockerfile = "apps/worker/Dockerfile" }
)

# Create ECR repositories if they don't exist
Write-Host "Creating ECR repositories..."
foreach ($service in $SERVICES) {
  $repo_name = "${PROJECT_NAME}/$($service.name)"
  try {
    aws ecr describe-repositories --repository-names $repo_name --region $AWS_REGION 2>&1 | Out-Null
    Write-Host "Repository $repo_name already exists"
  } catch {
    Write-Host "Creating repository: $repo_name"
    aws ecr create-repository --repository-name $repo_name --region $AWS_REGION
    $lifecyclePolicy = @{
      rules = @(
        @{
          rulePriority = 1
          description  = "Keep last 30 images"
          selection = @{
            tagStatus   = "any"
            countType   = "imageCountMoreThan"
            countNumber = 30
          }
          action = @{
            type = "expire"
          }
        }
      )
    }
    $lifecyclePolicyJson = $lifecyclePolicy | ConvertTo-Json -Depth 10
    aws ecr put-lifecycle-policy --repository-name $repo_name --region $AWS_REGION --lifecycle-policy-text $lifecyclePolicyJson
  }
}

Write-Host "Logging in to ECR..."
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Change to project root
$scriptPath = $PSScriptRoot
Set-Location $scriptPath\..

Write-Host "Building and pushing Docker images..."

foreach ($service in $SERVICES) {
  $repo_name = "${PROJECT_NAME}/$($service.name)"
  $repo_uri = "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${repo_name}"
  $service_path = $service.path
  $dockerfile = $service.dockerfile
  
  Write-Host "Building $($service.name)..."
  docker build -f $dockerfile -t ${repo_uri}:latest -t ${repo_uri}:v1.0.0 $service_path
  
  Write-Host "Pushing $($service.name)..."
  docker push ${repo_uri}:latest
  docker push ${repo_uri}:v1.0.0
  
  Write-Host "$($service.name) deployed successfully!"
}

Write-Host "All services deployed to ECR!"

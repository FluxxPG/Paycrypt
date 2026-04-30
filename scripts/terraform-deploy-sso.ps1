# Terraform Deployment Script with AWS SSO
$ErrorActionPreference = "Stop"

Write-Host "Getting AWS SSO credentials..."

# Get SSO token and credentials
$tokenOutput = aws sso-oidc create-token --client-id $(aws configure get sso_client_id --profile default) --client-secret $(aws configure get sso_client_secret --profile default) --grant-type refresh_token --refresh-token $(aws configure get sso_refresh_token --profile default) --region ap-south-1 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get SSO token. Please run 'aws sso login' first."
    exit 1
}

$tokenData = $tokenOutput | ConvertFrom-Json
$accessToken = $tokenData.accessToken

# Get role credentials
$roleOutput = aws sso get-role-credentials --account-id 359924468730 --role-name AdministratorAccess --access-token $accessToken --region ap-south-1 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get role credentials."
    exit 1
}

$roleData = $roleOutput | ConvertFrom-Json

# Set environment variables
$env:AWS_ACCESS_KEY_ID = $roleData.roleCredentials.accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $roleData.roleCredentials.secretAccessKey
$env:AWS_SESSION_TOKEN = $roleData.roleCredentials.sessionToken

Write-Host "AWS credentials loaded successfully."

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Initializing Terraform..."
terraform init

Write-Host "Planning Terraform changes..."
terraform plan -out=tfplan

Write-Host "Applying Terraform changes..."
terraform apply tfplan

Write-Host "Terraform deployment completed!"

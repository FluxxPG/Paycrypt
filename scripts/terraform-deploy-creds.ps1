# Terraform Deployment with AWS Credentials Export
$ErrorActionPreference = "Stop"

Write-Host "Exporting AWS SSO credentials to environment variables..."

# Use AWS CLI to export credentials for the current session
$env:AWS_PROFILE = "default"

# Get caller identity to verify credentials
Write-Host "Verifying AWS credentials..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to verify AWS credentials. Please run 'aws sso login' first."
    Write-Host $identity
    exit 1
}

Write-Host "AWS credentials verified successfully."
$identityObj = $identity | ConvertFrom-Json
Write-Host "Account: $($identityObj.Account)"
Write-Host "User: $($identityObj.Arn)"

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Initializing Terraform..."
terraform init

Write-Host "Planning Terraform changes..."
terraform plan

Write-Host "Review the plan above. Press Enter to apply or Ctrl+C to cancel..."
Read-Host

Write-Host "Applying Terraform changes..."
terraform apply

Write-Host "Terraform deployment completed!"

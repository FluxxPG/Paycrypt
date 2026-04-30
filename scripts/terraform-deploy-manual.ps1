# Manual Terraform Deployment Script
# This script will guide you through exporting AWS credentials and running Terraform

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Paycrypt Terraform Deployment"
Write-Host "========================================"
Write-Host ""
Write-Host "This script will help you deploy the AWS infrastructure."
Write-Host ""

# Check if AWS is logged in
Write-Host "Step 1: Verifying AWS login status..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ AWS is not logged in. Please run 'aws sso login' first."
    Write-Host $identity
    exit 1
}

$identityObj = $identity | ConvertFrom-Json
Write-Host "✅ AWS login verified"
Write-Host "   Account: $($identityObj.Account)"
Write-Host "   User: $($identityObj.Arn)"
Write-Host ""

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Step 2: Initializing Terraform..."
terraform init
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform init failed"
    exit 1
}
Write-Host "✅ Terraform initialized"
Write-Host ""

Write-Host "Step 3: Planning Terraform changes..."
terraform plan
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform plan failed"
    exit 1
}
Write-Host ""

Write-Host "========================================"
Write-Host "Review the plan above carefully."
Write-Host "Press Enter to apply or Ctrl+C to cancel..."
Write-Host "========================================"
Read-Host

Write-Host "Step 4: Applying Terraform changes..."
terraform apply
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform apply failed"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed successfully!"
Write-Host "========================================"

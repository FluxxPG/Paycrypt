# Terraform Deployment with AWS Environment Variables
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Paycrypt Terraform Deployment"
Write-Host "========================================"
Write-Host ""

# Check if AWS CLI has SSO session
Write-Host "Checking AWS SSO session..."
$sessionCheck = aws configure list 2>&1
Write-Host $sessionCheck

# Try to get caller identity to verify credentials work
Write-Host ""
Write-Host "Attempting to verify AWS credentials..."
$identity = aws sts get-caller-identity 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ AWS credentials not working. Please run 'aws sso login' in a terminal."
    Write-Host $identity
    Write-Host ""
    Write-Host "Please run: aws sso login"
    Write-Host "Then run this script again."
    exit 1
}

$identityObj = $identity | ConvertFrom-Json
Write-Host "✅ AWS credentials verified"
Write-Host "   Account: $($identityObj.Account)"
Write-Host "   User: $($identityObj.Arn)"
Write-Host ""

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Step 1: Initializing Terraform..."
$initResult = terraform init 2>&1
Write-Host $initResult
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform init failed"
    exit 1
}
Write-Host "✅ Terraform initialized"
Write-Host ""

Write-Host "Step 2: Planning Terraform changes..."
$planResult = terraform plan 2>&1
Write-Host $planResult
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

Write-Host "Step 3: Applying Terraform changes..."
$applyResult = terraform apply 2>&1
Write-Host $applyResult
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform apply failed"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed!"
Write-Host "========================================"

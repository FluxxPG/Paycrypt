# Direct Terraform Deployment
# Run this after 'aws sso login' has been completed

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Paycrypt Terraform Deployment"
Write-Host "========================================"
Write-Host ""

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Step 1: Initializing Terraform..."
terraform init

Write-Host "Step 2: Planning Terraform changes..."
terraform plan

Write-Host ""
Write-Host "========================================"
Write-Host "Review the plan above carefully."
Write-Host "Press Enter to apply or Ctrl+C to cancel..."
Write-Host "========================================"
Read-Host

Write-Host "Step 3: Applying Terraform changes..."
terraform apply

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed!"
Write-Host "========================================"

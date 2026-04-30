# Simple Terraform Deployment Script
$ErrorActionPreference = "Stop"

Write-Host "Please ensure you have run 'aws sso login' first."
Write-Host "Press Enter to continue or Ctrl+C to cancel..."
Read-Host

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

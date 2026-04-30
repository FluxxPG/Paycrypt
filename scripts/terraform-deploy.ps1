# Terraform Deployment Script for Paycrypt Infrastructure
$ErrorActionPreference = "Stop"

# Remove AWS environment variables to force use of SSO credentials
Remove-Item Env:\AWS_ACCESS_KEY_ID -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_SECRET_ACCESS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\AWS_SESSION_TOKEN -ErrorAction SilentlyContinue

Write-Host "Removed AWS environment variables, using SSO credentials..."

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

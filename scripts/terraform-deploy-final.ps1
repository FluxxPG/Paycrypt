# Terraform Deployment with AWS SSO - Final Version
$ErrorActionPreference = "Stop"

Write-Host "This script requires AWS SSO credentials."
Write-Host "Please ensure you have run 'aws sso login' in a terminal."
Write-Host ""
Write-Host "We will now attempt to use the AWS CLI credential process..."

# Change to terraform directory first
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

# Create a temporary AWS config file for Terraform to use
$tempConfigPath = "$env:TEMP\aws_config_temp_$PID"
$tempCredsPath = "$env:TEMP\aws_creds_temp_$PID"

# Copy existing config
Copy-Item C:\Users\salma\.aws\config $tempConfigPath

# Add credential_process to the config
Add-Content -Path $tempConfigPath -Value "[profile default]"
Add-Content -Path $tempConfigPath -Value "credential_process = aws sso get-role-credentials --account-id 359924468730 --role-name AdministratorAccess --profile default --region ap-south-1"

# Set environment variables to use the temp config
$env:AWS_CONFIG_FILE = $tempConfigPath
$env:AWS_SHARED_CREDENTIALS_FILE = $tempCredsPath

Write-Host "Using temporary AWS config file: $tempConfigPath"

try {
    Write-Host "Initializing Terraform..."
    terraform init

    Write-Host "Planning Terraform changes..."
    terraform plan

    Write-Host "Review the plan above. Press Enter to apply or Ctrl+C to cancel..."
    Read-Host

    Write-Host "Applying Terraform changes..."
    terraform apply

    Write-Host "Terraform deployment completed!"
} finally {
    # Cleanup
    Remove-Item $tempConfigPath -ErrorAction SilentlyContinue
    Remove-Item $tempCredsPath -ErrorAction SilentlyContinue
    Remove-Item Env:\AWS_CONFIG_FILE -ErrorAction SilentlyContinue
    Remove-Item Env:\AWS_SHARED_CREDENTIALS_FILE -ErrorAction SilentlyContinue
    Write-Host "Cleaned up temporary files."
}

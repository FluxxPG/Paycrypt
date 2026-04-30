# Terraform Deployment with AWS SSO Credential Export
$ErrorActionPreference = "Stop"

Write-Host "Getting AWS SSO credentials..."

# Use AWS CLI v2's credential process to get temporary credentials
$credentialProcess = "aws sso get-role-credentials --account-id 359924468730 --role-name AdministratorAccess --profile default --region ap-south-1"

# Try to get credentials using the credential process
$credOutput = Invoke-Expression $credentialProcess 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get SSO credentials. Please run 'aws sso login' first."
    Write-Host $credOutput
    exit 1
}

$credData = $credOutput | ConvertFrom-Json

# Set environment variables for Terraform
$env:AWS_ACCESS_KEY_ID = $credData.roleCredentials.accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $credData.roleCredentials.secretAccessKey
$env:AWS_SESSION_TOKEN = $credData.roleCredentials.sessionToken

Write-Host "AWS credentials loaded successfully."
Write-Host "Access Key ID: $($env:AWS_ACCESS_KEY_ID.Substring(0, 8))..."

# Verify credentials
Write-Host "Verifying credentials..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to verify credentials."
    exit 1
}

$identityObj = $identity | ConvertFrom-Json
Write-Host "Account: $($identityObj.Account)"
Write-Host "User: $($identityObj.Arn)"

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

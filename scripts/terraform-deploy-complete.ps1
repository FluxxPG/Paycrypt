# Complete Terraform Deployment with SSO Credentials
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Paycrypt Terraform Deployment"
Write-Host "========================================"
Write-Host ""

# Step 1: Export SSO credentials from cache
Write-Host "Step 1: Exporting AWS SSO credentials from cache..."
$cacheDir = "C:\Users\salma\.aws\login\cache"
$cacheFiles = Get-ChildItem -Path $cacheDir -Filter "*.json" | Sort-Object LastWriteTime -Descending

if ($cacheFiles.Count -eq 0) {
    Write-Host "❌ No SSO cache files found. Please run 'aws sso login' first."
    exit 1
}

$latestCache = $cacheFiles[0].FullName
$cacheContent = Get-Content -Path $latestCache -Raw
$cacheData = $cacheContent | ConvertFrom-Json

# Check if token is expired
$expiresAt = [DateTime]::Parse($cacheData.accessToken.expiresAt)
$now = [DateTime]::UtcNow

if ($now -gt $expiresAt) {
    Write-Host "❌ SSO token expired at: $($expiresAt)"
    Write-Host "   Current time: $($now)"
    Write-Host "Please run 'aws sso login' to refresh."
    exit 1
}

Write-Host "✅ Token valid (expires: $($expiresAt))"

# Extract credentials
$accessKeyId = $cacheData.accessToken.accessKeyId
$secretAccessKey = $cacheData.accessToken.secretAccessKey
$sessionToken = $cacheData.accessToken.sessionToken

# Set environment variables
$env:AWS_ACCESS_KEY_ID = $accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $secretAccessKey
$env:AWS_SESSION_TOKEN = $sessionToken

Write-Host "✅ Credentials exported to environment"
Write-Host ""

# Step 2: Verify credentials
Write-Host "Step 2: Verifying AWS credentials..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Credential verification failed"
    Write-Host $identity
    exit 1
}

$identityObj = $identity | ConvertFrom-Json
Write-Host "✅ Credentials verified"
Write-Host "   Account: $($identityObj.Account)"
Write-Host "   User: $($identityObj.Arn)"
Write-Host ""

# Step 3: Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

# Step 4: Initialize Terraform
Write-Host "Step 3: Initializing Terraform..."
terraform init -reconfigure
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform init failed"
    exit 1
}
Write-Host "✅ Terraform initialized"
Write-Host ""

# Step 5: Plan Terraform
Write-Host "Step 4: Planning Terraform changes..."
terraform plan
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform plan failed"
    exit 1
}
Write-Host ""

# Step 6: Apply Terraform
Write-Host "========================================"
Write-Host "Review the plan above carefully."
Write-Host "Press Enter to apply or Ctrl+C to cancel..."
Write-Host "========================================"
Read-Host

Write-Host "Step 5: Applying Terraform changes..."
terraform apply
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform apply failed"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed successfully!"
Write-Host "========================================"

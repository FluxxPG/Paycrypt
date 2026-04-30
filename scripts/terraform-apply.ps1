# Terraform Apply with SSO Credentials
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Terraform Apply"
Write-Host "========================================"
Write-Host ""

# Export SSO credentials from cache
Write-Host "Exporting AWS SSO credentials from cache..."
$cacheDir = "C:\Users\salma\.aws\login\cache"
$cacheFiles = Get-ChildItem -Path $cacheDir -Filter "*.json" | Sort-Object LastWriteTime -Descending

if ($cacheFiles.Count -eq 0) {
    Write-Host "❌ No SSO cache files found. Please run 'aws login' first."
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
    Write-Host "Please run 'aws login' to refresh."
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

# Verify credentials
Write-Host "Verifying AWS credentials..."
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

# Change to terraform directory
$scriptPath = $PSScriptRoot
Set-Location "$scriptPath\..\infrastructure\terraform"

Write-Host "Initializing Terraform..."
terraform init -reconfigure

Write-Host ""
Write-Host "Planning Terraform changes..."
terraform plan -out=tfplan

Write-Host ""
Write-Host "========================================"
Write-Host "Applying Terraform changes..."
Write-Host "========================================"
terraform apply tfplan

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed!"
Write-Host "========================================"

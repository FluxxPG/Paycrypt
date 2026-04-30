# Export AWS SSO Credentials from Cache
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Exporting AWS SSO Credentials from Cache"
Write-Host "========================================"
Write-Host ""

# Find the latest cache file
$cacheDir = "C:\Users\salma\.aws\login\cache"
$cacheFiles = Get-ChildItem -Path $cacheDir -Filter "*.json" | Sort-Object LastWriteTime -Descending

if ($cacheFiles.Count -eq 0) {
    Write-Host "❌ No SSO cache files found. Please run 'aws sso login' first."
    exit 1
}

$latestCache = $cacheFiles[0].FullName
Write-Host "Using cache file: $($cacheFiles[0].Name)"
Write-Host ""

# Read and parse the cache file
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

Write-Host "Token expires at: $($expiresAt)"
Write-Host "Time remaining: $($expiresAt - $now)"
Write-Host ""

# Extract credentials
$accessKeyId = $cacheData.accessToken.accessKeyId
$secretAccessKey = $cacheData.accessToken.secretAccessKey
$sessionToken = $cacheData.accessToken.sessionToken

# Set environment variables
$env:AWS_ACCESS_KEY_ID = $accessKeyId
$env:AWS_SECRET_ACCESS_KEY = $secretAccessKey
$env:AWS_SESSION_TOKEN = $sessionToken

Write-Host "✅ Credentials exported to environment variables"
Write-Host "   Access Key ID: $($accessKeyId.Substring(0, 8))..."
Write-Host ""

# Verify credentials
Write-Host "Verifying credentials..."
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

Write-Host "========================================"
Write-Host "Credentials are now set in this session."
Write-Host "You can now run Terraform commands."
Write-Host "========================================"

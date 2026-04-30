# Export AWS SSO Credentials to Environment Variables
# Run this script to export temporary credentials for Terraform

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Exporting AWS SSO Credentials"
Write-Host "========================================"
Write-Host ""

# Use AWS CLI to get credentials using the default profile
Write-Host "Getting AWS credentials from SSO session..."

# Try using the credential source
$credOutput = aws configure export-credentials --profile default 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to export credentials."
    Write-Host "Please ensure you have run 'aws sso login' recently."
    Write-Host $credOutput
    exit 1
}

Write-Host "Credentials exported. Setting environment variables..."

# Parse the output (it's in a specific format)
$lines = $credOutput -split "`n"
$accessKey = ""
$secretKey = ""
$sessionToken = ""

foreach ($line in $lines) {
    if ($line -match "AWS_ACCESS_KEY_ID=(.+)") {
        $accessKey = $matches[1]
    }
    if ($line -match "AWS_SECRET_ACCESS_KEY=(.+)") {
        $secretKey = $matches[1]
    }
    if ($line -match "AWS_SESSION_TOKEN=(.+)") {
        $sessionToken = $matches[1]
    }
}

if ([string]::IsNullOrEmpty($accessKey) -or [string]::IsNullOrEmpty($secretKey)) {
    Write-Host "❌ Failed to parse credentials from output."
    exit 1
}

# Set environment variables
$env:AWS_ACCESS_KEY_ID = $accessKey
$env:AWS_SECRET_ACCESS_KEY = $secretKey
$env:AWS_SESSION_TOKEN = $sessionToken

Write-Host "✅ Credentials exported to environment variables"
Write-Host "   Access Key ID: $($accessKey.Substring(0, 8))..."
Write-Host ""

# Verify
Write-Host "Verifying credentials..."
$identity = aws sts get-caller-identity --output json 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Credential verification failed"
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

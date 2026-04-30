# Terraform Deployment with Fresh SSO Credentials
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "Paycrypt Terraform Deployment"
Write-Host "========================================"
Write-Host ""

# Function to export fresh SSO credentials
function Export-SSOCredentials {
    Write-Host "Exporting AWS SSO credentials from cache..."
    $cacheDir = "C:\Users\salma\.aws\login\cache"
    $cacheFiles = Get-ChildItem -Path $cacheDir -Filter "*.json" | Sort-Object LastWriteTime -Descending

    if ($cacheFiles.Count -eq 0) {
        Write-Host "❌ No SSO cache files found. Please run 'aws sso login' first."
        return $false
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
        return $false
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
    return $true
}

# Export credentials
if (-not (Export-SSOCredentials)) {
    exit 1
}

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

# Initialize Terraform
Write-Host "Initializing Terraform..."
terraform init -reconfigure
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform init failed"
    exit 1
}
Write-Host "✅ Terraform initialized"
Write-Host ""

# Plan Terraform
Write-Host "Planning Terraform changes..."
terraform plan -out=tfplan
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform plan failed"
    exit 1
}
Write-Host ""

# Refresh credentials before apply (they might have expired during plan)
Write-Host "Refreshing credentials before apply..."
if (-not (Export-SSOCredentials)) {
    exit 1
}

# Apply Terraform
Write-Host "========================================"
Write-Host "Applying Terraform changes..."
Write-Host "========================================"
terraform apply tfplan
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Terraform apply failed"
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "✅ Terraform deployment completed successfully!"
Write-Host "========================================"

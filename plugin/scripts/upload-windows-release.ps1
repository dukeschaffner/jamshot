# Load environment variables from .env file
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

# Check required environment variables
$requiredVars = @("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET_NAME")
foreach ($var in $requiredVars) {
    if (-not [Environment]::GetEnvironmentVariable($var)) {
        Write-Error "Error: $var not set"
        exit 1
    }
}

# Set AWS environment variables
$env:AWS_ACCESS_KEY_ID = $env:R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY = $env:R2_SECRET_ACCESS_KEY
$env:AWS_DEFAULT_REGION = "us-east-1"

# Define paths
$vst3Source = "build\SterioPlugin_artefacts\Release\VST3\Sterio.vst3"
$guideSource = "scripts\installation-guide-windows.txt"
$tempDir = "temp_release"
$zipFile = "Sterio-Plugin-Windows-x64-VST3.zip"
$r2Key = "plugin/$zipFile"

# Check if source files exist
if (-not (Test-Path $vst3Source)) {
    Write-Error "Error: VST3 not found at $vst3Source"
    exit 1
}
if (-not (Test-Path $guideSource)) {
    Write-Error "Error: Installation guide not found at $guideSource"
    exit 1
}

# Create temp directory
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy VST3
Copy-Item $vst3Source $tempDir -Recurse

# Copy and rename installation guide
Copy-Item $guideSource "$tempDir\installation-guide.txt"

# Create zip
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile

# Clean up temp dir
Remove-Item $tempDir -Recurse -Force

# Upload to R2
Write-Host "Uploading $zipFile to $r2Key"
aws s3 cp $zipFile "s3://$env:R2_BUCKET_NAME/$r2Key" --endpoint-url $env:R2_ENDPOINT
if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully uploaded $zipFile"
} else {
    Write-Error "Failed to upload $zipFile"
    exit 1
}

Write-Host "Upload completed"
#!/bin/bash
set -e

# Load env vars
[ -f ".env" ] && source .env

# Check required env vars
for var in R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT R2_BUCKET_NAME; do
  [ -z "${!var}" ] && { echo "Error: $var not set"; exit 1; }
done

export AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=us-east-1

# Files/bundles to upload
FILES=(
  "Sterio-Plugin.pkg"
  "build/SterioPlugin_artefacts/Release/VST3/Sterio.vst3"
  "build/SterioPlugin_artefacts/Release/AU/Sterio.component"
)

for file in "${FILES[@]}"; do
  [ ! -e "$file" ] && { echo "Warning: $file not found, skipping"; continue; }

  if [ -d "$file" ]; then
    zipfile="${file%/}.zip"
    echo "Zipping $file → $zipfile"
    zip -r -q "$zipfile" "$file"
    upload_file="$zipfile"
  else
    upload_file="$file"
  fi

  key="plugin/$(basename "$upload_file")"
  echo "Uploading $upload_file → $key"
  aws s3 cp "$upload_file" "s3://$R2_BUCKET_NAME/$key" --endpoint-url "$R2_ENDPOINT"
  echo "Successfully uploaded $upload_file"
done

echo "All uploads completed"
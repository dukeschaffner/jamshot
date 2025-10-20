#!/bin/bash

# Script to delete GitHub Actions artifacts older than X days
# Usage: 
# cd /Users/dukeschaffner/Documents/CODING/apps/jamshot/scripts && ./delete-old-artifacts.sh 7 dukeschaffner/jamshot

set -e

# Check if days parameter is provided
if [ $# -lt 1 ]; then
    echo "Usage: $0 <days> [owner/repo]"
    echo "Example: $0 30 myorg/myrepo"
    exit 1
fi

DAYS=$1
REPO=${2:-$(gh repo view --json owner,name -q ".owner.login + \"/\" + .name")}

echo "Deleting artifacts older than $DAYS days from repository: $REPO"

# Calculate cutoff date
CUTOFF_DATE=$(date -v-${DAYS}d +%Y-%m-%dT%H:%M:%SZ)

# Get artifacts and filter by creation date
ARTIFACTS=$(gh api "repos/$REPO/actions/artifacts" --paginate --jq ".artifacts[] | select(.created_at < \"$CUTOFF_DATE\") | .id")

if [ -z "$ARTIFACTS" ]; then
    echo "No artifacts older than $DAYS days found."
    exit 0
fi

echo "Found artifacts to delete:"
echo "$ARTIFACTS" | tr '\n' ' '
echo ""

# Delete each artifact
echo "$ARTIFACTS" | while read -r ARTIFACT_ID; do
    if [ -n "$ARTIFACT_ID" ]; then
        echo "Deleting artifact ID: $ARTIFACT_ID"
        gh api -X DELETE "repos/$REPO/actions/artifacts/$ARTIFACT_ID"
    fi
done

echo "Cleanup completed."

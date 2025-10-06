cd /Users/dukeschaffner/Documents/CODING/apps/jamshot/api/lambda
rm -f jamshot-api-lambda.zip
npm install --production
zip -r jamshot-api-lambda.zip . \
    -x "*.git*" \
    -x "*test*" \
    -x "*.md" \
    -x "scripts/*" \
    -x "*.zip"
du -h jamshot-api-lambda.zip

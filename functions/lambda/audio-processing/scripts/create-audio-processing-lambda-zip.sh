cd /Users/dukeschaffner/Documents/CODING/apps/jamshot/functions/lambda/audio-processing
npm install
rm -f jamshot-audio-processing-lambda.zip
npm install --production
zip -r jamshot-audio-processing-lambda.zip . \
    -x "*.git*" \
    -x "*test*" \
    -x "*.md" \
    -x "scripts/*" \
    -x "*.zip"
du -h jamshot-audio-processing-lambda.zip

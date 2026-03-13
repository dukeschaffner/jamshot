#!/bin/bash
xcrun notarytool submit Sterio-0.1.0-Installer.pkg \
  --keychain-profile "AC_NOTARY" \
  --wait


xcrun stapler staple Sterio-0.1.0-Installer.pkg

# verify the signature
# spctl -a -t install -vv Sterio.pkg


# update the credentials
# xcrun notarytool store-credentials "AC_NOTARY" \
#   --apple-id "schaffner.duke@gmail.com" \
#   --team-id ZK6F2S828L \
#   --password ""
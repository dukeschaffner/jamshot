---
name: plugin-release
description: Steps for releasing a new version of the plugin
---

- when releasing a new version:
    - update version in Config.h, CMakeLists.txt, and create-plugin-pkg.sh
    - ensure Config.h points to prod urls
    - update API Env Var to point to the latest version



### Mac Build/Release

- run `plugin/scripts/build-release.sh`
- run `plugin/scripts/sign-plugins.sh`
- run `plugin/scripts/create-plugin-pkg.sh`
- run `plugin/scripts/notarize-pkg.sh`
- run `plugin/scripts/upload-to-r2.sh`
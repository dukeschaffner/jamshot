---
name: plugin-release
description: Steps for releasing a new version of the plugin
---

- when releasing a new version:
    - update version in Config.h and CMakeLists.txt
    - update API Env Var to point to the latest version
    - ensure Config.h points to prod urls
#!/bin/bash
rm -rf build
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel --config Release


# if xcode:
# cmake --build build --config Release
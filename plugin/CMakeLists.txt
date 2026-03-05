cmake_minimum_required(VERSION 3.22)

project(SterioPlugin VERSION 0.1.0)

set_property(GLOBAL PROPERTY USE_FOLDERS ON)

# Install to build dir instead of /usr/local (avoids permission errors when JUCE install runs)
set(CMAKE_INSTALL_PREFIX "${CMAKE_BINARY_DIR}/install" CACHE PATH "Install prefix" FORCE)

# Use JUCE from Downloads folder. Override with -DJUCE_PATH=/path/to/JUCE if needed.
set(JUCE_PATH "$ENV{HOME}/Downloads/JUCE" CACHE PATH "Path to JUCE source directory")

# Auth URL for plugin login. Default localhost for dev. Use -DSTERIO_PLUGIN_AUTH_URL="https://sterio.fm" for production.
set(STERIO_PLUGIN_AUTH_URL "http://localhost:3000" CACHE STRING "Auth URL for plugin login flow")
add_subdirectory(${JUCE_PATH} ${CMAKE_BINARY_DIR}/JUCE-build)

juce_add_plugin(SterioPlugin
    PLUGIN_MANUFACTURER_CODE Ster
    PLUGIN_CODE StPl
    IS_SYNTH FALSE
    IS_MIDI_EFFECT FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    FORMATS AU VST3 Standalone
    PRODUCT_NAME "Sterio")

target_sources(SterioPlugin
    PRIVATE
        Source/api/ApiConfig.h
        Source/api/SterioApiClient.cpp
        Source/api/SterioApiClient.h
        Source/auth/AuthCallbackServer.cpp
        Source/auth/AuthCallbackServer.h
        Source/auth/AuthManager.cpp
        Source/auth/AuthManager.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/ui/LoginView.cpp
        Source/ui/LoginView.h
        Source/ui/TrackListPanel.cpp
        Source/ui/TrackListPanel.h
)

source_group("Sterio" FILES
    Source/api/ApiConfig.h
    Source/api/SterioApiClient.cpp
    Source/api/SterioApiClient.h
    Source/auth/AuthCallbackServer.cpp
    Source/auth/AuthCallbackServer.h
    Source/auth/AuthManager.cpp
    Source/auth/AuthManager.h
    Source/PluginEditor.cpp
    Source/PluginEditor.h
    Source/PluginProcessor.cpp
    Source/PluginProcessor.h
    Source/ui/LoginView.cpp
    Source/ui/LoginView.h
    Source/ui/TrackListPanel.cpp
    Source/ui/TrackListPanel.h
)

set_property(TARGET SterioPlugin PROPERTY FOLDER "Sterio")

target_include_directories(SterioPlugin PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/Source)

target_compile_definitions(SterioPlugin
    PRIVATE
        STERIO_PLUGIN_AUTH_URL="${STERIO_PLUGIN_AUTH_URL}"
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(SterioPlugin
    PRIVATE
        juce::juce_audio_utils
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

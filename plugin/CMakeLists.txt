cmake_minimum_required(VERSION 3.22)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

project(SterioPlugin VERSION 0.1.0)

set_property(GLOBAL PROPERTY USE_FOLDERS ON)

if(APPLE)
    set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "" FORCE)
endif()

# Install to build dir instead of /usr/local (avoids permission errors when JUCE install runs)
set(CMAKE_INSTALL_PREFIX "${CMAKE_BINARY_DIR}/install" CACHE PATH "Install prefix" FORCE)

# Use JUCE from Downloads folder. Override with -DJUCE_PATH=/path/to/JUCE if needed.
if(APPLE)
    set(JUCE_PATH "$ENV{HOME}/Downloads/JUCE" CACHE PATH "Path to JUCE source directory")
else()
    set(JUCE_PATH "D:/Coding/JUCE/JUCE" CACHE PATH "Path to JUCE source directory")
endif()


if(WIN32)
    set(VCPKG_TARGET_TRIPLET "x64-windows-static" CACHE STRING "")
    find_package(ZLIB REQUIRED)
endif()

# Auth URL for plugin login. Default localhost for dev. Use -DSTERIO_PLUGIN_AUTH_URL="https://sterio.fm" for production.
set(STERIO_PLUGIN_AUTH_URL "http://localhost:3000" CACHE STRING "Auth URL for plugin login flow")

# API base URL. Default localhost for dev. Use -DSTERIO_API_BASE_URL="https://api.sterio.fm" for production.
set(STERIO_API_BASE_URL "http://localhost:5001/api" CACHE STRING "API base URL for backend requests")

# UI base URL. Default localhost for dev. Use -DSTERIO_UI_BASE_URL="https://sterio.fm" for production.
set(STERIO_UI_BASE_URL "http://localhost:3000" CACHE STRING "UI base URL for web app")
add_subdirectory(${JUCE_PATH} ${CMAKE_BINARY_DIR}/JUCE-build)

juce_add_binary_data(PluginAssets
    SOURCES
        Assets/images/logo.png
)

if(WIN32)
    set(PLUGIN_FORMATS VST3 Standalone)
else()
    set(PLUGIN_FORMATS AU VST3 Standalone)
endif()

if(WIN32)
    # Use static runtime to avoid missing MSVCP/VCRUNTIME DLLs in REAPER
    foreach(flag CMAKE_C_FLAGS CMAKE_C_FLAGS_DEBUG CMAKE_C_FLAGS_RELEASE
                 CMAKE_CXX_FLAGS CMAKE_CXX_FLAGS_DEBUG CMAKE_CXX_FLAGS_RELEASE)
        string(REPLACE "/MD" "/MT" ${flag} "${${flag}}")
    endforeach()
endif()

juce_add_plugin(SterioPlugin
    COMPANY_NAME "Sterio"
    PLUGIN_MANUFACTURER_CODE STER
    PLUGIN_CODE StPl
    IS_SYNTH TRUE
    VST3_CATEGORIES "Instrument Synth"
    PLUGIN_CHANNEL_CONFIGURATIONS "[0,1],[0,2]"
    IS_MIDI_EFFECT FALSE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    COPY_PLUGIN_AFTER_BUILD TRUE
    FORMATS ${PLUGIN_FORMATS}
    PRODUCT_NAME "Sterio")

include(FetchContent)
FetchContent_Declare(ixwebsocket
    GIT_REPOSITORY https://github.com/machinezone/IXWebSocket.git
    GIT_TAG v11.4.4
)
FetchContent_MakeAvailable(ixwebsocket)

target_link_libraries(SterioPlugin 
    PRIVATE ixwebsocket
    PRIVATE PluginAssets
)

if(WIN32)
    target_link_libraries(SterioPlugin PRIVATE ZLIB::ZLIB)
endif()

target_sources(SterioPlugin
    PRIVATE
        Source/CacheManager.cpp
        Source/CacheManager.h
        Source/Colors.h
        Source/Config.h
        Source/GlobalErrorHandler.cpp
        Source/GlobalErrorHandler.h
        Source/SampleRateConverter.cpp
        Source/SampleRateConverter.h
        Source/TransportState.h
        Source/StemModels.h
        Source/Services.h
        Source/PluginState.cpp
        Source/PluginState.h
        Source/utils/JsonUtils.h
        Source/utils/MessageStore.h
        Source/utils/PluginMetaHelper.cpp
        Source/utils/PluginMetaHelper.h
        Source/api/ApiConfig.h
        Source/api/SterioApiClient.cpp
        Source/api/SterioApiClient.h
        Source/api/TrackLoader.cpp
        Source/api/TrackLoader.h
        Source/api/ConnectionManager.cpp
        Source/api/ConnectionManager.h
        Source/auth/AuthCallbackServer.cpp
        Source/auth/AuthCallbackServer.h
        Source/auth/AuthManager.cpp
        Source/auth/AuthManager.h
        Source/playback/StemPlaybackEngine.cpp
        Source/playback/StemPlaybackEngine.h
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
        Source/ui/LoginView.cpp
        Source/ui/LoginView.h
        Source/ui/TrackListPanel.cpp
        Source/ui/TrackListPanel.h
        Source/ui/SterioLookAndFeel.cpp
        Source/ui/SterioLookAndFeel.h
        Source/ui/MessageDisplay.cpp
        Source/ui/MessageDisplay.h
        Source/ui/DebugMessageModal.h
        Source/ui/DebugMessageComponent.h
        Source/ui/MainContentComponent.cpp
        Source/ui/MainContentComponent.h
        Source/ui/LogoComponent.cpp
        Source/ui/LogoComponent.h
        Source/ui/Footer.cpp
        Source/ui/Footer.h
        Source/ui/HelpView.h
)

source_group("Sterio" FILES
    Source/CacheManager.cpp
    Source/CacheManager.h
    Source/Colors.h
    Source/Config.h
    Source/GlobalErrorHandler.cpp
    Source/GlobalErrorHandler.h
    Source/SampleRateConverter.cpp
    Source/SampleRateConverter.h
    Source/TransportState.h
    Source/StemModels.h
    Source/Services.h
    Source/PluginState.cpp
    Source/PluginState.h
    Source/utils/JsonUtils.h
    Source/utils/MessageStore.h
    Source/utils/PluginMetaHelper.cpp
    Source/utils/PluginMetaHelper.h
    Source/api/ApiConfig.h
    Source/api/SterioApiClient.cpp
    Source/api/SterioApiClient.h
    Source/api/TrackLoader.cpp
    Source/api/TrackLoader.h
    Source/api/ConnectionManager.cpp
    Source/api/ConnectionManager.h
    Source/auth/AuthCallbackServer.cpp
    Source/auth/AuthCallbackServer.h
    Source/auth/AuthManager.cpp
    Source/auth/AuthManager.h
    Source/playback/StemPlaybackEngine.cpp
    Source/playback/StemPlaybackEngine.h
    Source/PluginEditor.cpp
    Source/PluginEditor.h
    Source/PluginProcessor.cpp
    Source/PluginProcessor.h
    Source/ui/LoginView.cpp
    Source/ui/LoginView.h
    Source/ui/TrackListPanel.cpp
    Source/ui/TrackListPanel.h
    Source/ui/SterioLookAndFeel.cpp
    Source/ui/SterioLookAndFeel.h
    Source/ui/MessageDisplay.cpp
    Source/ui/MessageDisplay.h
    Source/ui/DebugMessageModal.h
    Source/ui/DebugMessageComponent.h
    Source/ui/MainContentComponent.cpp
    Source/ui/MainContentComponent.h
    Source/ui/LogoComponent.cpp
    Source/ui/LogoComponent.h
    Source/ui/Footer.cpp
    Source/ui/Footer.h
    Source/ui/HelpView.h
)

set_property(TARGET SterioPlugin PROPERTY FOLDER "Sterio")

target_include_directories(SterioPlugin PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/Source)

target_compile_definitions(SterioPlugin
    PRIVATE
        STERIO_PLUGIN_AUTH_URL="${STERIO_PLUGIN_AUTH_URL}"
        STERIO_API_BASE_URL="${STERIO_API_BASE_URL}"
        STERIO_UI_BASE_URL="${STERIO_UI_BASE_URL}"
    PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_MIDI_INPUT_ENABLED=1
        JucePlugin_WantsMidiInput=1)

if(WIN32)
    target_link_libraries(SterioPlugin PRIVATE
        ws2_32
        crypt32
    )
endif()

target_link_libraries(SterioPlugin
    PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_formats
        juce::juce_cryptography
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags)

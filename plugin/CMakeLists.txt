cmake_minimum_required(VERSION 3.22)

project(SterioPlugin VERSION 0.1.0)

set_property(GLOBAL PROPERTY USE_FOLDERS ON)

# Install to build dir instead of /usr/local (avoids permission errors when JUCE install runs)
set(CMAKE_INSTALL_PREFIX "${CMAKE_BINARY_DIR}/install" CACHE PATH "Install prefix" FORCE)

# Use JUCE from Downloads folder. Override with -DJUCE_PATH=/path/to/JUCE if needed.
set(JUCE_PATH "$ENV{HOME}/Downloads/JUCE" CACHE PATH "Path to JUCE source directory")
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
        Source/PluginEditor.cpp
        Source/PluginEditor.h
        Source/PluginProcessor.cpp
        Source/PluginProcessor.h
)

source_group("Sterio" FILES
    Source/PluginEditor.cpp
    Source/PluginEditor.h
    Source/PluginProcessor.cpp
    Source/PluginProcessor.h
)

set_property(TARGET SterioPlugin PROPERTY FOLDER "Sterio")

target_compile_definitions(SterioPlugin
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

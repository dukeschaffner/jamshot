cmake_minimum_required(VERSION 3.15)

project(TracktionTest VERSION 1.0.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Add Tracktion Engine (includes JUCE as submodule)
add_subdirectory(tracktion_engine)

# Create the application
juce_add_gui_app(TracktionTest
    PRODUCT_NAME "Tracktion Test"
    COMPANY_NAME "JamShot"
    BUNDLE_ID "com.jamshot.tracktiontest"
)

# Add source files
target_sources(TracktionTest PRIVATE
    src/Main.cpp
)

# Required JUCE compile definitions
target_compile_definitions(TracktionTest PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:TracktionTest,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="$<TARGET_PROPERTY:TracktionTest,JUCE_VERSION>"
)

# Link against JUCE modules and Tracktion Engine
target_link_libraries(TracktionTest PRIVATE
    tracktion::tracktion_engine
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_data_structures
    juce::juce_dsp
    juce::juce_events
    juce::juce_graphics
    juce::juce_gui_basics
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags
)


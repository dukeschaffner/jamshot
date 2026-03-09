#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <functional>
#include "auth/AuthManager.h"
#include "playback/StemPlaybackEngine.h"
#include "TransportState.h"
#include "SampleRateConverter.h"


//==============================================================================
class SterioPluginProcessor final : public juce::AudioProcessor
{
public:
    SterioPluginProcessor();
    ~SterioPluginProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    /** Returns the current transport state from the host. Thread-safe for UI reads. */
    TransportState getTransportState() const;

    /** Set stems for playback. Called by editor when stems are loaded (Increment 5). */
    void setStems(const juce::Array<StemTrack>& stems);

    /** Get the current host sample rate */
    double getCurrentSampleRate() const { return currentHostSampleRate; }

    /** Set callback for requesting stem reloads on sample rate change */
    void setStemReloadCallback(std::function<void()> callback) { stemReloadCallback = callback; }

    /** Set the current track ID (for reload purposes) */
    void setCurrentTrackId(const juce::String& trackId) { currentTrackId = trackId; }

    /** Request reload of current stems with new sample rate */
    void requestStemReload();

private:
    /** Handle sample rate changes and convert stems if necessary */
    void handleSampleRateChange(double newSampleRate);

    mutable juce::CriticalSection transportLock;
    TransportState transportState;

    void updateTransportFromHost();

    AuthManager authManager;

    // Stem playback engine (Increment 5)
    StemPlaybackEngine playbackEngine;

    // Sample rate conversion support
    double currentHostSampleRate = 44100.0;
    double previousHostSampleRate = 44100.0;
    SampleRateConverter sampleRateConverter;

    // Stem reload support
    std::function<void()> stemReloadCallback;
    juce::String currentTrackId;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginProcessor)
};

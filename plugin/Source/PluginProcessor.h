#pragma once

#include <juce_audio_processors/juce_audio_processors.h>

//==============================================================================
/** Transport state read from the host DAW. Used for stem playback sync (Increment 5). */
struct TransportState
{
    int64_t timeInSamples{ 0 };
    double timeInSeconds{ 0.0 };
    bool isPlaying{ false };
    double bpm{ 120.0 };
    bool hasValidPosition{ false };
};

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

private:
    mutable juce::CriticalSection transportLock;
    TransportState transportState;

    void updateTransportFromHost();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginProcessor)
};

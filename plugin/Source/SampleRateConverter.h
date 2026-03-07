#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <memory>

/** SampleRateConverter handles sample rate conversion for audio buffers using Lagrange interpolation */
class SampleRateConverter
{
public:
    SampleRateConverter();
    ~SampleRateConverter();

    /** Convert an audio buffer from source sample rate to target sample rate
        @param sourceBuffer Input audio buffer at source sample rate
        @param sourceSampleRate Sample rate of the input buffer
        @param targetSampleRate Desired output sample rate
        @return New audio buffer at target sample rate, or nullptr if conversion fails
    */
    std::shared_ptr<juce::AudioBuffer<float>> convertSampleRate(
        const juce::AudioBuffer<float>& sourceBuffer,
        double sourceSampleRate,
        double targetSampleRate);

    /** Check if conversion is needed between two sample rates */
    static bool needsConversion(double sourceSampleRate, double targetSampleRate);

    /** Check if target sample rate is supported (not too high) */
    static bool isSampleRateSupported(double targetSampleRate);

private:
    /** Perform the actual sample rate conversion using linear interpolation */
    std::shared_ptr<juce::AudioBuffer<float>> performConversion(
        const juce::AudioBuffer<float>& sourceBuffer,
        double ratio);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SampleRateConverter)
};
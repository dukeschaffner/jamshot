#include "SampleRateConverter.h"

using namespace juce;

//==============================================================================
SampleRateConverter::SampleRateConverter()
{
}

SampleRateConverter::~SampleRateConverter()
{
}

//==============================================================================
std::shared_ptr<AudioBuffer<float>> SampleRateConverter::convertSampleRate(
    const AudioBuffer<float>& sourceBuffer,
    double sourceSampleRate,
    double targetSampleRate)
{
    // Check if conversion is actually needed
    if (!needsConversion(sourceSampleRate, targetSampleRate))
    {
        // No conversion needed, return a copy of the source buffer
        auto result = std::make_shared<AudioBuffer<float>>(sourceBuffer.getNumChannels(), sourceBuffer.getNumSamples());
        for (int channel = 0; channel < sourceBuffer.getNumChannels(); ++channel)
        {
            result->copyFrom(channel, 0, sourceBuffer, channel, 0, sourceBuffer.getNumSamples());
        }
        return result;
    }

    // Check if target sample rate is supported
    if (!isSampleRateSupported(targetSampleRate))
    {
        DBG("SampleRateConverter: Target sample rate " + String(targetSampleRate) + " Hz is not supported (too high)");
        return nullptr;
    }

    // Calculate conversion ratio
    const double ratio = targetSampleRate / sourceSampleRate;

    // Perform the conversion
    return performConversion(sourceBuffer, ratio);
}

//==============================================================================
bool SampleRateConverter::needsConversion(double sourceSampleRate, double targetSampleRate)
{
    // Consider sample rates equal if they're within 0.1% of each other
    const double epsilon = 0.001;
    const double ratio = targetSampleRate / sourceSampleRate;
    return std::abs(ratio - 1.0) > epsilon;
}

//==============================================================================
bool SampleRateConverter::isSampleRateSupported(double targetSampleRate)
{
    // Don't support sample rates above 100kHz to avoid performance issues
    return targetSampleRate <= 100000.0;
}

//==============================================================================
std::shared_ptr<AudioBuffer<float>> SampleRateConverter::performConversion(
    const AudioBuffer<float>& sourceBuffer,
    double ratio)
{
    const int sourceNumSamples = sourceBuffer.getNumSamples();
    const int numChannels = sourceBuffer.getNumChannels();

    // Calculate target buffer size
    const int targetNumSamples = static_cast<int>(std::ceil(sourceNumSamples * ratio));

    // Validate inputs
    if (sourceNumSamples <= 0 || numChannels <= 0 || targetNumSamples <= 0)
    {
        DBG("SampleRateConverter: Invalid buffer sizes - source: " + String(sourceNumSamples) +
            ", channels: " + String(numChannels) + ", target: " + String(targetNumSamples) +
            ", ratio: " + String(ratio));
        return nullptr;
    }

    // Create output buffer
    auto outputBuffer = std::make_shared<AudioBuffer<float>>(numChannels, targetNumSamples);

    if (outputBuffer == nullptr)
    {
        DBG("SampleRateConverter: Failed to create output buffer");
        return nullptr;
    }

    // Perform linear interpolation for each channel
    for (int channel = 0; channel < numChannels; ++channel)
    {
        const float* sourceData = sourceBuffer.getReadPointer(channel);
        float* targetData = outputBuffer->getWritePointer(channel);

        if (sourceData == nullptr || targetData == nullptr)
        {
            DBG("SampleRateConverter: Null buffer pointers for channel " + String(channel));
            return nullptr;
        }

        // Linear interpolation sample rate conversion
        for (int i = 0; i < targetNumSamples; ++i)
        {
            // Calculate corresponding position in source buffer
            double sourcePos = i / ratio;

            // Get integer and fractional parts
            int sourceIndex = static_cast<int>(sourcePos);
            double fraction = sourcePos - sourceIndex;

            // Linear interpolation between adjacent samples
            if (sourceIndex < sourceNumSamples - 1)
            {
                float sample1 = sourceData[sourceIndex];
                float sample2 = sourceData[sourceIndex + 1];
                targetData[i] = sample1 + (sample2 - sample1) * static_cast<float>(fraction);
            }
            else if (sourceIndex < sourceNumSamples)
            {
                // Last sample
                targetData[i] = sourceData[sourceIndex];
            }
            else
            {
                // Beyond buffer bounds - should not happen with ceil calculation
                targetData[i] = 0.0f;
            }
        }
    }

    DBG("SampleRateConverter: Successfully converted " + String(sourceNumSamples) + " samples to " +
        String(targetNumSamples) + " samples (ratio: " + String(ratio) + ")");

    return outputBuffer;
}
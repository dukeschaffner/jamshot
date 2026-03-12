#include "StemPlaybackEngine.h"

//==============================================================================
StemPlaybackEngine::StemPlaybackEngine()
{
}

StemPlaybackEngine::~StemPlaybackEngine()
{
}

void StemPlaybackEngine::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    juce::ignoreUnused(samplesPerBlock);
    // Initialize with the current sample rate
    currentSampleRate = sampleRate;
}

void StemPlaybackEngine::setStemsProvider(StemsProvider provider)
{
    stemsProvider = provider;
    resetPlayback();
}

void StemPlaybackEngine::processBlock(juce::AudioBuffer<float>& buffer, const TransportState& transport)
{
    // Note: Buffer is not cleared here - we mix with existing content (input audio)

    // Get stems atomically from provider if available
    if (!stemsProvider)
        return;

    auto stems = stemsProvider(); // Atomic read from processor's storage

    // Process all stems if transport is playing
    if (transport.isPlaying && transport.hasValidPosition && !stems.isEmpty())
    {
        const int numSamples = buffer.getNumSamples();

        // Process each stem
        for (const auto& stem : stems)
        {
            processStem(stem, buffer, transport, currentSampleRate, numSamples);
        }
    }

    // Update transport state tracking
    if (transport.hasValidPosition)
    {
        previousTransportPosition = transport.timeInSamples;
    }
    wasPlaying = transport.isPlaying;
}

void StemPlaybackEngine::processStem(const StemTrack& stem, juce::AudioBuffer<float>& buffer,
                                   const TransportState& transport, double sampleRate, int numSamples)
{
    if (!stem.audioBuffer || stem.regions.isEmpty())
        return;

    const auto& stemBuffer = *stem.audioBuffer;

    if (stemBuffer.getNumChannels() <= 0 || stemBuffer.getNumSamples() <= 0)
        return;

    // Find the region that should be playing at the current transport time
    const StemRegion* activeRegion = nullptr;
    for (auto& region : stem.regions)
    {
        if (transport.timeInSeconds >= region.startTime && transport.timeInSeconds < region.endTime)
        {
            activeRegion = &region;
            break;
        }
    }

    // If no region is active (transport time is before first region or after last region), don't play anything
    if (activeRegion == nullptr)
        return;

    // Calculate the audio position within the stem buffer
    const double timeIntoRegion = transport.timeInSeconds - activeRegion->startTime;
    const double audioTime = activeRegion->offset + timeIntoRegion;
    const int64_t audioSamplePosition = static_cast<int64_t>(audioTime * sampleRate);

    // Make sure we're within the stem buffer bounds
    if (audioSamplePosition < 0 || audioSamplePosition >= stemBuffer.getNumSamples())
        return;

    const int stemChannels = stemBuffer.getNumChannels();
    const int outputChannels = juce::jmin(buffer.getNumChannels(), stemChannels);

    // Mix stem audio into output buffer
    for (int channel = 0; channel < outputChannels; ++channel)
    {
        auto* outputPtr = buffer.getWritePointer(channel);
        const auto* stemPtr = stemBuffer.getReadPointer(channel % stemChannels);

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const int64_t stemSampleIndex = audioSamplePosition + sample;
            if (stemSampleIndex >= 0 && stemSampleIndex < stemBuffer.getNumSamples())
            {
                outputPtr[sample] += stemPtr[stemSampleIndex] * stem.gain;
            }
        }
    }
}

void StemPlaybackEngine::handleSampleRateChange(double newSampleRate)
{
    // Check if sample rate actually changed
    if (std::abs(newSampleRate - currentSampleRate) < 0.1)
        return;

    // Check if sample rate is supported
    if (!SampleRateConverter::isSampleRateSupported(newSampleRate))
    {
        DBG("StemPlaybackEngine: Sample rate " + juce::String(newSampleRate) + " Hz not supported, skipping reload");
        currentSampleRate = newSampleRate;
        return;
    }

    DBG("StemPlaybackEngine: Sample rate changed to " + juce::String(newSampleRate) + " Hz, requesting stem reload");

    // Request reload of stems with new sample rate
    if (stemReloadCallback)
    {
        stemReloadCallback();
    }

    currentSampleRate = newSampleRate;
}


void StemPlaybackEngine::resetPlayback()
{
    playbackSamplePosition = 0;
    previousTransportPosition = -1;
    wasPlaying = false;
}
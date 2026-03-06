#include "StemPlaybackEngine.h"

//==============================================================================
StemPlaybackEngine::StemPlaybackEngine()
{
}

StemPlaybackEngine::~StemPlaybackEngine()
{
}

void StemPlaybackEngine::setStems(const juce::Array<StemTrack>& stems)
{
    const juce::ScopedLock sl(stemLock);
    activeStems = stems;
    resetPlayback();
}

void StemPlaybackEngine::processBlock(juce::AudioBuffer<float>& buffer, const TransportState& transport)
{
    // Clear output buffer first
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
        buffer.clear(channel, 0, buffer.getNumSamples());

    // Process all stems if transport is playing
    {
        const juce::ScopedLock sl(stemLock);

        if (transport.isPlaying && transport.hasValidPosition && !activeStems.isEmpty())
        {
            const int numSamples = buffer.getNumSamples();
            const double sampleRate = 44100.0; // TODO: Get this from transport state or audio device

            // Process each stem
            for (const auto& stem : activeStems)
            {
                processStem(stem, buffer, transport, sampleRate, numSamples);
            }
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
    const auto& stemBuffer = stem.audioBuffer;

    if (stemBuffer.getNumChannels() <= 0 || stemBuffer.getNumSamples() <= 0 || stem.regions.isEmpty())
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

void StemPlaybackEngine::resetPlayback()
{
    playbackSamplePosition = 0;
    previousTransportPosition = -1;
    wasPlaying = false;
}
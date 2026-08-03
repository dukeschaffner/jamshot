#include "StemPlaybackEngine.h"
#include "RegionLoopMath.h"

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

    if (sampleRate <= 0.0)
        return;

    // Find the region that should be playing at the current transport time
    // (including any loop area past endTime).
    const StemRegion* activeRegion = nullptr;
    for (auto& region : stem.regions)
    {
        const double effectiveEnd = RegionLoopMath::regionEffectiveEnd(region);
        if (transport.timeInSeconds >= region.startTime && transport.timeInSeconds < effectiveEnd)
        {
            activeRegion = &region;
            break;
        }
    }

    // If no region is active (transport time is before first region or after last region), don't play anything
    if (activeRegion == nullptr)
        return;

    const double effectiveEnd = RegionLoopMath::regionEffectiveEnd(*activeRegion);
    const bool looped = RegionLoopMath::isRegionLooped(*activeRegion);
    const double audibleLength = RegionLoopMath::regionAudibleLength(*activeRegion);
    const int stemChannels = stemBuffer.getNumChannels();
    const int bufferChannels = buffer.getNumChannels();
    const int stemNumSamples = stemBuffer.getNumSamples();

    // Mix stem audio into output buffer (upmix mono stems to all output channels).
    // Per-sample wrap so blocks that cross a loop tile boundary (or loopEnd) are correct.
    for (int channel = 0; channel < bufferChannels; ++channel)
    {
        auto* outputPtr = buffer.getWritePointer(channel);
        const auto* stemPtr = stemBuffer.getReadPointer(channel < stemChannels ? channel : 0);

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const double posInRegion = (transport.timeInSeconds - activeRegion->startTime)
                + (static_cast<double>(sample) / sampleRate);

            if (activeRegion->startTime + posInRegion >= effectiveEnd)
                break;

            if (posInRegion < 0.0)
                continue;

            const double wrappedPos = (looped && audibleLength > 0.0)
                ? RegionLoopMath::wrapTimeIntoRegion(*activeRegion, posInRegion)
                : posInRegion;

            const int64_t stemSampleIndex = static_cast<int64_t>(
                (activeRegion->offset + wrappedPos) * sampleRate);

            if (stemSampleIndex >= 0 && stemSampleIndex < stemNumSamples)
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
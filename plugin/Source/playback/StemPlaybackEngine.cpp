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

void StemPlaybackEngine::setMixStateProvider(MixStateProvider provider)
{
    mixStateProvider = std::move(provider);
}

void StemPlaybackEngine::processBlock(juce::AudioBuffer<float>& buffer, const TransportState& transport)
{
    // Note: Buffer is not cleared here - we mix with existing content (input audio)

    // Get stems atomically from provider if available
    if (!stemsProvider)
        return;

    // IMPORTANT: hold the shared_ptr — do not copy Array<StemTrack> on the audio thread
    // (StemTrack contains juce::String fields; copying allocates and causes glitches).
    auto stemsPtr = stemsProvider();
    if (!stemsPtr || stemsPtr->isEmpty())
    {
        if (transport.hasValidPosition)
            previousTransportPosition = transport.timeInSamples;
        wasPlaying = transport.isPlaying;
        return;
    }

    const auto& stems = *stemsPtr;

    std::shared_ptr<const ProjectMixState> mixState;
    if (mixStateProvider)
        mixState = mixStateProvider();

    // Process all stems if transport is playing
    if (transport.isPlaying && transport.hasValidPosition)
    {
        const int numSamples = buffer.getNumSamples();

        // Process each stem
        for (const auto& stem : stems)
        {
            if (mixState && !mixState->shouldPlayTrack(stem.projectTrackId))
                continue;

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

    // Find the region that should be playing at the current transport sample
    // (including any loop area past endTime). Use integer timeline samples —
    // never re-quantize float seconds to a buffer index per output sample.
    const StemRegion* activeRegion = nullptr;
    int64_t regionStartSamples = 0;
    int64_t effectiveEndSamples = 0;

    for (auto& region : stem.regions)
    {
        const int64_t startSamples = RegionLoopMath::regionStartSamples(region, sampleRate);
        const int64_t endSamples = RegionLoopMath::regionEffectiveEndSamples(region, sampleRate);
        if (transport.timeInSamples >= startSamples && transport.timeInSamples < endSamples)
        {
            activeRegion = &region;
            regionStartSamples = startSamples;
            effectiveEndSamples = endSamples;
            break;
        }
    }

    // If no region is active (transport time is before first region or after last region), don't play anything
    if (activeRegion == nullptr)
        return;

    const bool looped = RegionLoopMath::isRegionLooped(*activeRegion);
    const int64_t audibleLengthSamples = RegionLoopMath::regionAudibleLengthSamples(*activeRegion, sampleRate);
    const int64_t offsetSamples = RegionLoopMath::regionOffsetSamples(*activeRegion, sampleRate);
    const int stemChannels = stemBuffer.getNumChannels();
    const int bufferChannels = buffer.getNumChannels();
    const int stemNumSamples = stemBuffer.getNumSamples();

    // Mix stem audio into output buffer (upmix mono stems to all output channels).
    // Integer index from host timeline samples + block offset (with loop wrap in samples).
    for (int channel = 0; channel < bufferChannels; ++channel)
    {
        auto* outputPtr = buffer.getWritePointer(channel);
        const auto* stemPtr = stemBuffer.getReadPointer(channel < stemChannels ? channel : 0);

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const int64_t timelineSample = transport.timeInSamples + static_cast<int64_t>(sample);

            if (timelineSample >= effectiveEndSamples)
                break;

            if (timelineSample < regionStartSamples)
                continue;

            const int64_t posInRegionSamples = timelineSample - regionStartSamples;
            const int64_t wrappedPos = (looped && audibleLengthSamples > 0)
                ? RegionLoopMath::wrapSamplesIntoRegion(*activeRegion, posInRegionSamples, audibleLengthSamples)
                : posInRegionSamples;

            const int64_t stemSampleIndex = offsetSamples + wrappedPos;

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
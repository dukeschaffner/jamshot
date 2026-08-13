#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include "../StemModels.h"

//==============================================================================
/**
 * Helpers for Logic Pro-style region looping.
 *
 * A region with loopEnd > endTime tiles its audible window
 * [offset, offset + (endTime - startTime)] across [endTime, loopEnd].
 *
 * Pure arithmetic — safe to call from the audio thread.
 */
namespace RegionLoopMath
{
    inline bool isRegionLooped(const StemRegion& region)
    {
        return region.loopEnd > region.endTime;
    }

    inline double regionAudibleLength(const StemRegion& region)
    {
        return std::max(0.0, region.endTime - region.startTime);
    }

    inline double regionEffectiveEnd(const StemRegion& region)
    {
        if (isRegionLooped(region))
            return region.loopEnd;
        return region.endTime;
    }

    /**
     * Wrap a time-into-region (seconds from region.startTime) into the audible
     * source window when the region is looped. Non-looped regions return the
     * input unchanged.
     */
    inline double wrapTimeIntoRegion(const StemRegion& region, double timeIntoRegion)
    {
        if (!isRegionLooped(region))
            return timeIntoRegion;

        const double audibleLength = regionAudibleLength(region);
        if (audibleLength <= 0.0)
            return 0.0;

        double wrapped = std::fmod(timeIntoRegion, audibleLength);
        if (wrapped < 0.0)
            wrapped += audibleLength;
        return wrapped;
    }

    /** Convert a seconds-domain timeline value to a sample index. */
    inline int64_t secondsToSamples(double seconds, double sampleRate)
    {
        return static_cast<int64_t>(std::llround(seconds * sampleRate));
    }

    inline int64_t regionStartSamples(const StemRegion& region, double sampleRate)
    {
        return secondsToSamples(region.startTime, sampleRate);
    }

    inline int64_t regionEndSamples(const StemRegion& region, double sampleRate)
    {
        return secondsToSamples(region.endTime, sampleRate);
    }

    inline int64_t regionLoopEndSamples(const StemRegion& region, double sampleRate)
    {
        return secondsToSamples(region.loopEnd, sampleRate);
    }

    inline int64_t regionOffsetSamples(const StemRegion& region, double sampleRate)
    {
        return secondsToSamples(region.offset, sampleRate);
    }

    inline int64_t regionAudibleLengthSamples(const StemRegion& region, double sampleRate)
    {
        return std::max(int64_t(0),
                        regionEndSamples(region, sampleRate) - regionStartSamples(region, sampleRate));
    }

    inline int64_t regionEffectiveEndSamples(const StemRegion& region, double sampleRate)
    {
        if (isRegionLooped(region))
            return regionLoopEndSamples(region, sampleRate);
        return regionEndSamples(region, sampleRate);
    }

    /**
     * Wrap samples-into-region into the audible source window (sample domain).
     * Non-looped regions return the input unchanged.
     */
    inline int64_t wrapSamplesIntoRegion(const StemRegion& region,
                                         int64_t samplesIntoRegion,
                                         int64_t audibleLengthSamples)
    {
        if (!isRegionLooped(region))
            return samplesIntoRegion;

        if (audibleLengthSamples <= 0)
            return 0;

        int64_t wrapped = samplesIntoRegion % audibleLengthSamples;
        if (wrapped < 0)
            wrapped += audibleLengthSamples;
        return wrapped;
    }
}

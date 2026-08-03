#pragma once

#include <algorithm>
#include <cmath>
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
}

#include "buildTrackTimelineLanes.h"
#include <algorithm>

using namespace juce;

namespace
{
    constexpr double kDefaultSampleRate = 44100.0;
}

Array<TimelineLane> buildTrackTimelineLanes(const SterioPluginProcessor& processor)
{
    Array<TimelineLane> lanes;
    auto stems = processor.getLoadedStems();

    struct StemSort
    {
        bool operator()(const StemTrack& a, const StemTrack& b) const
        {
            if (a.order != b.order)
                return a.order < b.order;
            return a.trackId < b.trackId;
        }
    };

    std::sort(stems.begin(), stems.end(), StemSort{});

    const double sampleRate = processor.getCurrentSampleRate() > 0.0
        ? processor.getCurrentSampleRate()
        : kDefaultSampleRate;

    for (const auto& stem : stems)
    {
        TimelineLane lane;
        lane.mixId = stem.projectTrackId > 0 ? stem.projectTrackId : stem.trackId;
        lane.name = stem.title.isNotEmpty()
            ? stem.title
            : ("Stem " + String(stem.trackId));

        if (stem.regions.isEmpty())
        {
            if (stem.audioBuffer)
            {
                TimelineClipVisual visual;
                visual.clipId = stem.trackId;
                visual.startTime = 0.0;
                visual.trimStart = 0.0;
                visual.endTime = static_cast<double>(stem.audioBuffer->getNumSamples()) / sampleRate;
                visual.trimEndForPeaks = visual.endTime;
                visual.audioBuffer = stem.audioBuffer;
                lane.clips.add(std::move(visual));
            }
        }
        else
        {
            for (int r = 0; r < stem.regions.size(); ++r)
            {
                const auto& region = stem.regions.getReference(r);
                TimelineClipVisual visual;
                // Unique peak key per stem region
                visual.clipId = stem.trackId * 1000 + r;
                visual.startTime = region.startTime;
                visual.endTime = region.endTime;
                visual.trimStart = region.offset;
                if (region.loopEnd > region.endTime)
                    visual.loopEnd = region.loopEnd;

                const double regionLen = jmax(0.0, region.endTime - region.startTime);
                visual.trimEndForPeaks = region.offset + regionLen;
                visual.audioBuffer = stem.audioBuffer;
                lane.clips.add(std::move(visual));
            }
        }

        lanes.add(std::move(lane));
    }

    return lanes;
}

double computeTrackTimelineDuration(const Array<TimelineLane>& lanes)
{
    double maxEnd = 1.0;
    for (const auto& lane : lanes)
    {
        for (const auto& clip : lane.clips)
        {
            const double end = clip.loopEnd > clip.endTime ? clip.loopEnd : clip.endTime;
            maxEnd = jmax(maxEnd, end);
        }
    }
    return maxEnd;
}

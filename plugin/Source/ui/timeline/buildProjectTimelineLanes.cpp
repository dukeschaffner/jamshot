#include "buildProjectTimelineLanes.h"
#include <algorithm>
#include <map>

using namespace juce;

namespace
{
    constexpr double kDefaultSampleRate = 44100.0;
}

Array<TimelineLane> buildProjectTimelineLanes(const SterioPluginProcessor& processor)
{
    Array<TimelineLane> lanes;

    auto tracks = processor.getLoadedProjectTracks();
    auto clips = processor.getLoadedProjectClips();
    auto stems = processor.getLoadedStems();

    struct TrackSort
    {
        bool operator()(const ProjectTrackInfo& a, const ProjectTrackInfo& b) const
        {
            if (a.sortOrder != b.sortOrder)
                return a.sortOrder < b.sortOrder;
            return a.trackId < b.trackId;
        }
    };

    Array<ProjectTrackInfo> sortedTracks = tracks;
    std::sort(sortedTracks.begin(), sortedTracks.end(), TrackSort{});

    std::map<int, std::shared_ptr<AudioBuffer<float>>> buffersByClipId;
    for (const auto& stem : stems)
    {
        if (stem.audioBuffer)
            buffersByClipId[stem.trackId] = stem.audioBuffer;
    }

    if (sortedTracks.isEmpty())
    {
        std::map<int, bool> seen;
        for (const auto& clip : clips)
        {
            if (seen[clip.trackId])
                continue;
            seen[clip.trackId] = true;
            ProjectTrackInfo info;
            info.trackId = clip.trackId;
            info.name = "Track " + String(clip.trackId);
            info.sortOrder = clip.trackId;
            sortedTracks.add(info);
        }
    }

    const double sampleRate = processor.getCurrentSampleRate() > 0.0
        ? processor.getCurrentSampleRate()
        : kDefaultSampleRate;

    for (const auto& trackInfo : sortedTracks)
    {
        TimelineLane lane;
        lane.mixId = trackInfo.trackId;
        lane.name = trackInfo.name;

        for (const auto& clip : clips)
        {
            if (clip.trackId != trackInfo.trackId)
                continue;

            TimelineClipVisual visual;
            visual.clipId = clip.clipId;
            visual.startTime = clip.startTime;
            visual.trimStart = clip.trimStart;

            auto bufferIt = buffersByClipId.find(clip.clipId);
            if (bufferIt != buffersByClipId.end())
                visual.audioBuffer = bufferIt->second;

            bool usedRegion = false;
            for (const auto& stem : stems)
            {
                if (stem.trackId != clip.clipId || stem.regions.isEmpty())
                    continue;
                visual.startTime = stem.regions[0].startTime;
                visual.endTime = stem.regions[0].endTime;
                visual.trimStart = stem.regions[0].offset;
                if (stem.regions[0].loopEnd > stem.regions[0].endTime)
                    visual.loopEnd = stem.regions[0].loopEnd;
                usedRegion = true;
                break;
            }

            if (!usedRegion)
            {
                visual.startTime = clip.startTime;
                visual.trimStart = clip.trimStart;
                const double assetDurationSec = visual.audioBuffer
                    ? static_cast<double>(visual.audioBuffer->getNumSamples()) / sampleRate
                    : 0.0;
                const double trimEnd = clip.trimEnd.has_value() ? *clip.trimEnd : assetDurationSec;
                const double clipDuration = jmax(0.0, trimEnd - clip.trimStart);
                visual.endTime = clip.startTime + clipDuration;
                if (clip.loopEnd.has_value() && *clip.loopEnd > visual.endTime)
                    visual.loopEnd = *clip.loopEnd;
            }

            visual.trimEndForPeaks = clip.trimEnd.has_value()
                ? *clip.trimEnd
                : (visual.audioBuffer
                       ? static_cast<double>(visual.audioBuffer->getNumSamples()) / sampleRate
                       : visual.endTime - visual.startTime + visual.trimStart);

            lane.clips.add(std::move(visual));
        }

        lanes.add(std::move(lane));
    }

    return lanes;
}

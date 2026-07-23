#include "ProjectTimelineView.h"
#include <algorithm>
#include <cmath>

using namespace juce;

namespace
{
    constexpr int kPeakBuckets = 128;

    std::vector<float> computeMinMaxPeaks(const AudioBuffer<float>& buffer,
                                          double trimStart,
                                          double trimEnd,
                                          double sampleRate)
    {
        std::vector<float> peaks;
        const int numSamples = buffer.getNumSamples();
        if (numSamples <= 0 || sampleRate <= 0.0)
            return peaks;

        const int startSample = jlimit(0, numSamples - 1,
                                       static_cast<int>(trimStart * sampleRate));
        int endSample = trimEnd > trimStart
            ? static_cast<int>(trimEnd * sampleRate)
            : numSamples;
        endSample = jlimit(startSample + 1, numSamples, endSample);

        const int usableSamples = endSample - startSample;
        if (usableSamples <= 0)
            return peaks;

        const int buckets = jmin(kPeakBuckets, usableSamples);
        peaks.resize(static_cast<size_t>(buckets) * 2u, 0.0f);

        const int numChannels = buffer.getNumChannels();

        for (int b = 0; b < buckets; ++b)
        {
            const int segStart = startSample + (b * usableSamples) / buckets;
            const int segEnd = startSample + ((b + 1) * usableSamples) / buckets;

            float minVal = 0.0f;
            float maxVal = 0.0f;

            for (int ch = 0; ch < numChannels; ++ch)
            {
                const float* data = buffer.getReadPointer(ch);
                for (int i = segStart; i < segEnd; ++i)
                {
                    const float sample = data[i];
                    minVal = jmin(minVal, sample);
                    maxVal = jmax(maxVal, sample);
                }
            }

            peaks[static_cast<size_t>(b) * 2u] = minVal;
            peaks[static_cast<size_t>(b) * 2u + 1u] = maxVal;
        }

        return peaks;
    }
}

//==============================================================================
ProjectTimelineView::ProjectTimelineView(SterioPluginProcessor& processor)
    : processorRef(processor),
      content(*this)
{
    addAndMakeVisible(viewport);
    viewport.setViewedComponent(&content, false);
    viewport.setScrollBarsShown(true, false);

    content.addAndMakeVisible(playhead);
    playhead.setInterceptsMouseClicks(false, false);

    startTimerHz(30);
}

ProjectTimelineView::~ProjectTimelineView()
{
    stopTimer();
}

void ProjectTimelineView::paint(Graphics& g)
{
    g.fillAll(Colors::LIGHT_GREY);
}

void ProjectTimelineView::resized()
{
    viewport.setBounds(getLocalBounds());

    const int contentHeight = jmax(getHeight(),
                                   lanes.size() * (kLaneHeight + kLaneGap) + 4);
    content.setSize(getWidth(), contentHeight);
    updatePlayheadPosition();
}

void ProjectTimelineView::setProjectDuration(double durationSeconds)
{
    projectDurationSeconds = jmax(1.0, durationSeconds);
    updatePlayheadPosition();
    content.repaint();
}

void ProjectTimelineView::refreshFromProcessor()
{
    lanes.clear();

    auto tracks = processorRef.getLoadedProjectTracks();
    auto clips = processorRef.getLoadedProjectClips();
    auto stems = processorRef.getLoadedStems();

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
        // ProjectLoader maps stem.trackId = clip.clipId
        if (stem.audioBuffer)
            buffersByClipId[stem.trackId] = stem.audioBuffer;
    }

    if (sortedTracks.isEmpty())
    {
        // Fallback: derive lanes from clip trackIds when track meta missing
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

    for (const auto& trackInfo : sortedTracks)
    {
        TrackLane lane;
        lane.info = trackInfo;

        for (const auto& clip : clips)
        {
            if (clip.trackId != trackInfo.trackId)
                continue;

            ClipVisual visual;
            visual.clipId = clip.clipId;
            visual.trackId = clip.trackId;
            visual.startTime = clip.startTime;
            visual.trimStart = clip.trimStart;

            const double sampleRate = processorRef.getCurrentSampleRate() > 0.0
                ? processorRef.getCurrentSampleRate()
                : kDefaultSampleRate;

            auto bufferIt = buffersByClipId.find(clip.clipId);
            if (bufferIt != buffersByClipId.end())
                visual.audioBuffer = bufferIt->second;

            // Prefer StemRegion timing (already computed in seconds by ProjectLoader)
            bool usedRegion = false;
            for (const auto& stem : stems)
            {
                if (stem.trackId != clip.clipId || stem.regions.isEmpty())
                    continue;
                visual.startTime = stem.regions[0].startTime;
                visual.endTime = stem.regions[0].endTime;
                visual.trimStart = stem.regions[0].offset;
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
            }

            const double trimEndForPeaks = clip.trimEnd.has_value()
                ? *clip.trimEnd
                : (visual.audioBuffer
                       ? static_cast<double>(visual.audioBuffer->getNumSamples()) / sampleRate
                       : visual.endTime - visual.startTime + visual.trimStart);

            lane.clips.add(visual);

            if (visual.audioBuffer)
                computePeaksAsync(visual.clipId, visual.audioBuffer, visual.trimStart, trimEndForPeaks, sampleRate);
        }

        lanes.add(std::move(lane));
    }

    resized();
    content.repaint();
}

void ProjectTimelineView::timerCallback()
{
    const auto transport = processorRef.getTransportState();
    if (transport.hasValidPosition)
        playheadSeconds = jlimit(0.0, projectDurationSeconds, transport.timeInSeconds);
    else
        playheadSeconds = 0.0;

    updatePlayheadPosition();
}

void ProjectTimelineView::updatePlayheadPosition()
{
    const int timelineWidth = jmax(1, content.getWidth() - kLabelWidth);
    const int x = kLabelWidth + static_cast<int>(secondsToX(playheadSeconds, timelineWidth));
    playhead.setBounds(x, 0, 2, content.getHeight());
}

float ProjectTimelineView::secondsToX(double seconds, int timelineWidth) const
{
    if (projectDurationSeconds <= 0.0)
        return 0.0f;
    return static_cast<float>((seconds / projectDurationSeconds) * timelineWidth);
}

Colour ProjectTimelineView::laneColour(int index) const
{
    static const Colour palette[] = {
        Colors::SEAFOAM.withAlpha(0.55f),
        Colors::RUSTIC_PINK.withAlpha(0.55f),
        Colors::SEAFOAM_LIGHT.withAlpha(0.7f),
        Colors::RUSTIC_PINK_LIGHT.withAlpha(0.7f),
    };
    return palette[static_cast<size_t>(index) % (sizeof(palette) / sizeof(palette[0]))];
}

void ProjectTimelineView::paintContent(Graphics& g)
{
    g.fillAll(Colors::WHITE);

    const int width = content.getWidth();
    const int timelineWidth = jmax(1, width - kLabelWidth);

    for (int i = 0; i < lanes.size(); ++i)
    {
        const auto& lane = lanes.getReference(i);
        const int y = i * (kLaneHeight + kLaneGap);

        // Lane background
        g.setColour(i % 2 == 0 ? Colors::WHITE : Colors::LIGHT_GREY);
        g.fillRect(0, y, width, kLaneHeight);

        // Track label
        g.setColour(Colors::BLACK);
        g.setFont(Font(11.0f, Font::bold));
        g.drawText(lane.info.name.isNotEmpty() ? lane.info.name : ("Track " + String(lane.info.trackId)),
                   4, y, kLabelWidth - 8, kLaneHeight,
                   Justification::centredLeft, true);

        // Clips
        for (const auto& clip : lane.clips)
        {
            const float x1 = static_cast<float>(kLabelWidth) + secondsToX(clip.startTime, timelineWidth);
            const float x2 = static_cast<float>(kLabelWidth) + secondsToX(clip.endTime, timelineWidth);
            const float clipW = jmax(2.0f, x2 - x1);
            Rectangle<float> clipBounds(x1, static_cast<float>(y + 4), clipW, static_cast<float>(kLaneHeight - 8));

            g.setColour(laneColour(i));
            g.fillRoundedRectangle(clipBounds, 3.0f);

            g.setColour(Colors::BLACK.withAlpha(0.15f));
            g.drawRoundedRectangle(clipBounds, 3.0f, 1.0f);

            if (clip.peaksReady && !clip.peaks.empty())
            {
                const int numBuckets = static_cast<int>(clip.peaks.size() / 2);
                Path waveform;
                const float midY = clipBounds.getCentreY();
                const float halfH = clipBounds.getHeight() * 0.4f;

                bool started = false;
                for (int b = 0; b < numBuckets; ++b)
                {
                    const float t = static_cast<float>(b) / static_cast<float>(jmax(1, numBuckets - 1));
                    const float x = clipBounds.getX() + t * clipBounds.getWidth();
                    const float maxVal = clip.peaks[static_cast<size_t>(b) * 2u + 1u];
                    const float yTop = midY - maxVal * halfH;

                    if (!started)
                    {
                        waveform.startNewSubPath(x, yTop);
                        started = true;
                    }
                    else
                    {
                        waveform.lineTo(x, yTop);
                    }
                }

                for (int b = numBuckets - 1; b >= 0; --b)
                {
                    const float t = static_cast<float>(b) / static_cast<float>(jmax(1, numBuckets - 1));
                    const float x = clipBounds.getX() + t * clipBounds.getWidth();
                    const float minVal = clip.peaks[static_cast<size_t>(b) * 2u];
                    const float yBottom = midY - minVal * halfH;
                    waveform.lineTo(x, yBottom);
                }

                waveform.closeSubPath();
                g.setColour(Colors::BLACK.withAlpha(0.35f));
                g.fillPath(waveform);
            }
        }

        // Separator
        g.setColour(Colors::LIGHT_GREY.darker(0.1f));
        g.drawLine(0.0f, static_cast<float>(y + kLaneHeight), static_cast<float>(width),
                   static_cast<float>(y + kLaneHeight), 1.0f);
    }

    // Label / timeline divider
    g.setColour(Colors::GREY.withAlpha(0.4f));
    g.drawLine(static_cast<float>(kLabelWidth), 0.0f,
               static_cast<float>(kLabelWidth), static_cast<float>(content.getHeight()), 1.0f);
}

void ProjectTimelineView::computePeaksAsync(int clipId,
                                            std::shared_ptr<AudioBuffer<float>> buffer,
                                            double trimStart,
                                            double trimEnd,
                                            double sampleRate)
{
    if (!buffer)
        return;

    Thread::launch([this, clipId, buffer, trimStart, trimEnd, sampleRate]() {
        auto computedPeaks = computeMinMaxPeaks(*buffer, trimStart, trimEnd, sampleRate);
        MessageManager::callAsync([this, clipId, peaks = std::move(computedPeaks)]() mutable {
            applyPeaks(clipId, std::move(peaks));
        });
    });
}

void ProjectTimelineView::applyPeaks(int clipId, std::vector<float> peaks)
{
    for (auto& lane : lanes)
    {
        for (auto& clip : lane.clips)
        {
            if (clip.clipId == clipId)
            {
                clip.peaks = std::move(peaks);
                clip.peaksReady = true;
                content.repaint();
                return;
            }
        }
    }
}

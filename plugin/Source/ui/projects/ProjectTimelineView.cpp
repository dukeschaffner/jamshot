#include "ProjectTimelineView.h"
#include <algorithm>
#include <cmath>

using namespace juce;

namespace
{
    constexpr int kPeakBuckets = 128;
    constexpr int kMaxVisibleLoopTiles = 200;

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
    viewport.setScrollBarsShown(true, true);

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
    g.fillAll(Colors::BACKGROUND);
}

void ProjectTimelineView::resized()
{
    viewport.setBounds(getLocalBounds().reduced(UiMetrics::timelinePad - 2, 10)
                                       .withTrimmedBottom(2));

    const int laneStackH = lanes.isEmpty()
        ? 0
        : lanes.size() * (kLaneHeight + kLaneGap) - kLaneGap;

    // Two-pass size so scrollbar appearance doesn't leave a white strip beside lanes.
    auto syncContentSize = [this, laneStackH]() {
        const int contentHeight = jmax(viewport.getMaximumVisibleHeight(), laneStackH);
        const int contentWidth = jmax(UiMetrics::timelineMinContentW,
                                      viewport.getMaximumVisibleWidth());
        content.setSize(contentWidth, contentHeight);
    };

    syncContentSize();
    syncContentSize();
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
    // Artifact hue families: fill alphas match .lane[data-hue]
    static const Colour fills[] = {
        Colors::SEAFOAM.withAlpha(0.28f),
        Colors::P2.withAlpha(0.20f),
        Colors::P1.withAlpha(0.24f),
        Colors::S1.withAlpha(0.24f),
    };
    return fills[static_cast<size_t>(index) % 4u];
}

static Colour laneBorderColour(int index)
{
    static const Colour borders[] = {
        Colors::SEAFOAM_DARK.withAlpha(0.85f),
        Colors::P2.withAlpha(0.85f),
        Colors::P1.withAlpha(0.90f),
        Colors::S1.withAlpha(0.90f),
    };
    return borders[static_cast<size_t>(index) % 4u];
}

static Colour laneWaveColour(int index)
{
    static const Colour waves[] = {
        Colour(0xff3ea37c),
        Colour(0xffcf6d40),
        Colour(0xffbd7458),
        Colour(0xff5e8271),
    };
    return waves[static_cast<size_t>(index) % 4u];
}

Rectangle<int> ProjectTimelineView::muteButtonBounds(int laneIndex) const
{
    const int y = laneIndex * (kLaneHeight + kLaneGap) + (kLaneHeight - kMixButtonH);
    const int half = kLabelWidth / 2;
    return { 0, y, half, kMixButtonH };
}

Rectangle<int> ProjectTimelineView::soloButtonBounds(int laneIndex) const
{
    const int y = laneIndex * (kLaneHeight + kLaneGap) + (kLaneHeight - kMixButtonH);
    const int half = kLabelWidth / 2;
    return { half, y, kLabelWidth - half, kMixButtonH };
}

void ProjectTimelineView::handleContentMouseDown(const MouseEvent& event)
{
    const auto pos = event.getPosition();
    for (int i = 0; i < lanes.size(); ++i)
    {
        const int trackId = lanes.getReference(i).info.trackId;
        if (muteButtonBounds(i).contains(pos))
        {
            processorRef.toggleProjectTrackMute(trackId);
            content.repaint();
            return;
        }
        if (soloButtonBounds(i).contains(pos))
        {
            processorRef.toggleProjectTrackSolo(trackId);
            content.repaint();
            return;
        }
    }
}

void ProjectTimelineView::paintContent(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);

    const int width = content.getWidth();
    const int timelineWidth = jmax(1, width - kLabelWidth);
    const auto mixState = processorRef.getProjectMixState();
    const float radius = UiMetrics::radiusSm;

    // Back button floats over the first lane; keep its label clear of the control.
    const int firstLabelPadL = jmax(8, (6 + UiMetrics::projectBackSize)
                                         - (UiMetrics::timelinePad - 2) + 4);

    for (int i = 0; i < lanes.size(); ++i)
    {
        const auto& lane = lanes.getReference(i);
        const int y = i * (kLaneHeight + kLaneGap);
        const bool isMuted = mixState && mixState->isTrackMuted(lane.info.trackId);
        const bool isSolo = mixState && mixState->soloTrackId == lane.info.trackId;

        auto laneBounds = Rectangle<float>(0.0f, (float) y, (float) width, (float) kLaneHeight);

        // Match artifact: overflow:hidden rounded lane — controls flush to track (no white gutters).
        {
            Path clipPath;
            clipPath.addRoundedRectangle(laneBounds, radius);
            Graphics::ScopedSaveState clipped(g);
            g.reduceClipRegion(clipPath);

            g.setColour(Colors::GREY_1);
            g.fillRect(laneBounds);

            g.setColour(Colors::BACKGROUND);
            g.fillRect(0.0f, (float) y, (float) kLabelWidth, (float) kLaneHeight);

            // Track label (vertically centred above the M/S row)
            const int labelPadL = (i == 0) ? firstLabelPadL : 8;
            const int msY = y + kLaneHeight - kMixButtonH;
            auto labelArea = Rectangle<int>(labelPadL, y,
                                            kLabelWidth - labelPadL - 8,
                                            msY - y);
            g.setColour(Colors::TEXT_SECONDARY);
            g.setFont(Font(UiMetrics::fontLaneLabel, Font::bold));
            g.drawFittedText(lane.info.name.isNotEmpty() ? lane.info.name
                                                         : ("Track " + String(lane.info.trackId)),
                             labelArea, Justification::centredLeft, 2);

            // Mute / Solo toggles (fills only — borders drawn after so they stay visible)
            auto drawMixButton = [&](Rectangle<int> bounds, const char* label, bool active, bool isMute) {
                Colour fill = Colors::BACKGROUND;
                Colour text = Colors::TEXT_DISABLED;
                if (active && isMute)
                {
                    fill = Colors::RUSTIC_PINK;
                    text = Colors::BACKGROUND;
                }
                else if (active)
                {
                    fill = Colors::SEAFOAM;
                    text = Colors::GREY_4;
                }

                g.setColour(fill);
                g.fillRect(bounds);
                g.setFont(Font(UiMetrics::fontMs, Font::bold));
                g.setColour(text);
                g.drawText(label, bounds, Justification::centred, false);
            };

            drawMixButton(muteButtonBounds(i), "M", isMuted, true);
            drawMixButton(soloButtonBounds(i), "S", isSolo, false);

            // Header chrome last (matches artifact .lane-label / .lane-controls / .lane-ms)
            g.setColour(Colors::GREY_2);
            g.fillRect(0, msY, kLabelWidth, 1);                         // title | M/S
            g.fillRect(kLabelWidth / 2, msY, 1, kMixButtonH);           // M | S
            g.fillRect(kLabelWidth - 1, y, 1, kLaneHeight);             // controls | track

            // Clips
            for (const auto& clip : lane.clips)
            {
                const bool isLooped = clip.loopEnd > clip.endTime;
                const double visualEnd = isLooped ? clip.loopEnd : clip.endTime;
                const float x1 = static_cast<float>(kLabelWidth) + secondsToX(clip.startTime, timelineWidth);
                const float xEnd = static_cast<float>(kLabelWidth) + secondsToX(clip.endTime, timelineWidth);
                const float xLoop = static_cast<float>(kLabelWidth) + secondsToX(visualEnd, timelineWidth);
                const float clipW = jmax(2.0f, xLoop - x1);
                const float audibleW = jmax(1.0f, xEnd - x1);
                Rectangle<float> clipBounds(x1, static_cast<float>(y + 5), clipW, static_cast<float>(kLaneHeight - 10));
                Rectangle<float> audibleBounds(x1, clipBounds.getY(), audibleW, clipBounds.getHeight());

                g.setColour(laneColour(i));
                g.fillRoundedRectangle(clipBounds, 4.0f);
                g.setColour(laneBorderColour(i));
                g.drawRoundedRectangle(clipBounds, 4.0f, 1.0f);

                auto drawWaveformInBounds = [&](Rectangle<float> bounds, float alpha) {
                    if (!clip.peaksReady || clip.peaks.empty())
                        return;

                    const int numBuckets = static_cast<int>(clip.peaks.size() / 2);
                    Path waveform;
                    const float midY = bounds.getCentreY();
                    const float halfH = bounds.getHeight() * 0.36f;

                    bool started = false;
                    for (int b = 0; b < numBuckets; ++b)
                    {
                        const float t = static_cast<float>(b) / static_cast<float>(jmax(1, numBuckets - 1));
                        const float x = bounds.getX() + t * bounds.getWidth();
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
                        const float x = bounds.getX() + t * bounds.getWidth();
                        const float minVal = clip.peaks[static_cast<size_t>(b) * 2u];
                        const float yBottom = midY - minVal * halfH;
                        waveform.lineTo(x, yBottom);
                    }

                    waveform.closeSubPath();
                    g.setColour(laneWaveColour(i).withMultipliedAlpha(alpha));
                    g.fillPath(waveform);
                };

                drawWaveformInBounds(audibleBounds, 0.95f);

                if (isLooped)
                {
                    Rectangle<float> loopArea(xEnd, clipBounds.getY(),
                                              jmax(0.0f, xLoop - xEnd), clipBounds.getHeight());
                    g.setColour(Colors::BACKGROUND.withAlpha(0.12f));
                    g.fillRect(loopArea);

                    const double audibleLength = clip.endTime - clip.startTime;
                    if (audibleLength > 0.0)
                    {
                        double tileStart = clip.endTime;
                        int tileIndex = 0;
                        while (tileStart < clip.loopEnd && tileIndex < kMaxVisibleLoopTiles)
                        {
                            const double tileDuration = jmin(audibleLength, clip.loopEnd - tileStart);
                            const float tileX = static_cast<float>(kLabelWidth)
                                + secondsToX(tileStart, timelineWidth);
                            const float tileW = secondsToX(tileStart + tileDuration, timelineWidth)
                                - secondsToX(tileStart, timelineWidth);

                            g.setColour(Colors::TEXT_PRIMARY.withAlpha(0.18f));
                            g.fillRect(tileX, clipBounds.getY(), 1.0f, clipBounds.getHeight());

                            if (clip.peaksReady && !clip.peaks.empty() && tileW > 0.5f)
                            {
                                const float fullTileW = secondsToX(tileStart + audibleLength, timelineWidth)
                                    - secondsToX(tileStart, timelineWidth);
                                Rectangle<float> fullTileBounds(tileX, clipBounds.getY(),
                                                                jmax(1.0f, fullTileW), clipBounds.getHeight());
                                Rectangle<float> visibleTileBounds(tileX, clipBounds.getY(),
                                                                   tileW, clipBounds.getHeight());

                                Graphics::ScopedSaveState saved(g);
                                g.reduceClipRegion(visibleTileBounds.toNearestInt());
                                drawWaveformInBounds(fullTileBounds, 0.45f);
                            }

                            tileStart += audibleLength;
                            ++tileIndex;
                        }
                    }
                }
            }
        }

        g.setColour(Colors::GREY_2);
        g.drawRoundedRectangle(laneBounds.reduced(0.5f), radius, 1.0f);
    }
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

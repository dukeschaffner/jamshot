#pragma once

#include "StemTimelineModels.h"
#include "../../PluginProcessor.h"

/** Build timeline lanes from the processor's loaded track stems. */
juce::Array<TimelineLane> buildTrackTimelineLanes(const SterioPluginProcessor& processor);

/** Duration axis for track mode (max region end / loop end). */
double computeTrackTimelineDuration(const juce::Array<TimelineLane>& lanes);

#pragma once

#include "StemTimelineModels.h"
#include "../../PluginProcessor.h"

/** Build timeline lanes from the processor's loaded project tracks/clips/stems. */
juce::Array<TimelineLane> buildProjectTimelineLanes(const SterioPluginProcessor& processor);

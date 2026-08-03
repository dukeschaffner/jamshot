#pragma once

#include <juce_core/juce_core.h>
#include <memory>

//==============================================================================
/** Immutable per-project mute/solo monitor state for the plugin timeline.
 *  Held as std::shared_ptr and swapped with std::atomic_store (copy-on-write).
 *  Message thread writes; audio thread only std::atomic_load + reads.
 */
struct ProjectMixState
{
    juce::Array<int> mutedTrackIds;
    int soloTrackId = -1; // -1 = no exclusive solo

    bool isTrackMuted(int projectTrackId) const
    {
        return mutedTrackIds.contains(projectTrackId);
    }

    bool shouldPlayTrack(int projectTrackId) const
    {
        if (projectTrackId <= 0)
            return true;

        if (soloTrackId != -1)
            return projectTrackId == soloTrackId;

        return !isTrackMuted(projectTrackId);
    }

    static std::shared_ptr<ProjectMixState> makeEmpty()
    {
        return std::make_shared<ProjectMixState>();
    }

    static std::shared_ptr<ProjectMixState> withToggledMute(
        const ProjectMixState& current, int projectTrackId)
    {
        auto next = std::make_shared<ProjectMixState>(current);
        if (next->mutedTrackIds.contains(projectTrackId))
            next->mutedTrackIds.removeFirstMatchingValue(projectTrackId);
        else
            next->mutedTrackIds.addIfNotAlreadyThere(projectTrackId);
        return next;
    }

    static std::shared_ptr<ProjectMixState> withToggledSolo(
        const ProjectMixState& current, int projectTrackId)
    {
        auto next = std::make_shared<ProjectMixState>(current);
        if (next->soloTrackId == projectTrackId)
            next->soloTrackId = -1;
        else
            next->soloTrackId = projectTrackId;
        return next;
    }

    /** Drop muted/solo ids that are not in the active track set. */
    static std::shared_ptr<ProjectMixState> prunedToTracks(
        const ProjectMixState& current, const juce::Array<int>& validTrackIds)
    {
        auto next = std::make_shared<ProjectMixState>();
        for (const int id : current.mutedTrackIds)
        {
            if (validTrackIds.contains(id))
                next->mutedTrackIds.add(id);
        }
        if (current.soloTrackId != -1 && validTrackIds.contains(current.soloTrackId))
            next->soloTrackId = current.soloTrackId;
        return next;
    }
};

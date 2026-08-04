#pragma once

#include <juce_core/juce_core.h>
#include <memory>
#include "ProjectMixState.h"

//==============================================================================
/** Owns project mute/solo monitor state, host-session persistence, and toggles.
 *  Message thread writes; audio/UI threads may call getState() (lock-free load).
 */
class ProjectMixController
{
public:
    ProjectMixController();

    /** Atomic read of current mix state (safe for UI + audio thread). */
    std::shared_ptr<const ProjectMixState> getState() const;

    /** Clear active mix state (e.g. on selection clear). Pending host state kept. */
    void clearActive();

    /** Reset active state when switching to a different project. */
    void resetIfProjectChanged(const juce::String& previousProjectId,
                               const juce::String& nextProjectId);

    void toggleMute(int projectTrackId);
    void toggleSolo(int projectTrackId);

    /** Drop muted/solo ids that are not in the active track set. */
    void pruneToTracks(const juce::Array<int>& validTrackIds);

    /** Apply host-session pending state if it matches projectId. */
    void applyPendingIfMatching(const juce::String& projectId);

    /** After project load: apply pending (if matching) then prune to valid tracks. */
    void onProjectLoaded(const juce::String& projectId,
                         const juce::Array<int>& validTrackIds);

    /** Serialize for AudioProcessor::getStateInformation. */
    void writeToMemoryBlock(juce::MemoryBlock& destData,
                            const juce::String& loadedProjectId) const;

    /** Restore from AudioProcessor::setStateInformation. */
    void readFromMemory(const void* data,
                        int sizeInBytes,
                        const juce::String& loadedProjectId,
                        const juce::Array<int>& validTrackIds);

private:
    void setState(std::shared_ptr<ProjectMixState> next);
    juce::var serialize(const juce::String& loadedProjectId) const;
    void restoreFromVar(const juce::var& stateVar,
                        const juce::String& loadedProjectId,
                        const juce::Array<int>& validTrackIds);

    std::shared_ptr<ProjectMixState> state;

    mutable juce::CriticalSection pendingLock;
    juce::String pendingProjectId;
    std::shared_ptr<ProjectMixState> pendingState;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ProjectMixController)
};

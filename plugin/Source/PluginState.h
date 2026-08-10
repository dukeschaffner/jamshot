#pragma once

#include <atomic>
#include <juce_events/juce_events.h>
#include "StemModels.h"

//==============================================================================
class PluginState : public juce::AsyncUpdater
{
public:
    PluginState();
    ~PluginState() override = default;

    //==============================================================================
    // Thread-safe updates
    void setCurrentTrack(const TrackInfo& track); // safe from any thread
    void clearCurrentTrack();                      // safe from any thread
    void setCurrentProject(const ProjectInfo& project);
    void clearCurrentProject();

    //==============================================================================
    juce::Optional<TrackInfo> getCurrentTrack() const; // safe for any thread
    juce::Optional<ProjectInfo> getCurrentProject() const;

    struct ProjectLoadProgress
    {
        int current = 0;
        int total = 0;
    };

    /** Set project asset download progress (safe from any thread). */
    void setProjectLoadProgress(int current, int total);
    void clearProjectLoadProgress();
    juce::Optional<ProjectLoadProgress> getProjectLoadProgress() const;

    /** Track-mode stem download in progress (safe from any thread). */
    void setTrackStemsLoading(bool loading);
    bool isTrackStemsLoading() const;

    //==============================================================================
    // Add your listeners to get notified when the track changes
    void addChangeListener(juce::ChangeListener* listener);
    void removeChangeListener(juce::ChangeListener* listener);

    /** Notify listeners without changing selection (e.g. stems finished loading). */
    void notifyChanged();

private:
    //==============================================================================
    // AsyncUpdater callback — runs on the message thread
    void handleAsyncUpdate() override;

    std::shared_ptr<juce::Optional<TrackInfo>> currentTrack;
    std::shared_ptr<juce::Optional<ProjectInfo>> currentProject;
    std::shared_ptr<juce::Optional<ProjectLoadProgress>> projectLoadProgress;
    std::atomic<bool> trackStemsLoading { false };
    juce::ListenerList<juce::ChangeListener> listeners;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginState)
};
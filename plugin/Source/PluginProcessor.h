#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <functional>
#include "auth/AuthManager.h"
#include "playback/StemPlaybackEngine.h"
#include "playback/ProjectMixController.h"
#include "TransportState.h"
#include "SampleRateConverter.h"
#include "api/ConnectionManager.h"
#include "CacheManager.h"
#include "api/SterioApiClient.h"
#include "api/TrackLoader.h"
#include "api/ProjectLoader.h"
#include "StemModels.h"
#include "Services.h"
#include "PluginState.h"
#include "WebDawConnectionIndicatorModel.h"


//==============================================================================
class SterioPluginProcessor final : public juce::AudioProcessor
{
public:
    SterioPluginProcessor();
    ~SterioPluginProcessor() override;

    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;

    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override;

    const juce::String getName() const override;

    bool acceptsMidi() const override;
    bool producesMidi() const override;
    bool isMidiEffect() const override;
    double getTailLengthSeconds() const override;

    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram(int index) override;
    const juce::String getProgramName(int index) override;
    void changeProgramName(int index, const juce::String& newName) override;

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    /** Returns the current transport state from the host. Thread-safe for UI reads. */
    TransportState getTransportState() const;

    /** Set stems for playback. Called by editor when stems are loaded (Increment 5). */
    void setStems(const juce::Array<StemTrack>& stems);

    /** Get the current host sample rate */
    double getCurrentSampleRate() const { return currentHostSampleRate; }

    /** Set the current track info. Thread-safe. */
    void setCurrentTrack(const TrackInfo& track);

    /** Get the current track info. Thread-safe. */
    juce::Optional<TrackInfo> getCurrentTrack() const;

    /** Set the loaded stems. Thread-safe. */
    void setLoadedStems(const juce::Array<StemTrack>& newStems);

    /** Get the loaded stems. Thread-safe. */
    juce::Array<StemTrack> getLoadedStems() const;

    /** Clear the loaded stems. Thread-safe. */
    void clearLoadedStems();

    void loadStemsForTrack();

    /** Load project clips for playback after set_project message. */
    void loadProjectClips(const juce::String& projectId, const juce::Array<ProjectClip>& clips);

    /** Select a project from the plugin UI and load it for playback. */
    void selectProject(const ProjectSummary& project);

    /** Clear loaded track/project selection and playback stems. */
    void clearSelection();

    /** Apply project_sync clip updates without full reload when possible. */
    void syncProjectClips(const juce::String& projectId,
                          const juce::Array<ProjectClip>& previousClips,
                          const juce::Array<ProjectClip>& newClips);

    /** Thread-safe access to currently loaded project tracks (for timeline lanes). */
    juce::Array<ProjectTrackInfo> getLoadedProjectTracks() const;

    /** Thread-safe access to currently loaded project clips (for timeline). */
    juce::Array<ProjectClip> getLoadedProjectClips() const;

    /** Atomic read of project mute/solo monitor state (safe for UI + audio). */
    std::shared_ptr<const ProjectMixState> getProjectMixState() const;

    /** Toggle mute for a project track (message thread). */
    void toggleProjectTrackMute(int projectTrackId);

    /** Toggle exclusive solo for a project track (message thread). */
    void toggleProjectTrackSolo(int projectTrackId);

    /** Request reload of current stems or project clips with new sample rate */
    void requestStemReload();

    /** Handle incoming message from WebSocket */
    void handleIncomingMessage(const std::string& json);

    /** Fires on the message thread after a project is opened remotely via set_project. */
    juce::ChangeBroadcaster& getRemoteProjectOpenBroadcaster() { return remoteProjectOpenBroadcaster; }

    WebDawConnectionIndicatorModel& getWebDawConnectionIndicator() { return webDawConnectionIndicator; }

    Services& getServices() { return services; }

private:
    juce::Array<int> getLoadedProjectTrackIds() const;
    void handleSetTrackMessage(juce::DynamicObject* obj);
    void handleStemMetadataSyncMessage(juce::DynamicObject* obj);
    void handleSetProjectMessage(juce::DynamicObject* obj);
    void handleProjectSyncMessage(juce::DynamicObject* obj);
    void handleWebDawSyncStatusMessage(juce::DynamicObject* obj);

    void sendProjectLoadProgress(const juce::String& projectId, int current, int total);
    void sendProjectLoadComplete(const juce::String& projectId);
    void sendProjectLoadError(const juce::String& projectId, const juce::String& error);
    void sendProjectSyncComplete(const juce::String& projectId);
    void sendProjectSyncError(const juce::String& projectId, const juce::String& error);
    std::string buildPluginProjectStatusMessage() const;
    /** Push current loaded-project id (or none) to all connected web clients. */
    void announcePluginProjectStatus();
    void ensureLocalWebSocketServer();

    /** Handle sample rate changes and convert stems if necessary */
    void handleSampleRateChange(double newSampleRate);

    mutable juce::CriticalSection transportLock;
    TransportState transportState;

    void updateTransportFromHost();

    CacheManager cacheManager;
    AuthManager authManager;
    SterioApiClient apiClient { authManager };
    ConnectionManager connectionManager;
    TrackLoader trackLoader { apiClient, cacheManager };
    ProjectLoader projectLoader { apiClient, cacheManager };
    PluginState pluginState;
    Services services { authManager, apiClient, cacheManager, trackLoader, pluginState };

    // Stem playback engine (Increment 5)
    StemPlaybackEngine playbackEngine;

    // Sample rate conversion support
    double currentHostSampleRate = 44100.0;
    double previousHostSampleRate = 44100.0;
    SampleRateConverter sampleRateConverter;

    // Stem reload support
    std::function<void()> stemReloadCallback;

    // Error reporting support
    std::function<void(const juce::String&)> errorCallback;

    // Notifies the UI (async, message thread) when set_project opens a project
    juce::ChangeBroadcaster remoteProjectOpenBroadcaster;
    WebDawConnectionIndicatorModel webDawConnectionIndicator;

    // Track and stem state management (thread-safe)
    std::shared_ptr<juce::Array<StemTrack>> stems;
    ProjectMixController projectMixController;
    mutable juce::CriticalSection projectPayloadLock;
    juce::String loadedProjectId;
    juce::Array<ProjectClip> loadedProjectClips;
    juce::Array<ProjectTrackInfo> loadedProjectTracks;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioPluginProcessor)
};

#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalErrorHandler.h"
#include "utils/JsonUtils.h"
#include "utils/MessageStore.h"

//==============================================================================
SterioPluginProcessor::SterioPluginProcessor()
    : AudioProcessor(BusesProperties()
#if !JucePlugin_IsMidiEffect
#if !JucePlugin_IsSynth
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
#endif
          .withOutput("Output", juce::AudioChannelSet::stereo(), true)
#endif
      )
{
    // Initialize global error handling
    GlobalErrorHandler::setupGlobalErrorHandling();

    authManager.loadTokens();

    stems = std::make_shared<juce::Array<StemTrack>>();

    // Set up provider function for playback engine to atomically access stems
    playbackEngine.setStemsProvider([this]() {
        return this->getLoadedStems(); // Thread-safe atomic read
    });
    playbackEngine.setMixStateProvider([this]() {
        return this->projectMixController.getState();
    });

#ifdef JUCE_DEBUG
    MessageStore::getInstance().setDebugMode(true);
#else
    MessageStore::getInstance().setDebugMode(false);
#endif


    connectionManager.onStatusChange([this](ConnectionManager::Status s, const std::string& reason)
    {
        // dispatch to message thread if you need to update UI
        juce::MessageManager::callAsync([this, s, reason]()
        {
            DBG("Status changed: " + reason);
            
            // If websocket server failed to start, report error to editor
            if (s == ConnectionManager::Status::Error)
            {
                MessageStore::getInstance().pushMessage(PluginMessage{
                    .severity = PluginMessage::Severity::Warning,
                    .content = "WebSocket server failed to start. The port may already be in use. Browser sync will be disabled.",
                    .sourceModule = "SterioPluginProcessor",
                    .timestamp = std::chrono::system_clock::now()
                });
            }
        });
    });

    connectionManager.onMessage([this](const std::string& msg)
    {
        // ⚠️ this arrives on IXWebSocket's thread — don't touch JUCE UI directly
        DBG("Received: " + juce::String(msg));
        handleIncomingMessage(msg);
    });

            // Set up cache manager
    auto appDataDir = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory);
    DBG("PluginEditor: Application data directory: " + appDataDir.getFullPathName());

    auto cacheDir = appDataDir.getChildFile("SterioPlugin").getChildFile("cache");
    DBG("PluginEditor: Cache directory will be: " + cacheDir.getFullPathName());

    cacheManager.setCacheDirectory(cacheDir);
}

SterioPluginProcessor::~SterioPluginProcessor()
{
}

//==============================================================================
const juce::String SterioPluginProcessor::getName() const
{
    return JucePlugin_Name;
}

bool SterioPluginProcessor::acceptsMidi() const
{
#if JucePlugin_WantsMidiInput
    return true;
#else
    return false;
#endif
}

bool SterioPluginProcessor::producesMidi() const
{
#if JucePlugin_ProducesMidiOutput
    return true;
#else
    return false;
#endif
}

bool SterioPluginProcessor::isMidiEffect() const
{
#if JucePlugin_IsMidiEffect
    return true;
#else
    return false;
#endif
}

double SterioPluginProcessor::getTailLengthSeconds() const
{
    return 0.0;
}

int SterioPluginProcessor::getNumPrograms()
{
    return 1;
}

int SterioPluginProcessor::getCurrentProgram()
{
    return 0;
}

void SterioPluginProcessor::setCurrentProgram(int index)
{
    juce::ignoreUnused(index);
}

const juce::String SterioPluginProcessor::getProgramName(int index)
{
    juce::ignoreUnused(index);
    return {};
}

void SterioPluginProcessor::changeProgramName(int index, const juce::String& newName)
{
    juce::ignoreUnused(index, newName);
}

//==============================================================================
void SterioPluginProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
{
    // setPlayConfigDetails (getTotalNumInputChannels(),   // usually 0 for master bus
    //     getTotalNumOutputChannels(),  // e.g., 2 for stereo
    //     sampleRate,
    //     samplesPerBlock);

    // Handle sample rate changes
    handleSampleRateChange(sampleRate);

    // Prepare playback engine
    playbackEngine.prepareToPlay(sampleRate, samplesPerBlock);

    // Setup WebSocket connection if not already connecting or connected
    auto status = connectionManager.getStatus();
    if (status == ConnectionManager::Status::Disconnected)
    {
        connectionManager.connect("ws://localhost:59327");
    }

    juce::ignoreUnused(samplesPerBlock);
}

void SterioPluginProcessor::releaseResources()
{
    // Safely disconnect WebSocket if connected
    auto status = connectionManager.getStatus();
    if (status == ConnectionManager::Status::Connected || 
        status == ConnectionManager::Status::Connecting ||
        status == ConnectionManager::Status::Error)
    {
        connectionManager.disconnect();
    }
}

bool SterioPluginProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
{
#if JucePlugin_IsMidiEffect
    juce::ignoreUnused(layouts);
    return true;
#else
    if (layouts.getMainOutputChannelSet() != juce::AudioChannelSet::mono()
        && layouts.getMainOutputChannelSet() != juce::AudioChannelSet::stereo())
        return false;

#if !JucePlugin_IsSynth
    if (layouts.getMainOutputChannelSet() != layouts.getMainInputChannelSet())
        return false;
#endif

    return true;
#endif
}

void SterioPluginProcessor::updateTransportFromHost()
{
    auto* playHead = getPlayHead();
    if (playHead == nullptr)
    {
        const juce::ScopedLock sl(transportLock);
        transportState.hasValidPosition = false;
        return;
    }

    auto pos = playHead->getPosition();
    if (!pos.hasValue())
    {
        const juce::ScopedLock sl(transportLock);
        transportState.hasValidPosition = false;
        return;
    }

    TransportState next;
    next.timeInSamples = pos->getTimeInSamples().orFallback(0);
    next.timeInSeconds = pos->getTimeInSeconds().orFallback(0.0);
    next.isPlaying = pos->getIsPlaying();
    next.bpm = pos->getBpm().orFallback(120.0);
    next.hasValidPosition = true;

    const juce::ScopedLock sl(transportLock);
    transportState = next;
}

TransportState SterioPluginProcessor::getTransportState() const
{
    const juce::ScopedLock sl(transportLock);
    return transportState;
}

void SterioPluginProcessor::handleSampleRateChange(double newSampleRate)
{
    // Check if sample rate actually changed
    if (std::abs(newSampleRate - currentHostSampleRate) < 0.1)
        return;

    // Check if sample rate is supported
    if (!SampleRateConverter::isSampleRateSupported(newSampleRate))
    {
        // Show warning to user (this will be handled by the editor)
        DBG("SterioPluginProcessor: Host sample rate " + juce::String(newSampleRate) +
            " Hz is not supported. Plugin will not convert stems.");
        // Still update the sample rate for tracking purposes
        previousHostSampleRate = currentHostSampleRate;
        currentHostSampleRate = newSampleRate;
        return;
    }

    // Update sample rate tracking
    previousHostSampleRate = currentHostSampleRate;
    currentHostSampleRate = newSampleRate;

    DBG("SterioPluginProcessor: Sample rate changed from " + juce::String(previousHostSampleRate) +
        " Hz to " + juce::String(currentHostSampleRate) + " Hz");

    // Notify playback engine of sample rate change (it will handle stem conversion)
    playbackEngine.handleSampleRateChange(newSampleRate);
}

void SterioPluginProcessor::setStems(const juce::Array<StemTrack>& newStems)
{
    // Store stems in processor state (atomic)
    setLoadedStems(newStems);
    
    // Set up the reload callback chain
    playbackEngine.setStemReloadCallback([this]() {
        this->requestStemReload();
    });
}

void SterioPluginProcessor::setCurrentTrack(const TrackInfo& track)
{
    pluginState.clearCurrentProject();
    pluginState.clearProjectLoadProgress();
    {
        const juce::ScopedLock lock(projectPayloadLock);
        loadedProjectId.clear();
        loadedProjectClips.clear();
    }
    pluginState.setCurrentTrack(track);
    loadStemsForTrack();
}

void SterioPluginProcessor::clearSelection()
{
    pluginState.clearCurrentTrack();
    pluginState.clearCurrentProject();
    pluginState.clearProjectLoadProgress();
    {
        const juce::ScopedLock lock(projectPayloadLock);
        loadedProjectId.clear();
        loadedProjectClips.clear();
        loadedProjectTracks.clear();
    }
    clearLoadedStems();
    projectMixController.clearActive();
}

juce::Optional<TrackInfo> SterioPluginProcessor::getCurrentTrack() const
{
    return pluginState.getCurrentTrack();
}

void SterioPluginProcessor::setLoadedStems(const juce::Array<StemTrack>& newStems)
{
    auto newPtr = std::make_shared<juce::Array<StemTrack>>(newStems);
    std::atomic_store(&stems, newPtr);
}

juce::Array<StemTrack> SterioPluginProcessor::getLoadedStems() const
{
    return *std::atomic_load(&stems);
}

void SterioPluginProcessor::clearLoadedStems()
{
    auto newPtr = std::make_shared<juce::Array<StemTrack>>();
    std::atomic_store(&stems, newPtr);
}

void SterioPluginProcessor::loadStemsForTrack()
{
    clearLoadedStems();
    auto track = getCurrentTrack();
    if(!track.hasValue()){
        DBG("No current track set. Cannot load stems.");
        return;
    }

    // Load stems asynchronously to avoid blocking UI
    juce::Thread::launch([this, track]() {
        try {
            // Load stems with sample rate conversion to match host sample rate
            double targetSampleRate = getCurrentSampleRate();
            auto stems = trackLoader.loadStemsForTrack((*track).id, targetSampleRate);
            setLoadedStems(stems);
        }
        catch (const std::exception& e) {
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to load stems for track.",
                .sourceModule = "SterioPluginProcessor",
                .timestamp = std::chrono::system_clock::now()
            });
            DBG("Failed to load stems for track " + (*track).id + ": " + e.what());
            clearLoadedStems();
        }
    });
}

void SterioPluginProcessor::requestStemReload()
{
    if (pluginState.getCurrentProject().hasValue())
    {
        juce::String projectId;
        juce::Array<ProjectClip> clips;
        {
            const juce::ScopedLock lock(projectPayloadLock);
            projectId = loadedProjectId;
            clips = loadedProjectClips;
        }

        if (projectId.isNotEmpty() && !clips.isEmpty())
        {
            loadProjectClips(projectId, clips);
            return;
        }
    }

    loadStemsForTrack();
}

void SterioPluginProcessor::loadProjectClips(const juce::String& projectId,
                                             const juce::Array<ProjectClip>& clips)
{
    clearLoadedStems();

    if (projectId.isEmpty() || clips.isEmpty())
    {
        DBG("No project clips to load.");
        if (projectId.isNotEmpty())
        {
            projectMixController.onProjectLoaded(projectId, getLoadedProjectTrackIds());
            sendProjectLoadComplete(projectId);
        }
        return;
    }

    pluginState.setProjectLoadProgress(0, 0);

    projectLoader.setLoadProgressCallback([this, projectId](int current, int total) {
        juce::MessageManager::callAsync([this, projectId, current, total]() {
            pluginState.setProjectLoadProgress(current, total);
            sendProjectLoadProgress(projectId, current, total);
        });
    });

    juce::Thread::launch([this, projectId, clips]() {
        try
        {
            double targetSampleRate = getCurrentSampleRate();
            auto stems = projectLoader.loadProjectClips(projectId, clips, targetSampleRate);
            setLoadedStems(stems);

            {
                const juce::ScopedLock lock(projectPayloadLock);
                loadedProjectId = projectId;
                loadedProjectClips = clips;
            }

            juce::MessageManager::callAsync([this, projectId]() {
                projectLoader.setLoadProgressCallback(nullptr);
                pluginState.clearProjectLoadProgress();
                projectMixController.onProjectLoaded(projectId, getLoadedProjectTrackIds());
                sendProjectLoadComplete(projectId);
            });
        }
        catch (const std::exception& e)
        {
            const juce::String errorMessage = e.what();
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to load project clips for playback.",
                .sourceModule = "SterioPluginProcessor",
                .timestamp = std::chrono::system_clock::now()
            });
            DBG("Failed to load project clips: " + errorMessage);

            juce::MessageManager::callAsync([this, projectId, errorMessage]() {
                projectLoader.setLoadProgressCallback(nullptr);
                pluginState.clearProjectLoadProgress();
                sendProjectLoadError(projectId, errorMessage);
            });

            clearLoadedStems();
        }
    });
}

void SterioPluginProcessor::syncProjectClips(const juce::String& projectId,
                                             const juce::Array<ProjectClip>& previousClips,
                                             const juce::Array<ProjectClip>& newClips)
{
    const auto existingStems = getLoadedStems();

    juce::Thread::launch([this, projectId, previousClips, newClips, existingStems]() {
        try
        {
            juce::Array<StemTrack> stems;
            if (!newClips.isEmpty())
            {
                const double targetSampleRate = getCurrentSampleRate();
                stems = projectLoader.syncProjectClips(
                    projectId, previousClips, newClips, existingStems, targetSampleRate);
            }

            setLoadedStems(stems);

            {
                const juce::ScopedLock lock(projectPayloadLock);
                loadedProjectId = projectId;
                loadedProjectClips = newClips;
            }

            juce::MessageManager::callAsync([this, projectId]() {
                projectMixController.pruneToTracks(getLoadedProjectTrackIds());
                sendProjectSyncComplete(projectId);
                // Re-broadcast current project so ProjectView refreshes the timeline
                auto project = pluginState.getCurrentProject();
                if (project.hasValue())
                    pluginState.setCurrentProject(*project);
            });
        }
        catch (const std::exception& e)
        {
            const juce::String errorMessage = e.what();
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to sync project clips.",
                .sourceModule = "SterioPluginProcessor",
                .timestamp = std::chrono::system_clock::now()
            });
            DBG("Failed to sync project clips: " + errorMessage);

            juce::MessageManager::callAsync([this, projectId, errorMessage]() {
                sendProjectSyncError(projectId, errorMessage);
            });
        }
    });
}

void SterioPluginProcessor::sendProjectLoadProgress(const juce::String& projectId,
                                                    int current,
                                                    int total)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "project_load_progress");
    obj->setProperty("project_id", projectId);
    obj->setProperty("current", current);
    obj->setProperty("total", total);
    connectionManager.send(juce::JSON::toString(juce::var(obj)).toStdString());
}

void SterioPluginProcessor::sendProjectLoadComplete(const juce::String& projectId)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "project_load_complete");
    obj->setProperty("project_id", projectId);
    connectionManager.send(juce::JSON::toString(juce::var(obj)).toStdString());
}

void SterioPluginProcessor::sendProjectLoadError(const juce::String& projectId,
                                                 const juce::String& error)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "project_load_error");
    obj->setProperty("project_id", projectId);
    obj->setProperty("error", error);
    connectionManager.send(juce::JSON::toString(juce::var(obj)).toStdString());
}

void SterioPluginProcessor::sendProjectSyncComplete(const juce::String& projectId)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "project_sync_complete");
    obj->setProperty("project_id", projectId);
    connectionManager.send(juce::JSON::toString(juce::var(obj)).toStdString());
}

void SterioPluginProcessor::sendProjectSyncError(const juce::String& projectId,
                                                 const juce::String& error)
{
    juce::DynamicObject::Ptr obj = new juce::DynamicObject();
    obj->setProperty("type", "project_sync_error");
    obj->setProperty("project_id", projectId);
    obj->setProperty("error", error);
    connectionManager.send(juce::JSON::toString(juce::var(obj)).toStdString());
}

void SterioPluginProcessor::handleSetTrackMessage(juce::DynamicObject* obj)
{
    if (!obj->hasProperty("track_id"))
    {
        DBG("set_track message missing track_id");
        return;
    }

    auto trackData = JsonUtils::parseTrackInfo(obj->getProperty("payload"));
    setCurrentTrack(trackData);
}

void SterioPluginProcessor::handleStemMetadataSyncMessage(juce::DynamicObject* obj)
{
    if (!obj->hasProperty("track_id"))
    {
        DBG("stem_metadata_sync message missing track_id");
        return;
    }

    int trackId = static_cast<int>(obj->getProperty("track_id"));

    auto currentTrackObj = getCurrentTrack();
    if (!currentTrackObj.hasValue())
    {
        DBG("No current track set. Cannot process stem metadata sync.");
        return;
    }

    int currentTrackId = (*currentTrackObj).id.getIntValue();
    if (trackId != currentTrackId)
    {
        DBG("Received stem metadata sync for track " + juce::String(trackId)
            + " but current track is " + juce::String(currentTrackId));
        return;
    }

    auto oldStems = getLoadedStems();
    auto stemsFromPayload = JsonUtils::parseStemData(obj->getProperty("payload"));

    for (auto& stem : stemsFromPayload)
    {
        int index = oldStems.indexOf(stem);
        if (index >= 0)
            stem.audioBuffer = oldStems[index].audioBuffer;
        else
            throw std::runtime_error("Stem not found in old stems. Stem sync failed.");
    }

    setLoadedStems(stemsFromPayload);
    DBG("Loaded stems from metadata sync");
}

void SterioPluginProcessor::handleSetProjectMessage(juce::DynamicObject* obj)
{
    juce::String projectId = obj->getProperty("project_id").toString();
    if (projectId.isEmpty())
    {
        DBG("set_project message missing project_id");
        return;
    }

    pluginState.clearCurrentTrack();

    juce::var payloadVar = obj->getProperty("payload");
    ProjectPluginPayload payload;

    if (payloadVar.isObject() && payloadVar.getProperty("clips", juce::var()).isArray())
    {
        payload = JsonUtils::parseProjectPluginPayload(payloadVar);
    }
    else
    {
        auto fetchResult = projectLoader.fetchPluginPayload(projectId);
        if (fetchResult.failed())
        {
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to fetch project for plugin playback.",
                .sourceModule = "SterioPluginProcessor",
                .timestamp = std::chrono::system_clock::now()
            });
            DBG("Failed to fetch project plugin payload: " + fetchResult.getErrorMessage());
            sendProjectLoadError(projectId, fetchResult.getErrorMessage());
            return;
        }
        payload = *fetchResult;
    }

    ProjectInfo projectInfo;
    projectInfo.guid = projectId;
    const juce::String messageName = obj->hasProperty("name")
        ? obj->getProperty("name").toString()
        : juce::String();
    if (payload.name.isNotEmpty())
        projectInfo.name = payload.name;
    else if (messageName.isNotEmpty())
        projectInfo.name = messageName;
    else
        projectInfo.name = "Untitled Project";
    projectInfo.bpm = payload.bpm;
    projectInfo.timeSignature = payload.timeSignature;
    projectInfo.durationSeconds = payload.durationSeconds;
    pluginState.setCurrentProject(projectInfo);

    {
        juce::String previousId;
        {
            const juce::ScopedLock lock(projectPayloadLock);
            previousId = loadedProjectId;
            loadedProjectId = projectId;
            loadedProjectClips = payload.clips;
            loadedProjectTracks = payload.tracks;
        }

        projectMixController.resetIfProjectChanged(previousId, projectId);
    }

    loadProjectClips(projectId, payload.clips);

    // Safe from the WebSocket thread; delivered async on the message thread so
    // the editor (if open) can navigate to the project view.
    remoteProjectOpenBroadcaster.sendChangeMessage();
}

void SterioPluginProcessor::selectProject(const ProjectSummary& project)
{
    if (project.guid.isEmpty())
    {
        DBG("selectProject called with empty project guid");
        return;
    }

    pluginState.clearCurrentTrack();

    ProjectInfo pendingInfo;
    pendingInfo.guid = project.guid;
    pendingInfo.name = project.name.isNotEmpty() ? project.name : "Untitled Project";
    pendingInfo.bpm = project.bpm;
    pendingInfo.timeSignature = project.timeSignature;
    pendingInfo.durationSeconds = project.durationSeconds;
    pluginState.setCurrentProject(pendingInfo);
    pluginState.setProjectLoadProgress(0, 0);

    juce::Thread::launch([this, project]() {
        auto fetchResult = projectLoader.fetchPluginPayload(project.guid);
        if (fetchResult.failed())
        {
            const juce::String errorMessage = fetchResult.getErrorMessage();
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to fetch project for plugin playback.",
                .sourceModule = "SterioPluginProcessor",
                .timestamp = std::chrono::system_clock::now()
            });
            DBG("Failed to fetch project plugin payload: " + errorMessage);

            juce::MessageManager::callAsync([this, project, errorMessage]() {
                pluginState.clearProjectLoadProgress();
                sendProjectLoadError(project.guid, errorMessage);
            });
            return;
        }

        const auto payload = *fetchResult;

        juce::MessageManager::callAsync([this, project, payload]() {
            ProjectInfo projectInfo;
            projectInfo.guid = project.guid;
            projectInfo.name = payload.name.isNotEmpty() ? payload.name : project.name;
            if (projectInfo.name.isEmpty())
                projectInfo.name = "Untitled Project";
            projectInfo.bpm = payload.bpm;
            projectInfo.timeSignature = payload.timeSignature;
            projectInfo.durationSeconds = payload.durationSeconds;
            pluginState.setCurrentProject(projectInfo);

            {
                juce::String previousId;
                {
                    const juce::ScopedLock lock(projectPayloadLock);
                    previousId = loadedProjectId;
                    loadedProjectId = project.guid;
                    loadedProjectClips = payload.clips;
                    loadedProjectTracks = payload.tracks;
                }

                projectMixController.resetIfProjectChanged(previousId, project.guid);
            }

            loadProjectClips(project.guid, payload.clips);
        });
    });
}

juce::Array<ProjectTrackInfo> SterioPluginProcessor::getLoadedProjectTracks() const
{
    const juce::ScopedLock lock(projectPayloadLock);
    return loadedProjectTracks;
}

juce::Array<ProjectClip> SterioPluginProcessor::getLoadedProjectClips() const
{
    const juce::ScopedLock lock(projectPayloadLock);
    return loadedProjectClips;
}

void SterioPluginProcessor::handleProjectSyncMessage(juce::DynamicObject* obj)
{
    juce::String projectId = obj->getProperty("project_id").toString();
    if (projectId.isEmpty())
    {
        DBG("project_sync message missing project_id");
        return;
    }

    juce::String loadedId;
    juce::Array<ProjectClip> previousClips;
    {
        const juce::ScopedLock lock(projectPayloadLock);
        loadedId = loadedProjectId;
        previousClips = loadedProjectClips;
    }

    if (loadedId.isEmpty() || loadedId != projectId)
    {
        const juce::String error = "No matching project loaded in plugin. Open the project in the plugin first.";
        DBG("project_sync rejected: loaded project is " + loadedId + ", requested " + projectId);
        sendProjectSyncError(projectId, error);
        return;
    }

    juce::var payloadVar = obj->getProperty("payload");
    if (!payloadVar.isObject())
    {
        DBG("project_sync message missing payload object");
        sendProjectSyncError(projectId, "Invalid project sync payload.");
        return;
    }

    const auto newClips = JsonUtils::parseProjectClips(payloadVar.getProperty("clips", juce::var()));
    const auto newTracks = JsonUtils::parseProjectTracks(payloadVar.getProperty("tracks", juce::var()));

    if (!newTracks.isEmpty())
    {
        const juce::ScopedLock lock(projectPayloadLock);
        loadedProjectTracks = newTracks;
    }

    syncProjectClips(projectId, previousClips, newClips);
}

void SterioPluginProcessor::handleIncomingMessage(const std::string& json)
{
    try
    {
        auto parsed = juce::JSON::parse(juce::String(json));
        if (!parsed || !parsed.isObject())
        {
            DBG("Failed to parse JSON message: not an object");
            return;
        }

        auto* obj = parsed.getDynamicObject();
        if (obj == nullptr)
            return;

        juce::String type = obj->getProperty("type");
        DBG("Received message of type " + type);

        if (type == "set_project")
        {
            handleSetProjectMessage(obj);
            return;
        }

        if (type == "project_sync")
        {
            handleProjectSyncMessage(obj);
            return;
        }

        if (type == "set_track")
        {
            handleSetTrackMessage(obj);
            return;
        }

        if (type == "stem_metadata_sync")
        {
            handleStemMetadataSyncMessage(obj);
            return;
        }

        DBG("Unhandled message type: " + type);
        return;
    }
    catch (const std::exception& e)
    {
        DBG("Failed to parse JSON message: " + juce::String(e.what()));
    }
    catch (...)
    {
        DBG("Failed to parse JSON message: unknown exception");
    }
    MessageStore::getInstance().pushMessage(PluginMessage{
        .severity = PluginMessage::Severity::Error,
        .content = "Unexpected error while handling incoming message.",
        .sourceModule = "SterioPluginProcessor",
        .timestamp = std::chrono::system_clock::now()
    });
}

void SterioPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ignoreUnused(midiMessages);

    updateTransportFromHost();

    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    // Clear all output channels since this is now an instrument
    for (auto i = 0; i < totalNumOutputChannels; ++i)
        buffer.clear(i, 0, buffer.getNumSamples());

    // Stem playback (Increment 5) - Using StemPlaybackEngine
    const auto transport = getTransportState();
    playbackEngine.processBlock(buffer, transport);
}

//==============================================================================
bool SterioPluginProcessor::hasEditor() const
{
    return true;
}

juce::AudioProcessorEditor* SterioPluginProcessor::createEditor()
{
    return new SterioPluginEditor(*this);
}

//==============================================================================
juce::Array<int> SterioPluginProcessor::getLoadedProjectTrackIds() const
{
    juce::Array<int> ids;
    const juce::ScopedLock lock(projectPayloadLock);
    for (const auto& track : loadedProjectTracks)
        ids.add(track.trackId);
    return ids;
}

std::shared_ptr<const ProjectMixState> SterioPluginProcessor::getProjectMixState() const
{
    return projectMixController.getState();
}

void SterioPluginProcessor::toggleProjectTrackMute(int projectTrackId)
{
    projectMixController.toggleMute(projectTrackId);
}

void SterioPluginProcessor::toggleProjectTrackSolo(int projectTrackId)
{
    projectMixController.toggleSolo(projectTrackId);
}

void SterioPluginProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::String projectId;
    {
        const juce::ScopedLock lock(projectPayloadLock);
        projectId = loadedProjectId;
    }
    projectMixController.writeToMemoryBlock(destData, projectId);
}

void SterioPluginProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::String projectId;
    juce::Array<int> trackIds;
    {
        const juce::ScopedLock lock(projectPayloadLock);
        projectId = loadedProjectId;
        for (const auto& track : loadedProjectTracks)
            trackIds.add(track.trackId);
    }
    projectMixController.readFromMemory(data, sizeInBytes, projectId, trackIds);
}


//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SterioPluginProcessor();
}

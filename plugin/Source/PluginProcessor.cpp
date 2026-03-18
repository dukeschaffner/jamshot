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
        connectionManager.connect("ws://localhost:8080");
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
    pluginState.setCurrentTrack(track);
    loadStemsForTrack();
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
    loadStemsForTrack();
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
        auto obj = parsed.getDynamicObject();

        DBG("Pasrsed message: ");

        // Example: region update
        if (obj->hasProperty("track_id"))
        {
            int trackId = static_cast<int>(obj->getProperty("track_id"));

            juce::String type = obj->getProperty("type");
            DBG("Received message of type " + type);
            if(type == "set_track"){
                auto trackData = JsonUtils::parseTrackInfo(obj->getProperty("payload"));
                setCurrentTrack(trackData);
                return;
            }

            auto currentTrackObj = getCurrentTrack();
            if(!currentTrackObj.hasValue()){
                DBG("No current track set. Cannot process stem metadata sync.");
                return;
            }

            int currentTrackId = (*currentTrackObj).id.getIntValue();
            if(trackId != currentTrackId){
                DBG("Received region update for track " + juce::String(trackId) + " but current track is " + juce::String(currentTrackId));
                return;
            }

            auto oldStems = getLoadedStems();
            if(type == "stem_metadata_sync"){
                auto stemsFromPayload = JsonUtils::parseStemData(obj->getProperty("payload"));

                for (auto& stem : stemsFromPayload)
                {
                    int index = oldStems.indexOf(stem); // Only works if StemTrack has operator==
                    if (index >= 0)
                    {
                        stem.audioBuffer = oldStems[index].audioBuffer;
                    }
                    else{
                        throw std::runtime_error("Stem not found in old stems. Stem sync failed.");
                    }
                }

                // Now replace loaded stems
                setLoadedStems(stemsFromPayload);
                DBG("Loaded stems");
            }
        }
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
void SterioPluginProcessor::getStateInformation(juce::MemoryBlock& destData)
{
    juce::ignoreUnused(destData);
}

void SterioPluginProcessor::setStateInformation(const void* data, int sizeInBytes)
{
    juce::ignoreUnused(data, sizeInBytes);
}


//==============================================================================
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SterioPluginProcessor();
}

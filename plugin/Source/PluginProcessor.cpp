#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalErrorHandler.h"

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
    // Handle sample rate changes
    handleSampleRateChange(sampleRate);

    // Prepare playback engine
    playbackEngine.prepareToPlay(sampleRate, samplesPerBlock);

    juce::ignoreUnused(samplesPerBlock);
}

void SterioPluginProcessor::releaseResources()
{
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

void SterioPluginProcessor::setStems(const juce::Array<StemTrack>& stems)
{
    playbackEngine.setStems(stems);
    
    // Set up the reload callback chain
    playbackEngine.setStemReloadCallback([this]() {
        this->requestStemReload();
    });
}

void SterioPluginProcessor::requestStemReload()
{
    if (stemReloadCallback && !currentTrackId.isEmpty())
    {
        stemReloadCallback();
    }
}

void SterioPluginProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    juce::ignoreUnused(midiMessages);

    updateTransportFromHost();

    juce::ScopedNoDenormals noDenormals;
    auto totalNumInputChannels = getTotalNumInputChannels();
    auto totalNumOutputChannels = getTotalNumOutputChannels();

    for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
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
    return new SterioPluginEditor(*this, authManager);
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

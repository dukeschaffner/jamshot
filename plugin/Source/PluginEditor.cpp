#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalErrorHandler.h"
#include "Colors.h"
#include "ui/ErrorDisplay.h"

using namespace juce;

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p, AuthManager& authManager)
    : AudioProcessorEditor(&p)
    , processorRef(p)
    , authManagerRef(authManager)
    , apiClient(authManager)
    , loginView(authManager, apiClient)
    , trackListPanel(apiClient)
{
    setSize(500, 400);

    addAndMakeVisible(loginView);
    addAndMakeVisible(trackListPanel);
    addAndMakeVisible(errorDisplay);

    // Set up track selection callback
    trackListPanel.setTrackSelectedCallback([this](const TrackInfo& track) {
        onTrackSelected(track);
    });

    // Set up cache manager
    auto appDataDir = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory);
    DBG("PluginEditor: Application data directory: " + appDataDir.getFullPathName());

    auto cacheDir = appDataDir.getChildFile("SterioPlugin").getChildFile("cache");
    DBG("PluginEditor: Cache directory will be: " + cacheDir.getFullPathName());

    cacheManager.setCacheDirectory(cacheDir);

    // Set up track loader
    trackLoader.setApiClient(&apiClient);
    trackLoader.setCacheManager(&cacheManager);

    // Set initial API token if available
    if (authManagerRef.isLoggedIn())
        apiClient.setAccessToken(authManagerRef.getAccessToken());

    // Set up error callback for websocket server failures
    processorRef.setErrorCallback([this](const juce::String& errorMsg) {
        errorDisplay.setError(errorMsg);
    });

    // Apply custom look and feel
    setLookAndFeel(&lookAndFeel);

    startTimerHz(30);
}

SterioPluginEditor::~SterioPluginEditor()
{
    stopTimer();
    setLookAndFeel(nullptr);
}

void SterioPluginEditor::timerCallback()
{
    // Update API token when login state changes
    if (authManagerRef.isLoggedIn())
    {
        apiClient.setAccessToken(authManagerRef.getAccessToken());

        // Load tracks if we have a username but no tracks loaded yet
        auto username = loginView.getUsername();
        if (!username.isEmpty() && trackListPanel.getSelectedTrack() == nullptr)
        {
            trackListPanel.setUsername(username);
        }
    }
    else
    {
        // Clear tracks when logged out
        trackListPanel.clearTracks();
    }

    // Update sample rate warning
    updateSampleRateWarning();

    repaint();
}

void SterioPluginEditor::paint(Graphics& g)
{
    // Set white background
    g.fillAll(Colors::WHITE);

    auto r = getLocalBounds();

    // Create gradient text for the title using seafoam and rustic pink
    auto titleRect = r.removeFromTop(40);
    
    // Draw title with seafoam color
    g.setColour(Colors::SEAFOAM);
    g.setFont(20.0f);
    g.drawText("Sterio Plugin", titleRect, Justification::centred, true);

    // Show high sample rate warning if needed
    if (showHighSampleRateWarning)
    {
        r.removeFromTop(10);
        auto warningRect = r.removeFromTop(30);

        // Use rustic pink for warning to maintain brand consistency
        g.setColour(Colors::RUSTIC_PINK);
        g.setFont(14.0f);
        g.drawText("Warning: Host sample rate > 100kHz not supported. Stems will not be converted.",
                  warningRect, Justification::centred, true);
    }
}

void SterioPluginEditor::resized()
{
    auto r = getLocalBounds().reduced(10);

    // Login view at top
    auto loginRow = r.removeFromTop(50);
    loginView.setBounds(loginRow);

    // Error display directly below login (hidden when no error).
    // Only reserve space when it's visible so lower components move up.
    r.removeFromTop(10);
    if (errorDisplay.isVisible())
    {
        auto errorRow = r.removeFromTop(40);
        errorDisplay.setBounds(errorRow);
    }
    else
    {
        errorDisplay.setBounds(0, 0, 0, 0);
    }

    // Track list panel takes remaining space
    r.removeFromTop(10);
    trackListPanel.setBounds(r);
}

void SterioPluginEditor::onStemsLoaded(const juce::Array<StemTrack>& stems)
{
    // Store stems in processor (which also passes to playback engine)
    processorRef.setStems(stems);

    // Set up reload callback for sample rate changes
    processorRef.setStemReloadCallback([this]() {
        auto currentTrack = processorRef.getCurrentTrack();
        if (currentTrack.hasValue())
        {
            onTrackSelected(*currentTrack);
        }
    });

    for (int i = 0; i < stems.size(); ++i)
    {
        const auto& stem = stems[i];
        juce::String bufferInfo = "null";
        if (stem.audioBuffer)
        {
            bufferInfo = juce::String(stem.audioBuffer->getNumSamples()) + " samples, " +
                        juce::String(stem.audioBuffer->getNumChannels()) + " channels";
        }
        DBG("PluginEditor::onStemsLoaded() - Stem " + juce::String(i) +
            ": trackId=" + juce::String(stem.trackId) +
            ", gain=" + juce::String(stem.gain) +
            ", order=" + juce::String(stem.order) +
            ", audioBuffer=" + bufferInfo +
            ", regions=" + juce::String(stem.regions.size()));
    }
}

void SterioPluginEditor::onStemsLoadError(const TrackInfo& track, const juce::String& errorMessage)
{
    DBG("PluginEditor::onStemsLoadError() - Failed to load stems for track '" +
        track.title + "': " + errorMessage);

    // Clear any partial state in processor
    processorRef.clearLoadedStems();

    // Use global error handler for consistent error reporting
    GlobalErrorHandler::handleError("TrackLoader",
        "Failed to load stems for '" + track.title + "': " + errorMessage);

    // Show UI error to the user below the login component
    errorDisplay.setError("Failed to load stems for '" + track.title + "': " + errorMessage);
}

void SterioPluginEditor::onTrackSelected(const TrackInfo& track)
{
    // Store current track in processor (for reload purposes)
    processorRef.setCurrentTrack(track);

    // Clear any previously loaded stems in processor
    processorRef.clearLoadedStems();

    // Load stems asynchronously to avoid blocking UI

    juce::Thread::launch([this, track]() {
        try {
            // Load stems with sample rate conversion to match host sample rate
            double targetSampleRate = processorRef.getCurrentSampleRate();
            auto stems = trackLoader.loadStemsForTrack(track.id, targetSampleRate);

            // Update UI on main thread
            juce::MessageManager::callAsync([this, stems]() {
                onStemsLoaded(stems);
            });
        }
        catch (const std::exception& e) {
            // Handle errors on main thread
            juce::MessageManager::callAsync([this, track, errorMsg = juce::String(e.what())]() {
                onStemsLoadError(track, errorMsg);
            });
        }
    });
}

void SterioPluginEditor::updateSampleRateWarning()
{
    double currentSampleRate = processorRef.getCurrentSampleRate();
    showHighSampleRateWarning = (currentSampleRate > 100000.0);
}

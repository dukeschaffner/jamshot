#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalErrorHandler.h"

using namespace juce;

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p, AuthManager& authManager)
    : AudioProcessorEditor(&p)
    , processorRef(p)
    , authManagerRef(authManager)
    , loginView(authManager, apiClient)
    , trackListPanel(apiClient)
{
    setSize(500, 400);

    addAndMakeVisible(loginView);
    addAndMakeVisible(trackListPanel);

    // Set up track selection callback
    trackListPanel.setTrackSelectedCallback([this](const TrackInfo& track) {
        onTrackSelected(track);
    });

    // Set up track loader
    trackLoader.setApiClient(&apiClient);

    // Set initial API token if available
    if (authManagerRef.isLoggedIn())
        apiClient.setAccessToken(authManagerRef.getAccessToken());

    startTimerHz(30);
}

SterioPluginEditor::~SterioPluginEditor()
{
    stopTimer();
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

    repaint();
}

void SterioPluginEditor::paint(Graphics& g)
{
    g.fillAll(getLookAndFeel().findColour(ResizableWindow::backgroundColourId));

    g.setColour(Colours::white);
    g.setFont(20.0f);
    g.drawText("Sterio Plugin", getLocalBounds().removeFromTop(40), Justification::centred, true);
}

void SterioPluginEditor::resized()
{
    auto r = getLocalBounds().reduced(10);

    // Login view at top
    auto loginRow = r.removeFromTop(50);
    loginView.setBounds(loginRow);

    // Track list panel takes remaining space
    r.removeFromTop(10);
    trackListPanel.setBounds(r);
}

void SterioPluginEditor::onStemsLoaded(const juce::Array<StemTrack>& stems)
{
    loadedStems = stems;

    // Pass stems to processor for playback (Increment 5)
    processorRef.setStems(stems);

    for (int i = 0; i < stems.size(); ++i)
    {
        const auto& stem = stems[i];
        DBG("PluginEditor::onStemsLoaded() - Stem " + juce::String(i) +
            ": trackId=" + juce::String(stem.trackId) +
            ", gain=" + juce::String(stem.gain) +
            ", order=" + juce::String(stem.order) +
            ", audioBuffer=" + juce::String(stem.audioBuffer.getNumSamples()) + " samples, " +
            juce::String(stem.audioBuffer.getNumChannels()) + " channels" +
            ", regions=" + juce::String(stem.regions.size()));
    }
}

void SterioPluginEditor::onStemsLoadError(const TrackInfo& track, const juce::String& errorMessage)
{
    DBG("PluginEditor::onStemsLoadError() - Failed to load stems for track '" +
        track.title + "': " + errorMessage);

    // Clear any partial state
    loadedStems.clear();

    // Use global error handler for consistent error reporting
    GlobalErrorHandler::handleError("TrackLoader",
        "Failed to load stems for '" + track.title + "': " + errorMessage);
}

void SterioPluginEditor::onTrackSelected(const TrackInfo& track)
{

    // Clear any previously loaded stems
    loadedStems.clear();

    // Load stems asynchronously to avoid blocking UI

    juce::Thread::launch([this, track]() {
        try {
            auto stems = trackLoader.loadStemsForTrack(track.id);

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

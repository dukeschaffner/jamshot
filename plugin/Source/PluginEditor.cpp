#include "PluginProcessor.h"
#include "PluginEditor.h"

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

void SterioPluginEditor::onTrackSelected(const TrackInfo& track)
{
    // TODO: In Increment 4, this will trigger stem loading
    DBG("Track selected: " + track.title + " by " + track.username);
}

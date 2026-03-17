#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "Config.h"
#include "GlobalErrorHandler.h"
#include "Colors.h"
#include "utils/PluginMetaHelper.h"

using namespace juce;

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p)
    : AudioProcessorEditor(&p)
    , processorRef(p)
    , services(p.getServices())
    , loginView(services)
    , mainContentComponent(services)
    , footer(services)
{
    setSize(500, 400);
    setResizable (true, true);      // allow resizing
    setResizeLimits (400, 300, 1200, 900); // min and max sizes

    addAndMakeVisible(loginView);
    addAndMakeVisible(mainContentComponent);
    addAndMakeVisible(helpView);
    helpView.setVisible(false);
    addAndMakeVisible(messageDisplay);
    addAndMakeVisible(footer);

    #ifdef JUCE_DEBUG
        addAndMakeVisible(debugComponent);
    #endif

    // Set up track selection callback
    mainContentComponent.trackListPanel.setTrackSelectedCallback([this](const TrackInfo& track) {
        onTrackSelected(track);
    });

    addAndMakeVisible(logoComponent);

    // Set up help button
    addAndMakeVisible(helpButton);
    helpButton.setButtonText("Help");
    helpButton.onClick = [this] { toggleHelp(); };

    // Set up update button (shown only when an update is available)
    addAndMakeVisible(updateButton);
    updateButton.setButtonText("Update Available");
    updateButton.setVisible(false);
    updateButton.onClick = [this] {
        juce::URL url(Config::UI::getBaseUrl() + "/plugin");
        url.launchInDefaultBrowser();
    };

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
    if (services.auth.isLoggedIn())
    {
        // Load tracks if we have a username but no tracks loaded yet
        auto username = loginView.getUsername();
        if (!username.isEmpty() && mainContentComponent.trackListPanel.getSelectedTrack() == nullptr)
        {
            mainContentComponent.trackListPanel.setUsername(username);
        }
    }
    else
    {
        mainContentComponent.trackListPanel.setUsername("");
        // Clear tracks when logged out
        mainContentComponent.trackListPanel.clearTracks();
    }

    // Show update button when new plugin version is available
    if (!showingUpdateButton && PluginMetaHelper::getInstance().IsUpdateAvailable())
    {
        showingUpdateButton = true;
        updateButton.setVisible(true);
        resized();
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
    auto bounds = getLocalBounds().toFloat().reduced(10);

    #ifdef JUCE_DEBUG
    debugComponent.setBounds(bounds.withPosition(0, 0)
                                          .withWidth(20)
                                          .withHeight(20)
                                          .toNearestInt());
    #endif

    // Position help button at top left
    helpButton.setBounds(bounds.withPosition(10, 10)
                                  .withWidth(50)
                                  .withHeight(20)
                                  .toNearestInt());

    // Position update button at top right (mirror spacing from help button)
    updateButton.setVisible(showingUpdateButton);
    if (showingUpdateButton)
    {
        const int updateButtonWidth = 110;
        updateButton.setBounds(bounds.withPosition(bounds.getRight() - 10 - updateButtonWidth, 10)
                                         .withWidth(updateButtonWidth)
                                         .withHeight(20)
                                         .toNearestInt());
    }

    juce::FlexBox main;
    main.flexDirection = juce::FlexBox::Direction::column;

    main.items.add(
        juce::FlexItem(logoComponent)
            .withHeight(50.0f)
    );

    // Login row
    main.items.add(
        juce::FlexItem(loginView)
            .withHeight(50.0f)
    );

    // Spacer
    main.items.add(
        juce::FlexItem()
            .withHeight(10.0f)
    );

    // Error display (only if visible)
    if (messageDisplay.isVisible())
    {
        main.items.add(
            juce::FlexItem(messageDisplay)
                .withHeight(40.0f)
        );

        main.items.add(
            juce::FlexItem().withHeight(10.0f)
        );
    }
    else
    {
        messageDisplay.setBounds(0,0,0,0);
    }

    // Track list or help view fills remaining space
    if (showingHelp)
    {
        main.items.add(
            juce::FlexItem(helpView)
                .withFlex(1.0f)
        );
    }
    else
    {
        main.items.add(
            juce::FlexItem(mainContentComponent)
                .withFlex(1.0f)
        );
    }

    main.items.add(
        juce::FlexItem(footer)
            .withHeight(50.0f)
    );

    main.performLayout(bounds);
}

void SterioPluginEditor::onTrackSelected(const TrackInfo& track)
{
    // Store current track in processor (for reload purposes)
    processorRef.setCurrentTrack(track);
}

void SterioPluginEditor::updateSampleRateWarning()
{
    double currentSampleRate = processorRef.getCurrentSampleRate();
    showHighSampleRateWarning = (currentSampleRate > 100000.0);
}

void SterioPluginEditor::toggleHelp()
{
    showingHelp = !showingHelp;
    if (showingHelp)
    {
        helpButton.setButtonText("Back");
        mainContentComponent.setVisible(false);
        helpView.setVisible(true);
    }
    else
    {
        helpButton.setButtonText("Help");
        mainContentComponent.setVisible(true);
        helpView.setVisible(false);
    }
    resized();
}

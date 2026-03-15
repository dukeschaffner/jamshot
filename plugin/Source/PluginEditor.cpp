#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "GlobalErrorHandler.h"
#include "Colors.h"


using namespace juce;

//==============================================================================
SterioPluginEditor::SterioPluginEditor(SterioPluginProcessor& p)
    : AudioProcessorEditor(&p)
    , processorRef(p)
    , services(p.getServices())
    , loginView(services)
    , mainContentComponent(services)
{
    setSize(500, 400);
    setResizable (true, true);      // allow resizing
    setResizeLimits (400, 300, 1200, 900); // min and max sizes

    addAndMakeVisible(loginView);
    addAndMakeVisible(mainContentComponent);
    addAndMakeVisible(messageDisplay);

    // Set up track selection callback
    mainContentComponent.trackListPanel.setTrackSelectedCallback([this](const TrackInfo& track) {
        onTrackSelected(track);
    });

    addAndMakeVisible(logoComponent);

    #ifdef JUCE_DEBUG
        debugComponentVisible = false;
        addChildComponent(debugComponent); // Add to tree but keep hidden initially
        
        debugToggleButton.setButtonText("Show Debug");
        debugToggleButton.onClick = [this] {
            debugComponentVisible = !debugComponentVisible;
            if (debugComponentVisible)
            {
                addAndMakeVisible(debugComponent);
            }
            else
            {
                debugComponent.setVisible(false);
            }
            debugToggleButton.setButtonText(debugComponentVisible ? "Hide Debug" : "Show Debug");
            resized(); // Trigger layout update
        };
        addAndMakeVisible(debugToggleButton);
    #endif

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

#ifdef JUCE_DEBUG

    // Debug area container
    juce::FlexBox debugColumn;
    debugColumn.flexDirection = juce::FlexBox::Direction::column;

    if (debugComponentVisible)
    {
        debugColumn.items.add(
            juce::FlexItem(debugComponent)
                .withHeight(150.0f)
                .withMargin(5.0f)
        );
    }
    else
    {
        debugComponent.setBounds(0,0,0,0);
    }

    // Debug button row (right aligned)
    juce::FlexBox debugRow;
    debugRow.flexDirection = juce::FlexBox::Direction::row;
    debugRow.justifyContent = juce::FlexBox::JustifyContent::flexEnd;

    debugRow.items.add(
        juce::FlexItem(debugToggleButton)
            .withWidth(120.0f)
            .withHeight(30.0f)
            .withMargin(5.0f)
    );

    debugColumn.items.add(
        juce::FlexItem(debugRow)
            .withHeight(30.0f)
    );

#endif

    // Track list fills remaining space
    main.items.add(
        juce::FlexItem(mainContentComponent)
            .withFlex(1.0f)
    );

#ifdef JUCE_DEBUG
    // Debug area at bottom
    main.items.add(
        juce::FlexItem(debugColumn)
            .withHeight(debugComponentVisible ? 180.0f : 30.0f)
    );
#endif

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

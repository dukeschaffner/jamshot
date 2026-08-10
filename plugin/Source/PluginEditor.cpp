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
    , appHeader(p.getWebDawConnectionIndicator())
    , loginView(services)
    , mainContentComponent(services, p)
    , footer(services)
{
    setLookAndFeel(&lookAndFeel);

    setSize(UiMetrics::pluginDefaultW, UiMetrics::pluginDefaultH);
    setResizable(true, true);
    setResizeLimits(UiMetrics::pluginMinW, UiMetrics::pluginMinH,
                    UiMetrics::pluginMaxW, UiMetrics::pluginMaxH);

    addAndMakeVisible(appHeader);
    addAndMakeVisible(loginView);
    addChildComponent(sampleRateWarning);
    addChildComponent(messageDisplay);
    addAndMakeVisible(mainContentComponent);
    addAndMakeVisible(helpView);
    helpView.setVisible(false);
    addAndMakeVisible(footer);

    mainContentComponent.trackListPanel.setTrackSelectedCallback([this](const TrackInfo& track) {
        onTrackSelected(track);
    });

    appHeader.getHelpButton().onClick = [this] { toggleHelp(); };
    appHeader.getUpdateButton().onClick = [this] {
        juce::URL url(Config::UI::getBaseUrl() + "/plugin");
        url.launchInDefaultBrowser();
    };

   #ifdef JUCE_DEBUG
    appHeader.getDebugButton().onClick = [this] { showDebugConsole(); };
   #endif

    startTimerHz(30);
}

SterioPluginEditor::~SterioPluginEditor()
{
    stopTimer();
    setLookAndFeel(nullptr);
}

void SterioPluginEditor::timerCallback()
{
    if (services.auth.isLoggedIn())
    {
        auto username = loginView.getUsername();
        if (!username.isEmpty() && mainContentComponent.trackListPanel.getSelectedTrack() == nullptr)
            mainContentComponent.trackListPanel.setUsername(username);
    }
    else
    {
        mainContentComponent.trackListPanel.setUsername("");
        mainContentComponent.trackListPanel.clearTracks();
    }

    if (!showingUpdateButton && PluginMetaHelper::getInstance().IsUpdateAvailable())
    {
        showingUpdateButton = true;
        appHeader.setUpdateVisible(true);
        resized();
    }

    updateSampleRateWarning();
}

void SterioPluginEditor::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
}

void SterioPluginEditor::resized()
{
    auto bounds = getLocalBounds();

    appHeader.setBounds(bounds.removeFromTop(UiMetrics::appHeaderH));
    loginView.setBounds(bounds.removeFromTop(UiMetrics::authStripH));

    if (showHighSampleRateWarning)
    {
        sampleRateWarning.setVisible(true);
        sampleRateWarning.setBounds(bounds.removeFromTop(sampleRateWarning.getPreferredHeight()));
    }
    else
    {
        sampleRateWarning.setVisible(false);
        sampleRateWarning.setBounds({});
    }

    if (messageDisplay.isVisible())
        messageDisplay.setBounds(bounds.removeFromTop(40));
    else
        messageDisplay.setBounds({});

    footer.setBounds(bounds.removeFromBottom(UiMetrics::footerH));

    if (showingHelp)
    {
        helpView.setBounds(bounds);
        mainContentComponent.setBounds({});
    }
    else
    {
        mainContentComponent.setBounds(bounds);
        helpView.setBounds({});
    }
}

void SterioPluginEditor::onTrackSelected(const TrackInfo& track)
{
    processorRef.setCurrentTrack(track);
}

void SterioPluginEditor::updateSampleRateWarning()
{
    const bool shouldShow = processorRef.getCurrentSampleRate() > 100000.0;
    if (shouldShow != showHighSampleRateWarning)
    {
        showHighSampleRateWarning = shouldShow;
        resized();
    }
}

void SterioPluginEditor::toggleHelp()
{
    showingHelp = !showingHelp;
    appHeader.setHelpShowingBack(showingHelp);
    helpView.setVisible(showingHelp);
    mainContentComponent.setVisible(!showingHelp);
    resized();
}

void SterioPluginEditor::showDebugConsole()
{
    auto* modal = new DebugMessageModal();

    DialogWindow::LaunchOptions options;
    options.content.setOwned(modal);
    options.dialogTitle = "Debug Console";
    options.dialogBackgroundColour = Colors::BACKGROUND;
    options.escapeKeyTriggersCloseButton = true;
    options.useNativeTitleBar = true;
    options.resizable = true;
    options.content->setSize(600, 400);
    options.launchAsync();
}

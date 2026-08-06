#include "Footer.h"
#include "../Colors.h"

Footer::Footer(Services& services)
    : pluginStateRef(services.pluginState)
{
    pluginStateRef.addChangeListener(this);

    addAndMakeVisible(statusDot);
    addAndMakeVisible(primaryLabel);
    addAndMakeVisible(secondaryLabel);
    addAndMakeVisible(messageLabel);

    primaryLabel.setFont(juce::Font(UiMetrics::fontFooterPrimary, juce::Font::bold));
    primaryLabel.setColour(juce::Label::textColourId, Colors::TEXT_PRIMARY);
    primaryLabel.setJustificationType(juce::Justification::centredLeft);

    secondaryLabel.setFont(juce::Font(UiMetrics::fontFooterSecondary, juce::Font::plain));
    secondaryLabel.setColour(juce::Label::textColourId, Colors::TEXT_SECONDARY);
    secondaryLabel.setJustificationType(juce::Justification::centredLeft);

    messageLabel.setFont(juce::Font(UiMetrics::fontFooterSecondary, juce::Font::plain));
    messageLabel.setColour(juce::Label::textColourId, Colors::TEXT_SECONDARY);
    messageLabel.setJustificationType(juce::Justification::centred);
    messageLabel.setText("Select a track from the list, or use Open in Plugin from the Sterio web app",
                         juce::dontSendNotification);

    primaryLabel.setVisible(false);
    secondaryLabel.setVisible(false);
    messageLabel.setVisible(true);
    statusDot.setMode(StatusIndicator::Mode::Hidden);

    changeListenerCallback(nullptr);
}

Footer::~Footer()
{
    pluginStateRef.removeChangeListener(this);
}

void Footer::changeListenerCallback(juce::ChangeBroadcaster*)
{
    auto progressOpt = pluginStateRef.getProjectLoadProgress();
    if (progressOpt.hasValue())
    {
        const auto& progress = *progressOpt;
        juce::String text = progress.total > 0
            ? "Fetching audio assets (" + juce::String(progress.current) + " of " + juce::String(progress.total) + ")"
            : "Fetching audio assets...";

        mode = Mode::Fetching;
        primaryLabel.setText(text, juce::dontSendNotification);
        primaryLabel.setVisible(true);
        secondaryLabel.setVisible(false);
        messageLabel.setVisible(false);
        statusDot.setMode(StatusIndicator::Mode::Fetching);
        resized();
        return;
    }

    auto trackOpt = pluginStateRef.getCurrentTrack();

    if (trackOpt.hasValue())
    {
        const auto& track = *trackOpt;
        mode = Mode::Track;

        primaryLabel.setText(track.title, juce::dontSendNotification);

        juce::String secondary = track.username;
        if (track.metronome.isNotEmpty())
        {
            if (secondary.isNotEmpty())
                secondary += metaSeparator();
            secondary += track.metronome + " BPM";
        }
        if (track.timeSignature.isNotEmpty())
        {
            if (secondary.isNotEmpty())
                secondary += metaSeparator();
            secondary += track.timeSignature;
        }

        secondaryLabel.setText(secondary, juce::dontSendNotification);
        primaryLabel.setVisible(true);
        secondaryLabel.setVisible(secondary.isNotEmpty());
        messageLabel.setVisible(false);
        statusDot.setMode(StatusIndicator::Mode::Success);
    }
    else
    {
        auto projectOpt = pluginStateRef.getCurrentProject();
        if (projectOpt.hasValue())
        {
            const auto& project = *projectOpt;
            mode = Mode::Project;

            primaryLabel.setText("Project: " + project.name, juce::dontSendNotification);

            juce::String meta = juce::String(project.bpm) + " BPM";
            if (project.timeSignature.isNotEmpty())
                meta += metaSeparator() + project.timeSignature;
            secondaryLabel.setText(meta, juce::dontSendNotification);

            primaryLabel.setVisible(true);
            secondaryLabel.setVisible(true);
            messageLabel.setVisible(false);
            statusDot.setMode(StatusIndicator::Mode::Success);
        }
        else
        {
            mode = Mode::Prompt;
            primaryLabel.setVisible(false);
            secondaryLabel.setVisible(false);
            messageLabel.setVisible(true);
            statusDot.setMode(StatusIndicator::Mode::Hidden);
        }
    }

    resized();
}

void Footer::resized()
{
    auto area = getLocalBounds().reduced(UiMetrics::contentPadX, 6);

    if (messageLabel.isVisible())
    {
        statusDot.setBounds({});
        messageLabel.setBounds(area);
        return;
    }

    if (statusDot.isVisible())
    {
        auto dotArea = area.removeFromLeft(UiMetrics::footerDot);
        statusDot.setBounds(dotArea.withSizeKeepingCentre(UiMetrics::footerDot, UiMetrics::footerDot));
        area.removeFromLeft(7);
    }

    if (secondaryLabel.isVisible())
    {
        primaryLabel.setBounds(area.removeFromTop(16));
        secondaryLabel.setBounds(area.removeFromTop(14));
    }
    else
    {
        primaryLabel.setBounds(area);
    }
}

void Footer::paint(juce::Graphics& g)
{
    g.fillAll(Colors::GREY_1);
    g.setColour(Colors::GREY_2);
    g.fillRect(0, 0, getWidth(), 1);
}

#include "Footer.h"
#include "../Colors.h"

Footer::Footer(Services& services)
    : pluginStateRef(services.pluginState)
{
    pluginStateRef.addChangeListener(this);

    addAndMakeVisible(trackNameLabel);
    addAndMakeVisible(artistLabel);
    addAndMakeVisible(detailsLabel);
    addAndMakeVisible(messageLabel);

    juce::Font titleFont(16.0f, juce::Font::bold);
    trackNameLabel.setFont(titleFont);
    artistLabel.setFont(juce::Font(14.0f));
    detailsLabel.setFont(juce::Font(14.0f));


    messageLabel.setFont(juce::Font(14.0f));
    messageLabel.setColour(juce::Label::textColourId, Colors::GREY);
    messageLabel.setJustificationType(juce::Justification::centred);
    messageLabel.setText("Select a track from the list or click 'Open in Plugin' on a track in Sterio app", juce::dontSendNotification);

    trackNameLabel.setVisible(false);
    artistLabel.setVisible(false);
    detailsLabel.setVisible(false);
    messageLabel.setVisible(true);

    // Initial update
    changeListenerCallback(nullptr);
}

Footer::~Footer()
{
    pluginStateRef.removeChangeListener(this);
}


void Footer::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    auto progressOpt = pluginStateRef.getProjectLoadProgress();
    if (progressOpt.hasValue())
    {
        const auto& progress = *progressOpt;
        juce::String text = progress.total > 0
            ? "Fetching audio assets (" + juce::String(progress.current) + " of " + juce::String(progress.total) + ")"
            : "Fetching audio assets...";

        trackNameLabel.setVisible(false);
        artistLabel.setVisible(false);
        detailsLabel.setVisible(false);
        messageLabel.setText(text, juce::dontSendNotification);
        messageLabel.setVisible(true);
        resized();
        return;
    }

    auto trackOpt = pluginStateRef.getCurrentTrack();

    if (trackOpt.hasValue())
    {
        const auto& track = *trackOpt;

        trackNameLabel.setText(track.title, juce::dontSendNotification);
        trackNameLabel.setColour(juce::Label::textColourId, Colors::BLACK);
        trackNameLabel.setJustificationType(juce::Justification::left);

        artistLabel.setText(track.username, juce::dontSendNotification);
        artistLabel.setColour(juce::Label::textColourId, Colors::GREY);
        artistLabel.setJustificationType(juce::Justification::left);

        juce::String combined = "BPM: " + track.metronome + " | Time Sig: " + track.timeSignature;
        detailsLabel.setText(combined, juce::dontSendNotification);
        detailsLabel.setColour(juce::Label::textColourId, Colors::GREY);
        detailsLabel.setJustificationType(juce::Justification::right);

        trackNameLabel.setVisible(true);
        artistLabel.setVisible(true);
        detailsLabel.setVisible(true);
        messageLabel.setVisible(false);
    }
    else
    {
        auto projectOpt = pluginStateRef.getCurrentProject();
        if (projectOpt.hasValue())
        {
            const auto& project = *projectOpt;

            trackNameLabel.setText("Project: " + project.name, juce::dontSendNotification);
            trackNameLabel.setColour(juce::Label::textColourId, Colors::BLACK);
            trackNameLabel.setJustificationType(juce::Justification::left);

            juce::String combined = "BPM: " + juce::String(project.bpm) + " | Time Sig: " + project.timeSignature;
            detailsLabel.setText(combined, juce::dontSendNotification);
            detailsLabel.setColour(juce::Label::textColourId, Colors::GREY);
            detailsLabel.setJustificationType(juce::Justification::right);

            trackNameLabel.setVisible(true);
            artistLabel.setVisible(false);
            detailsLabel.setVisible(true);
            messageLabel.setVisible(false);
        }
        else
        {
            trackNameLabel.setVisible(false);
            artistLabel.setVisible(false);
            detailsLabel.setVisible(false);
            messageLabel.setVisible(true);
        }
    }

    resized();
}

void Footer::resized()
{
    if (messageLabel.isVisible())
    {
        messageLabel.setBounds(getLocalBounds().withSizeKeepingCentre(getWidth(), 20));
    }
    else
    {
        auto area = getLocalBounds();

        auto detailsArea = area.removeFromRight(200);
        detailsLabel.setBounds(detailsArea);

        juce::FlexBox leftFlex;
        leftFlex.flexDirection = juce::FlexBox::Direction::column;
        leftFlex.alignItems = juce::FlexBox::AlignItems::stretch;

        // gap
        leftFlex.items.add(juce::FlexItem().withHeight(10.0f));
        leftFlex.items.add(juce::FlexItem(trackNameLabel).withHeight(20.0f));
        if (artistLabel.isVisible())
        {
            leftFlex.items.add(juce::FlexItem().withHeight(2.0f));
            leftFlex.items.add(juce::FlexItem(artistLabel).withHeight(18.0f));
        }

        leftFlex.performLayout(area);
    }
}

void Footer::paint(juce::Graphics& g)
{
    g.setColour(Colors::LIGHT_GREY);
    g.drawLine(0, 0, getWidth(), 0, 4.0f);
}
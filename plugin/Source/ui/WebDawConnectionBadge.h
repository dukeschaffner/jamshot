#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"
#include "../WebDawConnectionIndicatorModel.h"

//==============================================================================
/** Compact connection/sync badge shown beside the logo. */
class WebDawConnectionBadge : public juce::Component,
                              public juce::SettableTooltipClient,
                              private juce::ChangeListener
{
public:
    static constexpr int preferredHeight = 16;

    explicit WebDawConnectionBadge(WebDawConnectionIndicatorModel& model)
        : modelRef(model)
    {
        modelRef.addChangeListener(this);
        refreshFromModel();
    }

    ~WebDawConnectionBadge() override
    {
        modelRef.removeChangeListener(this);
    }

    int getPreferredWidth() const
    {
        const auto font = juce::Font(UiMetrics::fontMs, juce::Font::bold);
        return juce::roundToInt(font.getStringWidthFloat(labelText)) + 12;
    }

    void paint(juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat().reduced(0.5f);
        // Match Sterio pill buttons: circular end-caps (height/2), not radiusPill
        // which clamps per-axis and draws elliptical corners.
        const float radius = bounds.getHeight() * 0.5f;

        juce::Colour fill = Colors::GREY_2;
        juce::Colour text = Colors::TEXT_SECONDARY;

        switch (mode)
        {
            case WebDawConnectionIndicatorModel::Mode::Connected:
                fill = Colors::RUSTIC_PINK;
                text = Colors::BACKGROUND;
                break;
            case WebDawConnectionIndicatorModel::Mode::Syncing:
                fill = Colors::SEAFOAM;
                text = Colors::GREY_4;
                break;
            case WebDawConnectionIndicatorModel::Mode::NotConnected:
            default:
                fill = Colors::GREY_2;
                text = Colors::TEXT_SECONDARY;
                break;
        }

        g.setColour(fill);
        g.fillRoundedRectangle(bounds, radius);

        g.setColour(text);
        g.setFont(juce::Font(UiMetrics::fontMs, juce::Font::bold));
        g.drawFittedText(labelText, getLocalBounds().reduced(6, 0),
                         juce::Justification::centred, 1);
    }

private:
    void changeListenerCallback(juce::ChangeBroadcaster*) override
    {
        refreshFromModel();
    }

    void refreshFromModel()
    {
        mode = modelRef.getMode();
        labelText = modelRef.getLabel();
        setTooltip(modelRef.getDetail());
        if (auto* parent = getParentComponent())
            parent->resized();
        repaint();
    }

    WebDawConnectionIndicatorModel& modelRef;
    WebDawConnectionIndicatorModel::Mode mode = WebDawConnectionIndicatorModel::Mode::NotConnected;
    juce::String labelText { "Offline" };
};

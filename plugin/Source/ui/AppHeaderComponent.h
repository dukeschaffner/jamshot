#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "LogoComponent.h"
#include "WebDawConnectionBadge.h"
#include "../Colors.h"
#include "../WebDawConnectionIndicatorModel.h"

//==============================================================================
/** Merged app header: logo + connection badge left, Update / Debug / Help actions right. */
class AppHeaderComponent : public juce::Component
{
public:
    explicit AppHeaderComponent(WebDawConnectionIndicatorModel& connectionModel)
        : connectionBadge(connectionModel)
    {
        addAndMakeVisible(logo);
        addAndMakeVisible(connectionBadge);

        addAndMakeVisible(updateButton);
        updateButton.setButtonText("Update Available");
        SterioButtonStyle::apply(updateButton, SterioButtonStyle::green);
        updateButton.setVisible(false);

        addAndMakeVisible(helpButton);
        helpButton.setButtonText("Help");
        SterioButtonStyle::apply(helpButton, SterioButtonStyle::standard);

       #ifdef JUCE_DEBUG
        addAndMakeVisible(debugButton);
        debugButton.setButtonText("Debug");
        SterioButtonStyle::apply(debugButton, SterioButtonStyle::standard);
       #endif
    }

    void setUpdateVisible(bool visible)
    {
        updateButton.setVisible(visible);
        resized();
    }

    void setHelpShowingBack(bool showingBack)
    {
        helpButton.setButtonText(showingBack ? "Back" : "Help");
    }

    juce::TextButton& getHelpButton() { return helpButton; }
    juce::TextButton& getUpdateButton() { return updateButton; }
   #ifdef JUCE_DEBUG
    juce::TextButton& getDebugButton() { return debugButton; }
   #endif

    void paint(juce::Graphics& g) override
    {
        g.fillAll(Colors::BACKGROUND);
        g.setColour(Colors::GREY_2);
        g.fillRect(0, getHeight() - 1, getWidth(), 1);
    }

    void resized() override
    {
        auto bounds = getLocalBounds();
        bounds.removeFromLeft(UiMetrics::contentPadX);
        bounds.removeFromRight(10);

        const int logoW = logo.getPreferredWidth();
        auto logoArea = bounds.removeFromLeft(logoW);
        logo.setBounds(logoArea.getX(),
                       logoArea.getCentreY() - UiMetrics::logoH / 2,
                       logoW,
                       UiMetrics::logoH);

        bounds.removeFromLeft(UiMetrics::space1);
        const int badgeH = WebDawConnectionBadge::preferredHeight;
        const int badgeW = juce::jmax(52, connectionBadge.getPreferredWidth());
        connectionBadge.setBounds(bounds.removeFromLeft(badgeW)
                                      .withSizeKeepingCentre(badgeW, badgeH));

        auto actions = bounds;
        const int btnH = 22;
        const int gap = 6;
        int x = actions.getRight();

        auto placeRight = [&](juce::TextButton& btn, int w)
        {
            if (!btn.isVisible())
                return;
            x -= w;
            btn.setBounds(x, actions.getCentreY() - btnH / 2, w, btnH);
            x -= gap;
        };

        placeRight(helpButton, 52);
       #ifdef JUCE_DEBUG
        placeRight(debugButton, 58);
       #endif
        placeRight(updateButton, 118);
    }

private:
    LogoComponent logo;
    WebDawConnectionBadge connectionBadge;
    juce::TextButton updateButton;
    juce::TextButton helpButton;
   #ifdef JUCE_DEBUG
    juce::TextButton debugButton;
   #endif
};

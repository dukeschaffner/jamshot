#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

//==============================================================================
/** ListBox that tracks the hovered row even when the mouse is over the
    internal viewport content (where ListBox itself does not receive moves). */
class HoverTrackingListBox : public juce::ListBox
{
public:
    HoverTrackingListBox (const juce::String& name)
        : juce::ListBox (name, nullptr)
    {
        // Receive moves that target the viewport / row content children.
        addMouseListener (this, true);

        // Lists feel jumpy at JUCE's default 16px step; keep softer than the timeline.
        if (auto* vp = getViewport())
        {
            vp->setSingleStepSizes (4, 4);
            vp->setScrollBarThickness (8);
        }
    }

    ~HoverTrackingListBox() override
    {
        removeMouseListener (this);
    }

    int getHoveredRow() const { return hoveredRow; }

    void mouseMove (const juce::MouseEvent& e) override { updateHover (e); }
    void mouseEnter (const juce::MouseEvent& e) override { updateHover (e); }
    void mouseDrag (const juce::MouseEvent& e) override { updateHover (e); }

    void mouseExit (const juce::MouseEvent& e) override
    {
        juce::ignoreUnused (e);
        if (! getScreenBounds().contains (juce::Desktop::getInstance()
                                              .getMainMouseSource()
                                              .getScreenPosition()
                                              .roundToInt()))
            setHoveredRow (-1);
    }

private:
    void updateHover (const juce::MouseEvent& e)
    {
        const auto pos = e.getEventRelativeTo (this).getPosition();
        setHoveredRow (getRowContainingPosition (pos.x, pos.y));
    }

    void setHoveredRow (int row)
    {
        if (hoveredRow == row)
            return;
        hoveredRow = row;
        repaint();
    }

    int hoveredRow = -1;
};

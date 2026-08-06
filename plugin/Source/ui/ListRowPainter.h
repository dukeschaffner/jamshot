#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

//==============================================================================
/** Shared paint helpers for track/project list rows matching the themed artifact. */
namespace ListRowPainter
{
    inline juce::Rectangle<float> cardBounds (int width, int height, bool hovered)
    {
        auto card = juce::Rectangle<float> (0.0f, 0.0f, (float) width, (float) height)
                        .reduced (0.0f, 3.0f); // 6px gap between rows
        if (hovered)
            card = card.translated (0.0f, -1.0f);
        return card;
    }

    inline void paintRow (juce::Graphics& g,
                          int width,
                          int height,
                          bool selected,
                          bool hovered,
                          const juce::String& title,
                          const juce::String& meta)
    {
        g.fillAll (Colors::BACKGROUND);

        auto card = cardBounds (width, height, hovered);

        if (selected)
            g.setColour (Colors::SEAFOAM_LIGHT);
        else
            g.setColour (Colors::BACKGROUND);

        g.fillRoundedRectangle (card, UiMetrics::radiusMd);

        juce::Colour border = Colors::GREY_2;
        if (selected)
            border = hovered ? Colors::SEAFOAM_DARK : Colors::SEAFOAM;
        else if (hovered)
            border = Colors::SEAFOAM_DARK;

        g.setColour (border);
        g.drawRoundedRectangle (card.reduced (0.5f), UiMetrics::radiusMd, 1.0f);

        if (hovered)
        {
            // Approximate artifact --shadow-sm under lifted card
            g.setColour (juce::Colours::black.withAlpha (0.08f));
            g.drawRoundedRectangle (card.translated (0.0f, 1.5f).reduced (0.5f),
                                    UiMetrics::radiusMd, 1.0f);
        }

        auto textArea = card.reduced (12.0f, 7.0f);

        g.setFont (juce::Font (UiMetrics::fontListTitle, juce::Font::bold));
        g.setColour (Colors::TEXT_PRIMARY);
        auto titleBounds = textArea.removeFromTop (16.0f);
        g.drawText (title, titleBounds, juce::Justification::centredLeft, true);

        if (meta.isNotEmpty())
        {
            g.setFont (juce::Font (UiMetrics::fontListMeta, juce::Font::plain));
            g.setColour (selected ? Colors::TEXT_PRIMARY.withAlpha (0.62f)
                                  : Colors::TEXT_SECONDARY);
            g.drawText (meta, textArea, juce::Justification::centredLeft, true);
        }
    }

    inline void paintLoadMore (juce::Graphics& g, int width, int height, bool hovered)
    {
        g.fillAll (Colors::BACKGROUND);

        auto card = cardBounds (width, height, hovered).reduced (0.0f, 2.0f);

        g.setColour (hovered ? Colors::SEAFOAM_LIGHT : Colors::BACKGROUND);
        g.fillRoundedRectangle (card, UiMetrics::radiusMd);

        g.setColour (hovered ? Colors::SEAFOAM_DARK : Colors::GREY_2);
        g.drawRoundedRectangle (card.reduced (0.5f), UiMetrics::radiusMd, 1.0f);

        g.setFont (juce::Font (UiMetrics::fontButton, juce::Font::bold));
        g.setColour (hovered ? Colors::TEXT_PRIMARY : Colors::TEXT_SECONDARY);
        g.drawText ("Load More", card.toNearestInt(), juce::Justification::centred, true);
    }
}

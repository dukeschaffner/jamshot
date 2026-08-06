#include "SterioLookAndFeel.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include "../Colors.h"

SterioLookAndFeel::SterioLookAndFeel()
{
    setColour (juce::ScrollBar::thumbColourId, Colors::GREY_2);
    setColour (juce::ScrollBar::trackColourId, Colors::BACKGROUND);

    setColour (juce::TextButton::buttonColourId, Colors::GREY_1);
    setColour (juce::TextButton::textColourOffId, Colors::TEXT_PRIMARY);
    setColour (juce::TextButton::textColourOnId, Colors::TEXT_PRIMARY);

    setColour (juce::ListBox::backgroundColourId, Colors::BACKGROUND);
    setColour (juce::ListBox::outlineColourId, juce::Colours::transparentBlack);
}

juce::Font SterioLookAndFeel::getTextButtonFont (juce::TextButton& button, int buttonHeight)
{
    const auto style = SterioButtonStyle::get (button);

    if (style == SterioButtonStyle::tab || style == SterioButtonStyle::tabActive)
        return juce::Font (UiMetrics::fontTab,
                           style == SterioButtonStyle::tabActive ? juce::Font::bold : juce::Font::plain);

    if (style == SterioButtonStyle::ms
        || style == SterioButtonStyle::msMuteActive
        || style == SterioButtonStyle::msSoloActive)
        return juce::Font (UiMetrics::fontMs, juce::Font::bold);

    if (style == SterioButtonStyle::projectBack)
        return juce::Font (14.0f, juce::Font::plain);

    juce::ignoreUnused (buttonHeight);
    return juce::Font (UiMetrics::fontButton, juce::Font::bold);
}

void SterioLookAndFeel::drawButtonBackground (juce::Graphics& g,
                                              juce::Button& button,
                                              const juce::Colour& backgroundColour,
                                              bool shouldDrawButtonAsHighlighted,
                                              bool shouldDrawButtonAsDown)
{
    juce::ignoreUnused (backgroundColour);
    const auto style = SterioButtonStyle::get (button);

    if (style == SterioButtonStyle::tab || style == SterioButtonStyle::tabActive)
    {
        drawTabButton (g, button, shouldDrawButtonAsHighlighted,
                       style == SterioButtonStyle::tabActive);
        return;
    }

    if (style == SterioButtonStyle::ms
        || style == SterioButtonStyle::msMuteActive
        || style == SterioButtonStyle::msSoloActive)
    {
        auto bounds = button.getLocalBounds().toFloat();
        juce::Colour fill = Colors::BACKGROUND;
        juce::Colour text = Colors::TEXT_DISABLED;

        if (style == SterioButtonStyle::msMuteActive)
        {
            fill = Colors::RUSTIC_PINK;
            text = Colors::BACKGROUND;
        }
        else if (style == SterioButtonStyle::msSoloActive)
        {
            fill = Colors::SEAFOAM;
            text = Colors::GREY_4;
        }
        else if (shouldDrawButtonAsHighlighted)
        {
            fill = Colors::GREY_1;
            text = Colors::TEXT_PRIMARY;
        }

        juce::ignoreUnused (text);
        g.setColour (fill);
        g.fillRect (bounds);
        return;
    }

    drawPillButton (g, button, shouldDrawButtonAsHighlighted, shouldDrawButtonAsDown, style);
}

void SterioLookAndFeel::drawPillButton (juce::Graphics& g,
                                        juce::Button& button,
                                        bool highlighted,
                                        bool down,
                                        const juce::String& style)
{
    auto bounds = button.getLocalBounds().toFloat();

    if (style == SterioButtonStyle::projectBack)
    {
        const float size = (float) juce::jmin (button.getWidth(), button.getHeight());
        bounds = bounds.withSizeKeepingCentre (size, size);

        if (highlighted || down)
            g.setColour (Colors::BACKGROUND);
        else
            g.setColour (Colors::BACKGROUND.withAlpha (0.88f));

        g.fillRoundedRectangle (bounds, UiMetrics::radiusSm);
        g.setColour (Colors::GREY_2);
        g.drawRoundedRectangle (bounds.reduced (0.5f), UiMetrics::radiusSm, 1.0f);

        if (highlighted || down)
        {
            g.setColour (juce::Colours::black.withAlpha (0.08f));
            g.drawRoundedRectangle (bounds.translated (0.0f, 1.0f).expanded (0.5f),
                                    UiMetrics::radiusSm, 1.0f);
        }
        return;
    }

    // Reserve 1px at top so hover lift stays inside clip bounds.
    bounds.setHeight (bounds.getHeight() - 1.0f);
    if (! (highlighted && ! down))
        bounds = bounds.translated (0.0f, 1.0f);

    // Circular end-caps (true pill). Do NOT use radiusPill/999 — that clamps
    // independently per axis and draws elliptical (oval) corners.
    const float radius = bounds.getHeight() * 0.5f;

    if (style == SterioButtonStyle::primary)
    {
        juce::ColourGradient grad (Colors::SEAFOAM, bounds.getX(), bounds.getCentreY(),
                                   Colors::RUSTIC_PINK, bounds.getRight(), bounds.getCentreY(), false);
        g.setGradientFill (grad);
        g.fillRoundedRectangle (bounds, radius);
        return;
    }

    if (style == SterioButtonStyle::green)
    {
        g.setColour (highlighted ? Colors::SEAFOAM : Colors::SEAFOAM_LIGHT);
        g.fillRoundedRectangle (bounds, radius);
        return;
    }

    // standard
    g.setColour (highlighted ? Colors::GREY_2 : Colors::GREY_1);
    g.fillRoundedRectangle (bounds, radius);
}

void SterioLookAndFeel::drawTabButton (juce::Graphics& g,
                                       juce::Button& button,
                                       bool highlighted,
                                       bool active)
{
    auto bounds = button.getLocalBounds().toFloat();
    g.setColour (Colors::BACKGROUND);
    g.fillRect (bounds);

    // Always continue the tab-bar bottom border under inactive tabs.
    // Active: 2px seafoam. Inactive: 1px grey, 2px grey on hover.
    if (active)
    {
        g.setColour (Colors::SEAFOAM);
        g.fillRect (bounds.getX(), bounds.getBottom() - 2.0f, bounds.getWidth(), 2.0f);
    }
    else
    {
        const float thickness = highlighted ? 2.0f : 1.0f;
        g.setColour (Colors::GREY_2);
        g.fillRect (bounds.getX(), bounds.getBottom() - thickness, bounds.getWidth(), thickness);
    }
}

void SterioLookAndFeel::drawButtonText (juce::Graphics& g,
                                        juce::TextButton& button,
                                        bool shouldDrawButtonAsHighlighted,
                                        bool shouldDrawButtonAsDown)
{
    const auto style = SterioButtonStyle::get (button);
    auto font = getTextButtonFont (button, button.getHeight());
    g.setFont (font);

    juce::Colour textColour = Colors::TEXT_PRIMARY;

    if (style == SterioButtonStyle::primary)
        textColour = Colors::BACKGROUND;
    else if (style == SterioButtonStyle::green)
        textColour = shouldDrawButtonAsHighlighted ? Colors::BACKGROUND : Colors::GREY_4;
    else if (style == SterioButtonStyle::tab || style == SterioButtonStyle::tabActive)
        textColour = (style == SterioButtonStyle::tabActive || shouldDrawButtonAsHighlighted)
                         ? Colors::TEXT_PRIMARY
                         : Colors::TEXT_SECONDARY;
    else if (style == SterioButtonStyle::msMuteActive)
        textColour = Colors::BACKGROUND;
    else if (style == SterioButtonStyle::msSoloActive)
        textColour = Colors::GREY_4;
    else if (style == SterioButtonStyle::ms)
        textColour = shouldDrawButtonAsHighlighted ? Colors::TEXT_PRIMARY : Colors::TEXT_DISABLED;
    else if (style == SterioButtonStyle::projectBack)
        textColour = Colors::TEXT_PRIMARY;

    g.setColour (button.isEnabled() ? textColour : textColour.withAlpha (0.4f));

    auto bounds = button.getLocalBounds();
    const bool isPill = style != SterioButtonStyle::tab && style != SterioButtonStyle::tabActive
        && style != SterioButtonStyle::ms && style != SterioButtonStyle::msMuteActive
        && style != SterioButtonStyle::msSoloActive && style != SterioButtonStyle::projectBack;

    // Match drawPillButton: reserve 1px at top for hover lift.
    if (isPill)
    {
        bounds.setHeight (bounds.getHeight() - 1);
        if (! (shouldDrawButtonAsHighlighted && ! shouldDrawButtonAsDown))
            bounds = bounds.translated (0, 1);
    }

    g.drawFittedText (button.getButtonText(), bounds, juce::Justification::centred, 1);
}

int SterioLookAndFeel::getDefaultScrollbarWidth()
{
    return 8;
}

void SterioLookAndFeel::drawScrollbar (juce::Graphics& g,
                                       juce::ScrollBar& scrollbar,
                                       int x, int y, int width, int height,
                                       bool isScrollbarVertical,
                                       int thumbStartPosition,
                                       int thumbSize,
                                       bool isMouseOver,
                                       bool isMouseDown)
{
    juce::ignoreUnused (scrollbar, isMouseDown);

    g.setColour (Colors::BACKGROUND);
    g.fillRect (x, y, width, height);

    juce::Rectangle<float> thumb;
    if (isScrollbarVertical)
        thumb = { (float) x + 1.0f, (float) thumbStartPosition,
                  (float) juce::jmax (4, width - 2), (float) thumbSize };
    else
        thumb = { (float) thumbStartPosition, (float) y + 1.0f,
                  (float) thumbSize, (float) juce::jmax (4, height - 2) };

    g.setColour (isMouseOver ? Colors::SEAFOAM_DARK : Colors::GREY_2);
    g.fillRoundedRectangle (thumb, 3.0f);
}

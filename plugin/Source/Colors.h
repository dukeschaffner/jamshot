#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

namespace Colors
{
    // Brand palette (Sterio web / plugin artifact)
    const juce::Colour SEAFOAM = juce::Colour(0xff93E9BE);
    const juce::Colour SEAFOAM_LIGHT = juce::Colour(0xffC1F4D9);
    const juce::Colour SEAFOAM_DARK = juce::Colour(0xff65d6ad);
    const juce::Colour RUSTIC_PINK = juce::Colour(0xffE9A9A1);
    const juce::Colour RUSTIC_PINK_LIGHT = juce::Colour(0xffF4C9C4);
    const juce::Colour RED = juce::Colour(0xfffc3232);
    const juce::Colour P1 = juce::Colour(0xffe4a794);
    const juce::Colour P2 = juce::Colour(0xfff59771);
    const juce::Colour S1 = juce::Colour(0xff86a699);
    const juce::Colour S2 = juce::Colour(0xff036745);
    const juce::Colour DARK_GREEN = juce::Colour(0xff28764e);

    // Neutrals
    const juce::Colour BACKGROUND = juce::Colour(0xffffffff);
    const juce::Colour GREY_1 = juce::Colour(0xfff5f5f5);
    const juce::Colour GREY_2 = juce::Colour(0xffe0e0e0);
    const juce::Colour GREY_3 = juce::Colour(0xff555555);
    const juce::Colour GREY_4 = juce::Colour(0xff333333);
    const juce::Colour TEXT_PRIMARY = juce::Colour(0xff171717);
    const juce::Colour TEXT_SECONDARY = juce::Colour(0xff555555);
    const juce::Colour TEXT_DISABLED = juce::Colour(0xff999999);

    // Semantic
    const juce::Colour ERROR_TEXT = juce::Colour(0xffd92727);
    const juce::Colour WARN_TEXT = juce::Colour(0xff7c3f36);
    const juce::Colour BANNER_BG = juce::Colour(0xfffff5f5);
    const juce::Colour SAMPLE_RATE_WARN_BG = juce::Colour(0xffF4C9C4); // rustic-pink-light

    // Legacy aliases used across the plugin
    const juce::Colour WHITE = BACKGROUND;
    const juce::Colour BLACK = TEXT_PRIMARY;
    const juce::Colour GREY = TEXT_SECONDARY;
    const juce::Colour LIGHT_GREY = GREY_1;
}

namespace UiMetrics
{
    constexpr int space1 = 4;
    constexpr int space2 = 8;
    constexpr int space3 = 12;
    constexpr int space4 = 16;
    constexpr int space5 = 20;
    constexpr int space6 = 24;

    constexpr float radiusSm = 6.0f;
    constexpr float radiusMd = 10.0f;
    constexpr float radiusLg = 14.0f;
    constexpr float radiusPill = 999.0f;

    constexpr int pluginDefaultW = 420;
    constexpr int pluginDefaultH = 560;
    constexpr int pluginMinW = 320;
    constexpr int pluginMinH = 420;
    constexpr int pluginMaxW = 720;
    constexpr int pluginMaxH = 900;

    constexpr int appHeaderH = 44;
    constexpr int authStripH = 40;
    constexpr int footerH = 46;
    constexpr int tabBarH = 34;
    constexpr int sectionChromeH = 32;
    constexpr int listRowH = 52; // 46 card + 6 gap
    constexpr int logoH = 17;
    constexpr int statusDot = 7;
    constexpr int footerDot = 6;

    constexpr int contentPadX = 14;
    constexpr int listPadX = 12;
    constexpr int tabPadX = 10;

    constexpr float fontBase = 13.0f;
    constexpr float fontButton = 11.5f;
    constexpr float fontTab = 12.5f;
    constexpr float fontSection = 10.5f;
    constexpr float fontListTitle = 12.5f;
    constexpr float fontListMeta = 11.0f;
    constexpr float fontFooterPrimary = 12.0f;
    constexpr float fontFooterSecondary = 11.0f;
    constexpr float fontHelpTitle = 14.0f;
    constexpr float fontHelpBody = 12.0f;
    constexpr float fontAuth = 12.0f;
    constexpr float fontBanner = 11.5f;
    constexpr float fontLaneLabel = 10.0f;
    constexpr float fontMs = 9.0f;

    constexpr int timelineLaneH = 54;
    constexpr int timelineLabelW = 98;
    constexpr int timelineLaneGap = 6;
    constexpr int timelinePad = 12;
    constexpr int timelineMinContentW = 480; // matches artifact .timeline-inner min-width
    constexpr int projectBackSize = 26;
}

/** UTF-8 middle-dot separator used in list/footer meta lines. */
inline juce::String metaSeparator()
{
    return juce::String (juce::CharPointer_UTF8 (" \xc2\xb7 "));
}

namespace SterioButtonStyle
{
    inline const juce::Identifier propertyId { "sterioStyle" };

    inline constexpr const char* primary = "primary";
    inline constexpr const char* green = "green";
    inline constexpr const char* standard = "standard";
    inline constexpr const char* tab = "tab";
    inline constexpr const char* tabActive = "tabActive";
    inline constexpr const char* projectBack = "projectBack";
    inline constexpr const char* ms = "ms";
    inline constexpr const char* msMuteActive = "msMuteActive";
    inline constexpr const char* msSoloActive = "msSoloActive";

    inline void apply (juce::Component& c, const char* style)
    {
        c.getProperties().set (propertyId, style);
        c.setMouseCursor (juce::MouseCursor::PointingHandCursor);
        c.repaint();
    }

    inline juce::String get (const juce::Component& c)
    {
        return c.getProperties()[propertyId].toString();
    }
}

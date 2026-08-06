#include "LogoComponent.h"
#include <BinaryData.h>
#include "../Colors.h"

LogoComponent::LogoComponent()
{
    logo = juce::ImageCache::getFromMemory (
        BinaryData::logo_png,
        BinaryData::logo_pngSize
    );
    setInterceptsMouseClicks (false, false);
}

void LogoComponent::paint (juce::Graphics& g)
{
    if (! logo.isValid())
        return;

    const int targetH = UiMetrics::logoH;
    const float aspect = (float) logo.getWidth() / (float) juce::jmax (1, logo.getHeight());
    const int targetW = juce::roundToInt ((float) targetH * aspect);

    const int y = (getHeight() - targetH) / 2;

    g.drawImageWithin (logo, 0, y, targetW, targetH,
                       juce::RectanglePlacement::xLeft | juce::RectanglePlacement::yMid
                           | juce::RectanglePlacement::onlyReduceInSize);
}

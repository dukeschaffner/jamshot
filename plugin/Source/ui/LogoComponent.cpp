#include "LogoComponent.h"
#include <BinaryData.h>

LogoComponent::LogoComponent()
{
    logo = juce::ImageCache::getFromMemory(
        BinaryData::logo_png,
        BinaryData::logo_pngSize
    );
}

void LogoComponent::paint(juce::Graphics& g)
{
    g.drawImageWithin(logo, 0, 0, getWidth(), getHeight(),
                      juce::RectanglePlacement::centred);
}

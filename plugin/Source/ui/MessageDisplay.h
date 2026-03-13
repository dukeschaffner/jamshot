#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

/**
 An error display component that is hidden when no error is set.
 Shows the error message and an "OK" button to clear it.
*/
class MessageDisplay : public juce::Component, 
                     private juce::Timer
{
public:
    MessageDisplay();
    ~MessageDisplay() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    void timerCallback() override;
    void clearMessage();

    juce::Label messageLabel;
    juce::TextButton okButton {"OK"};
    int currentSeverity = -1; // -1 = no message, 0 = Info, 1 = Warning, 2 = Error, 3 = Critical

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MessageDisplay)
};

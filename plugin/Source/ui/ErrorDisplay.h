#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

/**
 An error display component that is hidden when no error is set.
 Shows the error message and an "OK" button to clear it.
*/
class ErrorDisplay : public juce::Component
{
public:
    ErrorDisplay();
    ~ErrorDisplay() override;

    /** Set an error message. Passing an empty string clears and hides the component. */
    void setError(const juce::String& msg);

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    juce::Label messageLabel;
    juce::TextButton okButton {"OK"};

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ErrorDisplay)
};

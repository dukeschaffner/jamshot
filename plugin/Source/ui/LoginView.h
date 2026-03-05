#pragma once

#include <juce_gui_basics/juce_gui_basics.h>

class AuthManager;

//==============================================================================
/** Login/logout UI for the Sterio plugin (Increment 2). */
class LoginView : public juce::Component, private juce::Timer
{
public:
    explicit LoginView(AuthManager& authManager);
    ~LoginView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

private:
    void timerCallback() override;

    AuthManager& authManagerRef;

    juce::TextButton loginButton;
    juce::TextButton logoutButton;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LoginView)
};

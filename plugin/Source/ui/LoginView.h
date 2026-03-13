#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include "../api/SterioApiClient.h"
#include "../Services.h"

class AuthManager;

//==============================================================================
/** Login/logout UI for the Sterio plugin (Increment 2 & 3). */
class LoginView : public juce::Component, private juce::Timer
{
public:
    LoginView(Services& services);
    ~LoginView() override;

    void paint(juce::Graphics& g) override;
    void resized() override;

    /** Get the current username, or empty string if not logged in or loading. */
    juce::String getUsername() const { return currentUsername; }

private:
    void timerCallback() override;

    /** Load user info from API. */
    void loadUserInfo();

    /** Update the UI state based on login status. */
    void updateLoginState();

    AuthManager& authManagerRef;
    SterioApiClient& apiClientRef;

    juce::TextButton authButton;
    juce::Label statusLabel;

    juce::String currentUsername;
    bool isLoadingUserInfo = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(LoginView)
};

#pragma once

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h> 
#include "AuthCallbackServer.h"

//==============================================================================
/** Manages plugin authentication: token storage, login flow, and auth state. */
class AuthManager : public juce::ChangeBroadcaster
{
public:
    AuthManager();
    ~AuthManager();

    /** Load persisted tokens on startup. */
    void loadTokens();

    /** Returns true if we have a valid access token. */
    bool isLoggedIn() const;

    /** Start login flow: local callback server + open browser. */
    void login();

    /** Clear tokens and stop any active login flow. */
    void logout();

    /** Get the current access token for API calls. Empty if not logged in. */
    juce::String getAccessToken() const;

private:
    void saveTokens();
    void onTokenReceived(const juce::String& accessToken, const juce::String& refreshToken);

    mutable juce::CriticalSection lock;
    juce::String accessToken;
    juce::String refreshToken;
    std::unique_ptr<AuthCallbackServer> callbackServer;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AuthManager)
};

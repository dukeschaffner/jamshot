#pragma once

#include <juce_core/juce_core.h>

//==============================================================================
/** Minimal HTTP server that listens for OAuth callback with token in query params.
    Runs in a background thread. When a GET request is received with access_token
    and optionally refresh_token, invokes the callback and sends a success page.
*/
class AuthCallbackServer
{
public:
    using TokenCallback = std::function<void(const juce::String& accessToken, const juce::String& refreshToken)>;

    AuthCallbackServer();
    ~AuthCallbackServer();

    /** Start listening on the given port. Returns the port actually bound (may differ if 0). */
    int start(int port = 0);

    /** Stop the server. Safe to call from any thread. */
    void stop();

    /** Set callback invoked when token is received. Called on message thread. */
    void setTokenCallback(TokenCallback cb) { tokenCallback = std::move(cb); }

    /** Get the port the server is listening on. 0 if not started. */
    int getPort() const { return port; }

    /** Check if server is running. */
    bool isRunning() const { return running; }

private:
    void runServer();

    juce::StreamingSocket listenerSocket;
    std::atomic<bool> running{ false };
    std::atomic<int> port{ 0 };
    std::unique_ptr<std::thread> serverThread;
    TokenCallback tokenCallback;
    juce::CriticalSection callbackLock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(AuthCallbackServer)
};

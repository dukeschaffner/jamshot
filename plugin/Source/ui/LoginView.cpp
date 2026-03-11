#include "LoginView.h"
#include "../auth/AuthManager.h"
#include "../Colors.h"

using namespace juce;

//==============================================================================
LoginView::LoginView(AuthManager& authManager, SterioApiClient& apiClient)
    : authManagerRef(authManager),
      apiClientRef(apiClient)
{
    authButton.setButtonText("Log in to Sterio");
    authButton.onClick = [this] { authManagerRef.login(); };

    // Style auth button with seafoam color initially
    authButton.setColour(TextButton::buttonColourId, Colors::SEAFOAM);
    authButton.setColour(TextButton::textColourOffId, Colors::WHITE);

    addAndMakeVisible(authButton);

    addAndMakeVisible(statusLabel);
    statusLabel.setJustificationType(Justification::centred);
    
    // Style status label
    statusLabel.setColour(Label::textColourId, Colors::GREY);

    // Set initial state
    updateLoginState();

    startTimerHz(30);
}

LoginView::~LoginView()
{
    stopTimer();
}

void LoginView::timerCallback()
{
    // Update the button state based on current login status
    updateLoginState();
}

void LoginView::paint(Graphics& g)
{
    g.fillAll(Colors::WHITE);
}

void LoginView::resized()
{
    auto r = getLocalBounds();
    auto buttonWidth = 120; // Increased width to accommodate both button texts
    auto gap = 10;

    authButton.setBounds(r.removeFromLeft(buttonWidth));
    r.removeFromLeft(gap);

    // Status label takes remaining space
    statusLabel.setBounds(r);
}

void LoginView::loadUserInfo()
{
    if (isLoadingUserInfo)
        return;

    isLoadingUserInfo = true;
    statusLabel.setText("Loading user info...", dontSendNotification);

    // Set the access token for API calls
    apiClientRef.setAccessToken(authManagerRef.getAccessToken());

    // Load user info on background thread
    Thread::launch([this]() {
        auto result = apiClientRef.getMe();

        MessageManager::callAsync([this, result]() {
            isLoadingUserInfo = false;

            if (result.failed())
            {
                statusLabel.setText("Failed to load user info", dontSendNotification);
                currentUsername.clear();
            }
            else
            {
                const auto& userInfo = *result;
                currentUsername = userInfo.username;
                statusLabel.setText("Logged in as " + currentUsername, dontSendNotification);
            }
        });
    });
}

void LoginView::updateLoginState()
{
    bool loggedIn = authManagerRef.isLoggedIn();

    if (loggedIn)
    {
        authButton.setButtonText("Log out");
        authButton.setColour(TextButton::buttonColourId, Colors::RUSTIC_PINK);
        authButton.onClick = [this] {
            authManagerRef.logout();
            currentUsername.clear();
            statusLabel.setText("", dontSendNotification);
        };

        if (currentUsername.isEmpty() && !isLoadingUserInfo)
        {
            loadUserInfo();
        }
    }
    else
    {
        authButton.setButtonText("Log in to Sterio");
        authButton.setColour(TextButton::buttonColourId, Colors::SEAFOAM);
        authButton.onClick = [this] { authManagerRef.login(); };

        currentUsername.clear();
        statusLabel.setText("", dontSendNotification);
    }
}

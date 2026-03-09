#include "LoginView.h"
#include "../auth/AuthManager.h"
#include "../Colors.h"

using namespace juce;

//==============================================================================
LoginView::LoginView(AuthManager& authManager, SterioApiClient& apiClient)
    : authManagerRef(authManager),
      apiClientRef(apiClient)
{
    loginButton.setButtonText("Log in to Sterio");
    loginButton.onClick = [this] { authManagerRef.login(); };
    
    // Style login button with seafoam color
    loginButton.setColour(TextButton::buttonColourId, Colors::SEAFOAM);
    loginButton.setColour(TextButton::textColourOffId, Colors::WHITE);
    
    addAndMakeVisible(loginButton);

    logoutButton.setButtonText("Log out");
    logoutButton.onClick = [this] {
        authManagerRef.logout();
        currentUsername.clear();
        statusLabel.setText("", dontSendNotification);
    };
    
    // Style logout button with rustic pink color
    logoutButton.setColour(TextButton::buttonColourId, Colors::RUSTIC_PINK);
    logoutButton.setColour(TextButton::textColourOffId, Colors::WHITE);
    
    addAndMakeVisible(logoutButton);

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
    bool loggedIn = authManagerRef.isLoggedIn();

    // Update visibility based on login state
    if (loginButton.isVisible() == loggedIn)
    {
        loginButton.setVisible(!loggedIn);
        logoutButton.setVisible(loggedIn);

        if (loggedIn && currentUsername.isEmpty() && !isLoadingUserInfo)
        {
            loadUserInfo();
        }
        else if (!loggedIn)
        {
            currentUsername.clear();
            statusLabel.setText("", dontSendNotification);
        }
    }
}

void LoginView::paint(Graphics& g)
{
    g.fillAll(Colors::BLACK);
}

void LoginView::resized()
{
    auto r = getLocalBounds();
    auto buttonWidth = 80;
    auto gap = 10;

    loginButton.setBounds(r.removeFromLeft(buttonWidth));
    r.removeFromLeft(gap);
    logoutButton.setBounds(r.removeFromLeft(buttonWidth));
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
    loginButton.setVisible(!loggedIn);
    logoutButton.setVisible(loggedIn);

    if (loggedIn && currentUsername.isEmpty() && !isLoadingUserInfo)
    {
        loadUserInfo();
    }
    else if (!loggedIn)
    {
        currentUsername.clear();
        statusLabel.setText("", dontSendNotification);
    }
}

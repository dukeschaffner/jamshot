#include "LoginView.h"
#include "../auth/AuthManager.h"
#include "../Colors.h"

using namespace juce;

//==============================================================================
LoginView::LoginView(Services& services)
    : authManagerRef(services.auth),
      apiClientRef(services.api)
{
    authButton.setButtonText("Log in to Sterio");
    authButton.onClick = [this] { authManagerRef.login(); };

    // Style auth button with seafoam color initially
    authButton.setColour(TextButton::buttonColourId, Colors::SEAFOAM);
    authButton.setColour(TextButton::textColourOffId, Colors::WHITE);

    addAndMakeVisible(authButton);

    addAndMakeVisible(statusLabel);
    statusLabel.setJustificationType(juce::Justification::centredRight);
    
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
    auto bounds = getLocalBounds().toFloat().reduced(10);

    juce::FlexBox loginLayout;
    loginLayout.flexDirection = juce::FlexBox::Direction::row;

    auto buttonWidth = 110.0f;

    loginLayout.items.add(
        juce::FlexItem(statusLabel)
            .withFlex(1.0f)
            .withMargin({0, 0, 0, 8}) // gap before button
    );

    loginLayout.items.add(
        juce::FlexItem(authButton)
            .withWidth(buttonWidth)
    );

    loginLayout.performLayout(bounds);
}

void LoginView::loadUserInfo()
{
    if (isLoadingUserInfo || userInfoLoadAttempted)
        return;

    isLoadingUserInfo = true;
    userInfoLoadAttempted = true;
    statusLabel.setText("Loading user info...", dontSendNotification);

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
            userInfoLoadAttempted = false;
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
        userInfoLoadAttempted = false;
        statusLabel.setText("", dontSendNotification);
    }
}

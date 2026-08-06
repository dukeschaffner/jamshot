#include "LoginView.h"
#include "../auth/AuthManager.h"
#include "../Colors.h"

using namespace juce;

//==============================================================================
LoginView::LoginView(Services& services)
    : authManagerRef(services.auth),
      apiClientRef(services.api)
{
    addAndMakeVisible(statusDot);
    addAndMakeVisible(statusLabel);
    statusLabel.setJustificationType(Justification::centredLeft);
    statusLabel.setColour(Label::textColourId, Colors::TEXT_SECONDARY);
    statusLabel.setFont(Font(UiMetrics::fontAuth, Font::plain));

    authButton.setButtonText("Log in to Sterio");
    SterioButtonStyle::apply(authButton, SterioButtonStyle::primary);
    authButton.onClick = [this] { authManagerRef.login(); };
    addAndMakeVisible(authButton);

    updateLoginState();
    startTimerHz(30);
}

LoginView::~LoginView()
{
    stopTimer();
}

void LoginView::timerCallback()
{
    updateLoginState();
}

void LoginView::paint(Graphics& g)
{
    g.fillAll(Colors::BACKGROUND);
    g.setColour(Colors::GREY_2);
    g.fillRect(0, getHeight() - 1, getWidth(), 1);
}

void LoginView::resized()
{
    auto bounds = getLocalBounds().reduced(UiMetrics::contentPadX, 7);

    const int btnW = authButton.getButtonText() == "Log in to Sterio" ? 128 : 72;
    const int btnH = 22;
    authButton.setBounds(bounds.removeFromRight(btnW)
                             .withSizeKeepingCentre(btnW, btnH));

    bounds.removeFromRight(UiMetrics::space3);

    if (statusDot.isVisible())
    {
        statusDot.setBounds(bounds.removeFromLeft(UiMetrics::statusDot)
                                  .withSizeKeepingCentre(UiMetrics::statusDot, UiMetrics::statusDot));
        bounds.removeFromLeft(7);
    }

    statusLabel.setBounds(bounds);
}

void LoginView::loadUserInfo()
{
    if (isLoadingUserInfo || userInfoLoadAttempted)
        return;

    isLoadingUserInfo = true;
    userInfoLoadAttempted = true;
    userInfoFailed = false;
    statusLabel.setText("Loading user info...", dontSendNotification);
    statusDot.setMode(StatusIndicator::Mode::Loading);
    resized();

    Thread::launch([this]() {
        auto result = apiClientRef.getMe();

        MessageManager::callAsync([this, result]() {
            isLoadingUserInfo = false;

            if (result.failed())
            {
                statusLabel.setText("Failed to load user info", dontSendNotification);
                currentUsername.clear();
                userInfoFailed = true;
                statusDot.setMode(StatusIndicator::Mode::Error);
            }
            else
            {
                const auto& userInfo = *result;
                currentUsername = userInfo.username;
                statusLabel.setText("Logged in as " + currentUsername, dontSendNotification);
                userInfoFailed = false;
                statusDot.setMode(StatusIndicator::Mode::Success);
            }
            resized();
        });
    });
}

void LoginView::updateLoginState()
{
    bool loggedIn = authManagerRef.isLoggedIn();

    if (loggedIn)
    {
        authButton.setButtonText("Log out");
        SterioButtonStyle::apply(authButton, SterioButtonStyle::standard);
        authButton.onClick = [this] {
            authManagerRef.logout();
            currentUsername.clear();
            userInfoLoadAttempted = false;
            userInfoFailed = false;
            statusLabel.setText("", dontSendNotification);
            statusDot.setMode(StatusIndicator::Mode::Hidden);
        };

        if (currentUsername.isEmpty() && !isLoadingUserInfo && !userInfoFailed)
        {
            loadUserInfo();
        }
        else if (isLoadingUserInfo)
        {
            statusDot.setMode(StatusIndicator::Mode::Loading);
        }
        else if (userInfoFailed)
        {
            statusDot.setMode(StatusIndicator::Mode::Error);
        }
        else if (currentUsername.isNotEmpty())
        {
            statusDot.setMode(StatusIndicator::Mode::Success);
        }
    }
    else
    {
        authButton.setButtonText("Log in to Sterio");
        SterioButtonStyle::apply(authButton, SterioButtonStyle::primary);
        authButton.onClick = [this] { authManagerRef.login(); };

        currentUsername.clear();
        userInfoLoadAttempted = false;
        userInfoFailed = false;
        statusLabel.setText("", dontSendNotification);
        statusDot.setMode(StatusIndicator::Mode::Hidden);
    }

    resized();
}

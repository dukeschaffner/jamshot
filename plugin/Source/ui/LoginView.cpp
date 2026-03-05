#include "LoginView.h"
#include "../auth/AuthManager.h"

//==============================================================================
LoginView::LoginView(AuthManager& authManager)
    : authManagerRef(authManager)
{
    loginButton.setButtonText("Log in to Sterio");
    loginButton.onClick = [this] { authManagerRef.login(); };
    addAndMakeVisible(loginButton);

    logoutButton.setButtonText("Log out");
    logoutButton.onClick = [this] { authManagerRef.logout(); };
    addAndMakeVisible(logoutButton);

    loginButton.setVisible(!authManagerRef.isLoggedIn());
    logoutButton.setVisible(authManagerRef.isLoggedIn());

    startTimerHz(30);
}

LoginView::~LoginView()
{
    stopTimer();
}

void LoginView::timerCallback()
{
    bool loggedIn = authManagerRef.isLoggedIn();
    if (loginButton.isVisible() == loggedIn)
    {
        loginButton.setVisible(!loggedIn);
        logoutButton.setVisible(loggedIn);
    }
}

void LoginView::paint(juce::Graphics& g)
{
    juce::ignoreUnused(g);
}

void LoginView::resized()
{
    auto r = getLocalBounds();
    auto buttonWidth = 120;
    auto gap = 10;

    loginButton.setBounds(r.removeFromLeft(buttonWidth));
    r.removeFromLeft(gap);
    logoutButton.setBounds(r.removeFromLeft(buttonWidth));
}

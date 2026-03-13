#include "MainContentComponent.h"
#include "../Colors.h"

MainContentComponent::MainContentComponent(Services& services)
    : authRef(services.auth),
      trackListPanel(services)
{
    authRef.addChangeListener(this);
    DBG(juce::String::formatted("AuthManager::sendChangeMessage() called for: %p", &authRef));

    addAndMakeVisible(trackListPanel);
    addAndMakeVisible(loginMessage);

    loginMessage.setText("Log in to view liked tracks", juce::dontSendNotification);
    loginMessage.setJustificationType(juce::Justification::centred);
    loginMessage.setColour(juce::Label::textColourId, Colors::GREY);

    updateView();
}

MainContentComponent::~MainContentComponent()
{
    authRef.removeChangeListener(this);
}

void MainContentComponent::updateView()
{
    bool loggedIn = authRef.isLoggedIn();
    if (loggedIn)
    {
        DBG("logged in");
    }
    else
    {
        DBG("logged out");
    }

    trackListPanel.setVisible(loggedIn);
    loginMessage.setVisible(!loggedIn);

    resized();
}

void MainContentComponent::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    DBG("MainContentComponent::changeListenerCallback() - AuthManager changed");
    updateView();
}

void MainContentComponent::resized()
{
    auto bounds = getLocalBounds();

    if (trackListPanel.isVisible())
        trackListPanel.setBounds(bounds);
    else
        loginMessage.setBounds(bounds);
}
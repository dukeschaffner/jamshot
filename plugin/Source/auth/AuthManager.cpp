#include "AuthManager.h"
#include "../api/ApiConfig.h"
#include <juce_data_structures/juce_data_structures.h>


//==============================================================================
AuthManager::AuthManager()
{
}

AuthManager::~AuthManager()
{
}

void AuthManager::loadTokens()
{
    auto propsFile = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
        .getChildFile("Sterio").getChildFile("plugin-auth.properties");
    propsFile.getParentDirectory().createDirectory();

    juce::PropertiesFile::Options opts;
    opts.applicationName = "Sterio";
    opts.osxLibrarySubFolder = "Application Support";
    opts.millisecondsBeforeSaving = -1;

    juce::PropertiesFile props(propsFile, opts);
    if (props.isValidFile())
    {
        const juce::ScopedLock sl(lock);
        accessToken = props.getValue("accessToken", {});
        refreshToken = props.getValue("refreshToken", {});
    }
}

bool AuthManager::isLoggedIn() const
{
    const juce::ScopedLock sl(lock);
    return accessToken.isNotEmpty();
}

void AuthManager::login()
{
    if (callbackServer && callbackServer->isRunning())
        return;

    callbackServer = std::make_unique<AuthCallbackServer>();
    callbackServer->setTokenCallback([this](const juce::String& at, const juce::String& rt)
    {
        onTokenReceived(at, rt);
    });

    int port = callbackServer->start(0);
    if (port <= 0)
        return;

    // Brief delay so the callback server thread is in waitForNextConnection()
    // before the browser loads and potentially redirects immediately.
    juce::Thread::sleep(150);

    juce::String authUrl = ApiConfig::getUIBaseUrl().trimEnd();
    if (authUrl.endsWith("/"))
        authUrl = authUrl.dropLastCharacters(1);
    juce::String authFullUrl = authUrl + "/plugin-auth?redirect_uri=http://127.0.0.1:"
        + juce::String(port) + "/callback";

    juce::URL(authFullUrl).launchInDefaultBrowser();
}

void AuthManager::logout()
{
    if (callbackServer && callbackServer->isRunning())
        callbackServer->stop();

    const juce::ScopedLock sl(lock);
    accessToken.clear();
    refreshToken.clear();
    saveTokens();
}

juce::String AuthManager::getAccessToken() const
{
    const juce::ScopedLock sl(lock);
    return accessToken;
}

void AuthManager::saveTokens()
{
    auto propsFile = juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
        .getChildFile("Sterio").getChildFile("plugin-auth.properties");
    propsFile.getParentDirectory().createDirectory();

    juce::PropertiesFile::Options opts;
    opts.applicationName = "Sterio";
    opts.osxLibrarySubFolder = "Application Support";
    opts.millisecondsBeforeSaving = -1;

    juce::PropertiesFile props(propsFile, opts);
    if (props.isValidFile())
    {
        const juce::ScopedLock sl(lock);
        props.setValue("accessToken", accessToken);
        props.setValue("refreshToken", refreshToken);
        props.save();
    }
}

void AuthManager::onTokenReceived(const juce::String& at, const juce::String& rt)
{
    {
        const juce::ScopedLock sl(lock);
        accessToken = at;
        refreshToken = rt;
    }
    saveTokens();

    if (callbackServer)
    {
        callbackServer->stop();
        callbackServer.reset();
    }
}

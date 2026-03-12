#include "ConnectionManager.h"

#include <regex>

ConnectionManager::ConnectionManager()
{
    // Server mode: no client setup needed here
}

ConnectionManager::~ConnectionManager()
{
    disconnect();
}

void ConnectionManager::connect(const std::string& url)
{
    // Parse URL like ws://host:port[/path]
    setStatus(Status::Connecting);

    try
    {
        std::string working = url;
        // remove protocol
        const std::string prefix1 = "ws://";
        const std::string prefix2 = "wss://";
        if (working.rfind(prefix1, 0) == 0)
            working = working.substr(prefix1.size());
        else if (working.rfind(prefix2, 0) == 0)
            working = working.substr(prefix2.size());

        // extract host and port
        // For server mode, we always bind to all interfaces (0.0.0.0)
        // The host in the URL is ignored for binding purposes
        std::string bindHost = "0.0.0.0";
        int port = 8080;

        // host[:port][...]
        size_t colonPos = working.find(':');
        size_t slashPos = working.find('/');
        if (colonPos != std::string::npos)
        {
            // Skip host parsing - we always bind to 0.0.0.0 for server mode
            size_t portStart = colonPos + 1;
            size_t portEnd = (slashPos == std::string::npos) ? working.size() : slashPos;
            std::string portStr = working.substr(portStart, portEnd - portStart);
            port = std::stoi(portStr);
        }

        webSocketServer = std::make_unique<ix::WebSocketServer>(port, bindHost);

        // When a client connects, register its message callback to forward messages
        webSocketServer->setOnConnectionCallback(
            [this](std::weak_ptr<ix::WebSocket> clientWeak, std::shared_ptr<ix::ConnectionState> connState)
            {
                auto client = clientWeak.lock();
                if (!client) return;

                client->setOnMessageCallback([this, client, connState](const ix::WebSocketMessagePtr& msg)
                {
                    // forward to app callback
                    if (msg->type == ix::WebSocketMessageType::Message)
                    {
                        juce::ScopedLock lock(callbackLock);
                        if (messageCallback)
                            messageCallback(msg->str);
                    }
                });
            });

        bool ok = webSocketServer->listenAndStart();
        if (!ok)
        {
            setStatus(Status::Error, "Failed to bind/listen");
            webSocketServer.reset();
            return;
        }

        setStatus(Status::Connected, "Server listening");
    }
    catch (const std::exception& ex)
    {
        setStatus(Status::Error, ex.what());
    }
}

void ConnectionManager::disconnect()
{
    if (webSocketServer)
    {
        webSocketServer->stop();
        webSocketServer.reset();
    }
    setStatus(Status::Disconnected);
}

bool ConnectionManager::send(const std::string& message)
{
    if (!webSocketServer)
        return false;

    bool sent = false;
    auto clients = webSocketServer->getClients();
    for (auto& c : clients)
    {
        if (c)
        {
            c->send(message);
            sent = true;
        }
    }

    return sent;
}

void ConnectionManager::onMessage(MessageCallback cb)
{
    juce::ScopedLock lock(callbackLock);
    messageCallback = std::move(cb);
}

void ConnectionManager::onStatusChange(StatusCallback cb)
{
    juce::ScopedLock lock(callbackLock);
    statusCallback = std::move(cb);
}

ConnectionManager::Status ConnectionManager::getStatus() const
{
    return currentStatus.load();
}


void ConnectionManager::setStatus(Status status, const std::string& reason)
{
    currentStatus = status;

    juce::ScopedLock lock(callbackLock);
    if (statusCallback)
        statusCallback(status, reason);
}
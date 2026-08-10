#include "ConnectionManager.h"

#include <regex>


#ifdef _WIN32
#include <winsock2.h>
#include <mutex>

void ensureWinsockInitialized()
{
    static std::once_flag flag;

    std::call_once(flag, []()
    {
        WSADATA wsaData;
        int res = WSAStartup(MAKEWORD(2, 2), &wsaData);
        if (res != 0)
        {
            DBG("WSAStartup failed: " + juce::String(res));
        }
    });
}
#endif

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

    #ifdef _WIN32
        ensureWinsockInitialized();
    #endif

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
        int port = 59327;

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
            [this](std::weak_ptr<ix::WebSocket> clientWeak, std::shared_ptr<ix::ConnectionState> /*connState*/)
            {
                auto client = clientWeak.lock();
                if (!client) return;

                auto closed = std::make_shared<std::atomic<bool>>(false);

                client->setOnMessageCallback([this, closed](const ix::WebSocketMessagePtr& msg)
                {
                    if (msg->type == ix::WebSocketMessageType::Message)
                    {
                        juce::ScopedLock lock(callbackLock);
                        if (messageCallback)
                            messageCallback(msg->str);
                        return;
                    }

                    if (msg->type == ix::WebSocketMessageType::Close
                        || msg->type == ix::WebSocketMessageType::Error)
                    {
                        if (closed->exchange(true))
                            return;
                        noteClientDisconnected();
                    }
                });

                noteClientConnected();

                // Announce current plugin state directly to this client (avoid
                // racing getClients() before the connection is fully registered).
                ClientConnectedCallback connectedCb;
                {
                    juce::ScopedLock lock(callbackLock);
                    connectedCb = clientConnectedCallback;
                }
                if (connectedCb)
                {
                    const std::string hello = connectedCb();
                    if (!hello.empty())
                        client->send(hello);
                }
            });

        auto res = webSocketServer->listen();
        if (!res.first)
        {
            setStatus(Status::Error, res.second);
            return;
        }

        webSocketServer->start();

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
    resetClientPresence();
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

void ConnectionManager::onClientConnected(ClientConnectedCallback cb)
{
    juce::ScopedLock lock(callbackLock);
    clientConnectedCallback = std::move(cb);
}

void ConnectionManager::onClientPresenceChange(ClientPresenceCallback cb)
{
    juce::ScopedLock lock(callbackLock);
    clientPresenceCallback = std::move(cb);
}

ConnectionManager::Status ConnectionManager::getStatus() const
{
    return currentStatus.load();
}

bool ConnectionManager::hasWebClients() const
{
    return webClientCount.load() > 0;
}

juce::String ConnectionManager::getLastErrorReason() const
{
    juce::ScopedLock lock(callbackLock);
    return lastErrorReason;
}

void ConnectionManager::setStatus(Status status, const std::string& reason)
{
    currentStatus = status;

    {
        juce::ScopedLock lock(callbackLock);
        if (status == Status::Error)
            lastErrorReason = juce::String(reason);
        else if (status == Status::Disconnected || status == Status::Connected)
            lastErrorReason = {};
    }

    juce::ScopedLock lock(callbackLock);
    if (statusCallback)
        statusCallback(status, reason);
}

void ConnectionManager::noteClientConnected()
{
    const bool previouslyHadClients = webClientCount.load() > 0;
    webClientCount.fetch_add(1);
    notifyPresenceIfChanged(previouslyHadClients);
}

void ConnectionManager::noteClientDisconnected()
{
    const bool previouslyHadClients = webClientCount.load() > 0;
    int previous = webClientCount.load();
    while (previous > 0)
    {
        if (webClientCount.compare_exchange_weak(previous, previous - 1))
            break;
    }
    notifyPresenceIfChanged(previouslyHadClients);
}

void ConnectionManager::resetClientPresence()
{
    const bool previouslyHadClients = webClientCount.exchange(0) > 0;
    notifyPresenceIfChanged(previouslyHadClients);
}

void ConnectionManager::notifyPresenceIfChanged(bool previouslyHadClients)
{
    const bool nowHasClients = webClientCount.load() > 0;
    if (previouslyHadClients == nowHasClients)
        return;

    ClientPresenceCallback presenceCb;
    {
        juce::ScopedLock lock(callbackLock);
        presenceCb = clientPresenceCallback;
    }
    if (presenceCb)
        presenceCb(nowHasClients);
}

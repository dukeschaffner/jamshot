#pragma once

#include <juce_core/juce_core.h>
#include <ixwebsocket/IXWebSocket.h>
#include <ixwebsocket/IXWebSocketServer.h>
#include <functional>
#include <string>

class ConnectionManager
{
public:
    enum class Status { Disconnected, Connecting, Connected, Error };

    using MessageCallback = std::function<void(const std::string& message)>;
    using StatusCallback  = std::function<void(Status status, const std::string& reason)>;

    ConnectionManager();
    ~ConnectionManager();

    // Connect/disconnect
    void connect(const std::string& url);
    void disconnect();

    // Send a message (safe to call from any thread)
    bool send(const std::string& message);

    // Register callbacks (call before connect)
    void onMessage(MessageCallback cb);
    void onStatusChange(StatusCallback cb);

    Status getStatus() const;

private:
    void setStatus(Status status, const std::string& reason = {});

    // When acting as a server we manage a WebSocketServer instance
    std::unique_ptr<ix::WebSocketServer> webSocketServer;

    std::atomic<Status> currentStatus { Status::Disconnected };

    MessageCallback messageCallback;
    StatusCallback  statusCallback;

    // Protects callbacks from being replaced mid-call
    juce::CriticalSection callbackLock;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ConnectionManager)
};
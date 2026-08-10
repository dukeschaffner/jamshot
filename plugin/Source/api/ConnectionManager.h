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
    /** Returns a hello/status payload to send only to the newly connected client. */
    using ClientConnectedCallback = std::function<std::string()>;
    /** Fired when the first web client connects or the last web client disconnects. */
    using ClientPresenceCallback = std::function<void(bool hasClients)>;

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
    void onClientConnected(ClientConnectedCallback cb);
    void onClientPresenceChange(ClientPresenceCallback cb);

    Status getStatus() const;
    bool hasWebClients() const;
    juce::String getLastErrorReason() const;

private:
    void setStatus(Status status, const std::string& reason = {});
    void noteClientConnected();
    void noteClientDisconnected();
    void resetClientPresence();
    void notifyPresenceIfChanged(bool previouslyHadClients);

    // When acting as a server we manage a WebSocketServer instance
    std::unique_ptr<ix::WebSocketServer> webSocketServer;

    std::atomic<Status> currentStatus { Status::Disconnected };
    std::atomic<int> webClientCount { 0 };

    MessageCallback messageCallback;
    StatusCallback  statusCallback;
    ClientConnectedCallback clientConnectedCallback;
    ClientPresenceCallback clientPresenceCallback;

    // Protects callbacks from being replaced mid-call
    mutable juce::CriticalSection callbackLock;
    juce::String lastErrorReason;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ConnectionManager)
};

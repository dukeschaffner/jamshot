#pragma once
#include <vector>
#include <memory>
#include <atomic>
#include <string>
#include <iostream> // for DBG/debugging

struct PluginMessage {
    enum class Severity { Info, Warning, Error, Critical };
    Severity severity;
    juce::String content;
    juce::String sourceModule;
    std::chrono::system_clock::time_point timestamp;
};

class MessageStore
{
public:
    // Singleton access
    static MessageStore& getInstance()
    {
        static MessageStore instance;
        return instance;
    }

    // Delete copy/move
    MessageStore(const MessageStore&) = delete;
    MessageStore(MessageStore&&) = delete;
    MessageStore& operator=(const MessageStore&) = delete;
    MessageStore& operator=(MessageStore&&) = delete;

    // Push a new message (thread-safe, lock-free)
    void pushMessage(const PluginMessage& msg)
    {
        auto oldPtr = std::atomic_load(&messages);
        auto newVec = std::make_shared<std::vector<PluginMessage>>(*oldPtr);
        newVec->push_back(msg);
        std::atomic_store(&messages, newVec);
    }

    void setDebugMode(bool enable) { debugMode.store(enable); }
    bool isDebugMode() const { return debugMode.load(); }

    void pushDebugMessage(const PluginMessage& msg)
    {
        if (debugMode.load())
            pushMessage(msg); // reuse your normal push
    }

    // Get all messages and clear (thread-safe, lock-free)
    std::shared_ptr<std::vector<PluginMessage>> getNewMessages()
    {
        auto emptyVec = std::make_shared<std::vector<PluginMessage>>();
        return std::atomic_exchange(&messages, emptyVec);
    }

private:
    MessageStore() : messages(std::make_shared<std::vector<PluginMessage>>()) {}

    // Atomic pointer to the vector
    std::shared_ptr<std::vector<PluginMessage>> messages;
    std::atomic<bool> debugMode { false };
};
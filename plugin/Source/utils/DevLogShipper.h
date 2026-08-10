#pragma once

#include <juce_core/juce_core.h>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

/** Fire-and-forget shipper for MessageStore → local dev-log-server (debug builds). */
class DevLogShipper
{
public:
    static DevLogShipper& getInstance()
    {
        static DevLogShipper instance;
        return instance;
    }

    DevLogShipper(const DevLogShipper&) = delete;
    DevLogShipper& operator=(const DevLogShipper&) = delete;

    void ship(const juce::String& level, const juce::String& message);

private:
    DevLogShipper();
    ~DevLogShipper();

    struct PendingLog
    {
        juce::String level;
        juce::String message;
    };

    void workerLoop();
    void postLog(const PendingLog& entry);

    std::mutex mutex;
    std::condition_variable cv;
    std::deque<PendingLog> queue;
    std::atomic<bool> running { true };
    std::thread worker;
};

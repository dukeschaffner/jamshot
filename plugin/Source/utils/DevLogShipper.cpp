#include "DevLogShipper.h"
#include "../Config.h"

DevLogShipper::DevLogShipper()
{
    worker = std::thread([this] { workerLoop(); });
}

DevLogShipper::~DevLogShipper()
{
    {
        std::lock_guard<std::mutex> lock(mutex);
        running.store(false);
    }
    cv.notify_all();
    if (worker.joinable())
        worker.join();
}

void DevLogShipper::ship(const juce::String& level, const juce::String& message)
{
    {
        std::lock_guard<std::mutex> lock(mutex);
        // Cap queue so a dead log server cannot unbounded-grow memory
        if (queue.size() >= 500)
            queue.pop_front();
        queue.push_back({ level, message });
    }
    cv.notify_one();
}

void DevLogShipper::workerLoop()
{
    while (true)
    {
        PendingLog entry;
        {
            std::unique_lock<std::mutex> lock(mutex);
            cv.wait(lock, [this] { return !queue.empty() || !running.load(); });

            if (!running.load() && queue.empty())
                return;

            entry = std::move(queue.front());
            queue.pop_front();
        }

        postLog(entry);
    }
}

void DevLogShipper::postLog(const PendingLog& entry)
{
    try
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("source", "Plugin");
        obj->setProperty("level", entry.level);
        obj->setProperty("message", entry.message);
        obj->setProperty("ts", juce::Time::getCurrentTime().toString(true, true, true, true));

        const juce::String body = juce::JSON::toString(juce::var(obj));

        juce::URL url(Config::DevLog::getBaseUrl() + "/log");
        url = url.withPOSTData(body);

        const int timeoutMs = 1500;
        int statusCode = 0;
        auto options = juce::URL::InputStreamOptions(juce::URL::ParameterHandling::inPostData)
                           .withHttpRequestCmd("POST")
                           .withExtraHeaders("Content-Type: application/json\r\n")
                           .withConnectionTimeoutMs(timeoutMs)
                           .withStatusCode(&statusCode);

        // Fire-and-forget: ignore failures (log server may not be running)
        std::unique_ptr<juce::InputStream> stream(url.createInputStream(options));
        juce::ignoreUnused(stream, statusCode);
    }
    catch (...)
    {
        // Swallow all errors — logging must never affect plugin behavior
    }
}

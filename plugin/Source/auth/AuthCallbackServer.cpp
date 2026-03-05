#include "AuthCallbackServer.h"
#include <juce_events/juce_events.h>
#include <thread>

//==============================================================================
AuthCallbackServer::AuthCallbackServer()
{
}

AuthCallbackServer::~AuthCallbackServer()
{
    stop();
}

int AuthCallbackServer::start(int requestedPort)
{
    if (running)
        return port;

    int portToUse = requestedPort;
    if (portToUse <= 0)
    {
        // Use a random port in the dynamic range (49152-65535)
        juce::Random r;
        portToUse = 49152 + r.nextInt(16384);
    }

    if (listenerSocket.createListener(portToUse, "127.0.0.1"))
    {
        port = listenerSocket.getBoundPort();
        DBG("AuthCallbackServer started on port: " << port);
        running = true;
        serverThread = std::make_unique<std::thread>([this] { runServer(); });
        return port;
    } else {
        DBG("AuthCallbackServer failed to start on port: " << portToUse);
    }

    return 0;
}

void AuthCallbackServer::stop()
{
    running = false;
    listenerSocket.close();
    DBG("AuthCallbackServer stopped");

    if (serverThread && serverThread->joinable())
    {
        serverThread->join();
        serverThread.reset();
    }

    port = 0;
}

void AuthCallbackServer::runServer()
{
    while (running && listenerSocket.isConnected())
    {
        if (auto* client = listenerSocket.waitForNextConnection())
        {
            juce::MemoryBlock buffer(4096);
            int totalRead = 0;
            bool headersComplete = false;

            // Read headers first
            while (client->isConnected() && totalRead < 4096 && !headersComplete)
            {
                int n = client->read(static_cast<char*>(buffer.getData()) + totalRead, (int) buffer.getSize() - totalRead, false);
                if (n > 0)
                {
                    totalRead += n;
                    // Check if we have the end of headers (\r\n\r\n)
                    juce::String currentData(static_cast<const char*>(buffer.getData()), (size_t) totalRead);
                    if (currentData.contains("\r\n\r\n"))
                    {
                        headersComplete = true;
                    }
                }
                else if (n == 0)
                {
                    // No data available, wait a bit
                    juce::Thread::sleep(10);
                }
                else
                {
                    // Error or connection closed
                    break;
                }
            }

            juce::String request(static_cast<const char*>(buffer.getData()), (size_t) totalRead);
            DBG("AuthCallbackServer received request: " << request);
            juce::String accessToken, refreshToken;

            // Parse "GET /callback?access_token=...&refresh_token=... HTTP/1.1"
            int pathStart = request.indexOf("GET ");
            if (pathStart >= 0)
            {
                pathStart += 4;
                int pathEnd = request.indexOf(pathStart, " ");
                if (pathEnd > pathStart)
                {
                    juce::String pathAndQuery = request.substring(pathStart, pathEnd);
                    int queryStart = pathAndQuery.indexOf("?");
                    if (queryStart >= 0)
                    {
                        juce::String query = pathAndQuery.substring(queryStart + 1);
                        juce::URL dummy("http://x?" + query);
                        const auto& names = dummy.getParameterNames();
                        const auto& values = dummy.getParameterValues();
                        for (int i = 0; i < names.size() && i < values.size(); ++i)
                        {
                            if (names[i] == "access_token")
                                accessToken = values[i];
                            else if (names[i] == "refresh_token")
                                refreshToken = values[i];
                        }
                        DBG("Parsed tokens - access: " << accessToken << ", refresh: " << refreshToken);
                    }
                }
            }

            // Send response
            juce::String response;
            if (accessToken.isNotEmpty())
            {
                response = "HTTP/1.1 200 OK\r\n"
                           "Content-Type: text/html; charset=utf-8\r\n"
                           "Access-Control-Allow-Origin: *\r\n"
                           "Connection: close\r\n"
                           "\r\n"
                           "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sterio</title></head>"
                           "<body style=\"font-family:system-ui;display:flex;align-items:center;justify-content:center;"
                           "min-height:100vh;margin:0;background:#1a1a1a;color:#fff;\">"
                           "<p style=\"font-size:18px;\">Logged in successfully. You can close this window.</p>"
                           "</body></html>";
            }
            else
            {
                response = "HTTP/1.1 400 Bad Request\r\n"
                           "Content-Type: text/html; charset=utf-8\r\n"
                           "Access-Control-Allow-Origin: *\r\n"
                           "Connection: close\r\n"
                           "\r\n"
                           "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Sterio</title></head>"
                           "<body style=\"font-family:system-ui;display:flex;align-items:center;justify-content:center;"
                           "min-height:100vh;margin:0;background:#1a1a1a;color:#fff;\">"
                           "<p style=\"font-size:18px;color:#f44;\">Login failed. Please try again.</p>"
                           "</body></html>";
            }

            client->write(response.toRawUTF8(), (int) response.getNumBytesAsUTF8());
            delete client;

            if (accessToken.isNotEmpty())
            {
                TokenCallback cb;
                {
                    const juce::ScopedLock sl(callbackLock);
                    cb = tokenCallback;
                }
                if (cb)
                {
                    DBG("Invoking token callback with tokens");
                    juce::MessageManager::callAsync([cb, accessToken, refreshToken]
                    {
                        cb(accessToken, refreshToken);
                    });
                }
                else
                {
                    DBG("No token callback set!");
                }
            }

            // One-shot: stop after first request
            break;
        }
    }

    running = false;
}

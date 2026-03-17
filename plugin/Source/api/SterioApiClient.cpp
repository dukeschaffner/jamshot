#include "SterioApiClient.h"
#include "../auth/AuthManager.h"
#include "../utils/JsonUtils.h"
#include "../utils/PluginMetaHelper.h"

using namespace juce;

//==============================================================================
SterioApiClient::SterioApiClient(AuthManager& authManagerRef)
    : authManager(authManagerRef)
    , baseUrl(ApiConfig::getBaseUrl())
{
}

SterioApiClient::~SterioApiClient()
{
}

void SterioApiClient::handleSessionExpired()
{
    DBG("Session expired - clearing access token and logging out");
    authManager.logout();
}

ApiResult<UserInfo> SterioApiClient::getMe()
{
    String accessToken = authManager.getAccessToken();
    if (accessToken.isEmpty())
    {
        return ApiResult<UserInfo>::fail("No access token set");
    }

    auto result = makeAuthenticatedGetRequest("/users/me");
    if (result.failed())
    {
        return ApiResult<UserInfo>::fail(result.getErrorMessage());
    }

    try
    {
        UserInfo userInfo = parseUserInfo(*result);
        return ApiResult<UserInfo>::ok(userInfo);
    }
    catch (const std::exception& e)
    {
        return ApiResult<UserInfo>::fail("Failed to parse user info: " + String(e.what()));
    }
}

ApiResult<LikedTracksResponse> SterioApiClient::getLikedTracks(const String& username,
                                                           int page,
                                                           int limit)
{
    DBG("Getting liked tracks for username: " + username);
    String accessToken = authManager.getAccessToken();
    if (accessToken.isEmpty())
    {
        return ApiResult<LikedTracksResponse>::fail("No access token set");
    }

    String endpoint = "/users/" + username + "/liked?page=" +
                      String(page) + "&limit=" + String(limit);

    auto result = makeAuthenticatedGetRequest(endpoint);
    if (result.failed())
    {
        return ApiResult<LikedTracksResponse>::fail(result.getErrorMessage());
    }

    try
    {
        LikedTracksResponse response = parseLikedTracksResponse(*result);
        return ApiResult<LikedTracksResponse>::ok(response);
    }
    catch (const std::exception& e)
    {
        return ApiResult<LikedTracksResponse>::fail("Failed to parse liked tracks: " + String(e.what()));
    }
}

ApiResult<var> SterioApiClient::makeAuthenticatedGetRequest(const String& endpoint)
{
    // Construct URL by appending endpoint to base URL
    String fullUrl = baseUrl.toString(true);
    if (!fullUrl.endsWithChar('/'))
        fullUrl += '/';
    if (endpoint.startsWithChar('/'))
        fullUrl += endpoint.substring(1);
    else
        fullUrl += endpoint;

    URL url(fullUrl);

    String accessToken = authManager.getAccessToken();
    if (accessToken.isEmpty())
    {
        return ApiResult<var>::fail("No access token set");
    }

    String pluginMetaHeader = PluginMetaHelper::getInstance().GetPluginMetaHeader();

    String headers = 
        "Authorization: Bearer " + accessToken + "\r\n" +
        "User-Agent: " + ApiConfig::getUserAgent() + "\r\n" +
        "RequireAuth: true\r\n" +
        "X-Plugin-Meta: " + pluginMetaHeader + "\r\n";

    // Create HTTP request
    int httpStatus = 0;
    URL::InputStreamOptions options = URL::InputStreamOptions(URL::ParameterHandling::inAddress)
        .withHttpRequestCmd("GET")
        .withExtraHeaders(headers)
        .withConnectionTimeoutMs(ApiConfig::getRequestTimeoutMs())
        .withStatusCode(&httpStatus);

    // Make the request
    std::unique_ptr<InputStream> stream(url.createInputStream(options));
    if (stream == nullptr)
    {
        return ApiResult<var>::fail("Failed to create HTTP request stream");
    }

    // Read response
    String responseText = stream->readEntireStreamAsString();

    if (httpStatus >= 400)
    {
        
        // Check if this is an authentication error that should trigger logout
        var errorJson;
        if (JSON::parse(responseText, errorJson).wasOk())
        {
            String errorCode = errorJson.getProperty("code", "").toString();
            if (errorCode == "AUTHENTICATION_REQUIRED")
            {
                handleSessionExpired();
            }
        }

        return ApiResult<var>::fail("HTTP " + String(httpStatus) + ": " + responseText);
    }

    // Parse JSON
    var json;
    if (!JSON::parse(responseText, json).wasOk())
    {
        return ApiResult<var>::fail("Failed to parse JSON response: " + responseText);
    }

    PluginMetaHelper::getInstance().SetLatestPluginVersionIfPresent(json);
    return ApiResult<var>::ok(json);
}

UserInfo SterioApiClient::parseUserInfo(const var& json)
{
    UserInfo info;
    info.id = json.getProperty("id", "").toString();
    info.username = json.getProperty("username", "").toString();
    info.name = json.getProperty("name", "").toString();
    info.email = json.getProperty("email", "").toString();

    return info;
}

LikedTracksResponse SterioApiClient::parseLikedTracksResponse(const var& json)
{
    LikedTracksResponse response;

    // Parse tracks array
    var tracksArray = json.getProperty("tracks", var());
    if (tracksArray.isArray())
    {
        for (int i = 0; i < tracksArray.size(); ++i)
        {
            var trackJson = tracksArray[i];
            TrackInfo track = JsonUtils::parseTrackInfo(trackJson);
            response.tracks.add(track);
        }
    }
    else
    {
        throw std::runtime_error("No tracks array found in response");
    }

    // Parse pagination
    var paginationJson = json.getProperty("pagination", var());
    response.pagination.page = paginationJson.getProperty("page", 1);
    response.pagination.limit = paginationJson.getProperty("limit", 15);
    response.pagination.total = paginationJson.getProperty("total", 0);
    response.pagination.hasMore = paginationJson.getProperty("hasMore", false);

    return response;
}

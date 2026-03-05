#include "SterioApiClient.h"

using namespace juce;

//==============================================================================
SterioApiClient::SterioApiClient()
    : baseUrl(ApiConfig::getBaseUrl())
{
    DBG("SterioApiClient created with base URL: " << baseUrl.toString(true));
}

SterioApiClient::~SterioApiClient()
{
    DBG("SterioApiClient destroyed");
}

void SterioApiClient::setAccessToken(const String& token)
{
    if (accessToken != token)
    {
        accessToken = token;
        DBG("Access token set (length: " << token.length() << ")");
    }
}

ApiResult<UserInfo> SterioApiClient::getMe()
{
    DBG("getMe() called");

    if (accessToken.isEmpty())
    {
        DBG("getMe() failed: No access token set");
        return ApiResult<UserInfo>::fail("No access token set");
    }

    DBG("getMe() making request to /users/me");
    auto result = makeAuthenticatedGetRequest("/users/me");
    if (result.failed())
    {
        DBG("getMe() request failed: " << result.getErrorMessage());
        return ApiResult<UserInfo>::fail(result.getErrorMessage());
    }

    try
    {
        DBG("getMe() parsing user info response");
        UserInfo userInfo = parseUserInfo(*result);
        DBG("getMe() success: user=" << userInfo.username << ", name=" << userInfo.name);
        return ApiResult<UserInfo>::ok(userInfo);
    }
    catch (const std::exception& e)
    {
        DBG("getMe() parsing failed: " << e.what());
        return ApiResult<UserInfo>::fail("Failed to parse user info: " + String(e.what()));
    }
}

ApiResult<LikedTracksResponse> SterioApiClient::getLikedTracks(const String& username,
                                                           int page,
                                                           int limit)
{
    DBG("getLikedTracks() called for user=" << username << ", page=" << page << ", limit=" << limit);

    if (accessToken.isEmpty())
    {
        DBG("getLikedTracks() failed: No access token set");
        return ApiResult<LikedTracksResponse>::fail("No access token set");
    }

    String endpoint = "/users/" + username + "/liked?page=" +
                      String(page) + "&limit=" + String(limit);
    DBG("getLikedTracks() endpoint: " << endpoint);

    auto result = makeAuthenticatedGetRequest(endpoint);
    if (result.failed())
    {
        DBG("getLikedTracks() request failed: " << result.getErrorMessage());
        return ApiResult<LikedTracksResponse>::fail(result.getErrorMessage());
    }

    try
    {
        DBG("getLikedTracks() parsing response");
        LikedTracksResponse response = parseLikedTracksResponse(*result);
        DBG("getLikedTracks() success: " << response.tracks.size() << " tracks, page=" << response.pagination.page <<
            ", total=" << response.pagination.total << ", hasMore=" << (response.pagination.hasMore ? "true" : "false"));
        return ApiResult<LikedTracksResponse>::ok(response);
    }
    catch (const std::exception& e)
    {
        DBG("getLikedTracks() parsing failed: " << e.what());
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
    DBG("makeAuthenticatedGetRequest() URL: " << url.toString(true));

    // Create HTTP request
    int httpStatus = 0;
    URL::InputStreamOptions options = URL::InputStreamOptions(URL::ParameterHandling::inAddress)
        .withHttpRequestCmd("GET")
        .withExtraHeaders("Authorization: Bearer " + accessToken + "\r\nUser-Agent: " + ApiConfig::getUserAgent())
        .withConnectionTimeoutMs(ApiConfig::getRequestTimeoutMs())
        .withStatusCode(&httpStatus);

    DBG("makeAuthenticatedGetRequest() making HTTP GET request");
    // Make the request
    std::unique_ptr<InputStream> stream(url.createInputStream(options));
    if (stream == nullptr)
    {
        DBG("makeAuthenticatedGetRequest() failed: Could not create HTTP request stream");
        return ApiResult<var>::fail("Failed to create HTTP request stream");
    }

    // Read response
    String responseText = stream->readEntireStreamAsString();
    DBG("makeAuthenticatedGetRequest() HTTP status: " << httpStatus << ", response length: " << responseText.length());

    if (httpStatus != 200)
    {
        DBG("makeAuthenticatedGetRequest() failed: HTTP " << httpStatus << " - " << responseText.substring(0, 200));
        return ApiResult<var>::fail("HTTP " + String(httpStatus) + ": " + responseText);
    }

    // Parse JSON
    var json;
    if (!JSON::parse(responseText, json).wasOk())
    {
        DBG("makeAuthenticatedGetRequest() failed: JSON parse error");
        return ApiResult<var>::fail("Failed to parse JSON response: " + responseText);
    }

    DBG("makeAuthenticatedGetRequest() success: JSON parsed successfully");
    return ApiResult<var>::ok(json);
}

UserInfo SterioApiClient::parseUserInfo(const var& json)
{
    DBG("parseUserInfo() parsing JSON response");

    UserInfo info;
    info.id = json.getProperty("id", "").toString();
    info.username = json.getProperty("username", "").toString();
    info.name = json.getProperty("name", "").toString();
    info.email = json.getProperty("email", "").toString();

    DBG("parseUserInfo() parsed: id=" << info.id << ", username=" << info.username <<
        ", name=" << info.name << ", email=" << info.email);

    return info;
}

LikedTracksResponse SterioApiClient::parseLikedTracksResponse(const var& json)
{
    DBG("parseLikedTracksResponse() parsing JSON response");

    LikedTracksResponse response;

    // Parse tracks array
    var tracksArray = json.getProperty("tracks", var());
    if (tracksArray.isArray())
    {
        DBG("parseLikedTracksResponse() found " << tracksArray.size() << " tracks");
        for (int i = 0; i < tracksArray.size(); ++i)
        {
            var trackJson = tracksArray[i];
            TrackInfo track;
            track.id = trackJson.getProperty("id", "").toString();
            track.title = trackJson.getProperty("title", "").toString();
            track.username = trackJson.getProperty("username", "").toString();
            track.duration = trackJson.getProperty("duration", "").toString();
            track.createdAt = trackJson.getProperty("created_at", "").toString();
            response.tracks.add(track);

            if (i < 3) // Log first 3 tracks for brevity
            {
                DBG("parseLikedTracksResponse() track[" << i << "]: " << track.title << " by " << track.username);
            }
        }
    }
    else
    {
        DBG("parseLikedTracksResponse() no tracks array found in response");
    }

    // Parse pagination
    var paginationJson = json.getProperty("pagination", var());
    response.pagination.page = paginationJson.getProperty("page", 1);
    response.pagination.limit = paginationJson.getProperty("limit", 15);
    response.pagination.total = paginationJson.getProperty("total", 0);
    response.pagination.hasMore = paginationJson.getProperty("hasMore", false);

    DBG("parseLikedTracksResponse() pagination: page=" << response.pagination.page <<
        ", limit=" << response.pagination.limit << ", total=" << response.pagination.total <<
        ", hasMore=" << (response.pagination.hasMore ? "true" : "false"));

    return response;
}
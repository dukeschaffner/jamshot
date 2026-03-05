#pragma once

#include <juce_core/juce_core.h>
#include "ApiConfig.h"

//==============================================================================
/** A simple Result type that can hold either a value or an error. */
template<typename T>
class ApiResult
{
public:
    /** Create a successful result with a value. */
    static ApiResult<T> ok(const T& value) { return ApiResult<T>(value); }

    /** Create a failed result with an error message. */
    static ApiResult<T> fail(const juce::String& error) { return ApiResult<T>(error); }

    /** Returns true if this result contains a value. */
    bool wasOk() const { return success; }

    /** Returns true if this result contains an error. */
    bool failed() const { return !success; }

    /** Allow implicit conversion to bool for success checking. */
    operator bool() const { return success; }

    /** Get the value. Only call this if wasOk() returns true. */
    const T& operator*() const { return *value; }

    /** Get the error message. Only call this if failed() returns true. */
    const juce::String& getErrorMessage() const { return errorMessage; }

private:
    ApiResult(const T& val) : success(true), value(val) {}
    ApiResult(const juce::String& err) : success(false), errorMessage(err) {}

    bool success = false;
    std::optional<T> value;
    juce::String errorMessage;
};

//==============================================================================
/** Represents a user returned from /users/me */
struct UserInfo
{
    juce::String id;
    juce::String username;
    juce::String name;
    juce::String email;
};

//==============================================================================
/** Represents a track returned from the API */
struct TrackInfo
{
    juce::String id;
    juce::String title;
    juce::String username; // Artist username
    juce::String duration; // Optional
    juce::String createdAt; // Optional
};

//==============================================================================
/** Represents pagination info for liked tracks */
struct PaginationInfo
{
    int page = 1;
    int limit = 15;
    int total = 0;
    bool hasMore = false;
};

//==============================================================================
/** Response from getLikedTracks API call */
struct LikedTracksResponse
{
    juce::Array<TrackInfo> tracks;
    PaginationInfo pagination;
};

//==============================================================================
/** Sterio API client for making authenticated HTTP requests. */
class SterioApiClient
{
public:
    SterioApiClient();
    ~SterioApiClient();

    /** Set the access token for authenticated requests. */
    void setAccessToken(const juce::String& token);

    /** Get current user info. Returns empty UserInfo on failure. */
    ApiResult<UserInfo> getMe();

    /** Get liked tracks for a user. Returns empty response on failure. */
    ApiResult<LikedTracksResponse> getLikedTracks(const juce::String& username,
                                                     int page = 1,
                                                     int limit = 15);

private:
    /** Make an authenticated HTTP GET request. */
    ApiResult<juce::var> makeAuthenticatedGetRequest(const juce::String& endpoint);

    /** Parse UserInfo from JSON response. */
    UserInfo parseUserInfo(const juce::var& json);

    /** Parse LikedTracksResponse from JSON response. */
    LikedTracksResponse parseLikedTracksResponse(const juce::var& json);

    juce::String accessToken;
    juce::URL baseUrl;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SterioApiClient)
};
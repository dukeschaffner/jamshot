#pragma once

#include "auth/AuthManager.h"
#include "api/SterioApiClient.h"
#include "CacheManager.h"
#include "api/TrackLoader.h"

//==============================================================================
struct Services
{
    AuthManager& auth;
    SterioApiClient& api;
    CacheManager& cache;
    TrackLoader& trackLoader;
};
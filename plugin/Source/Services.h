#pragma once

#include "auth/AuthManager.h"
#include "api/SterioApiClient.h"
#include "CacheManager.h"
#include "api/TrackLoader.h"
#include "PluginState.h"

//==============================================================================
struct Services
{
    AuthManager& auth;
    SterioApiClient& api;
    CacheManager& cache;
    TrackLoader& trackLoader;
    PluginState& pluginState;
};
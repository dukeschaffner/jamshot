#pragma once

#include "auth/AuthManager.h"
#include "api/SterioApiClient.h"
#include "CacheManager.h"

//==============================================================================
struct Services
{
    AuthManager& auth;
    SterioApiClient& api;
    CacheManager& cache;
};
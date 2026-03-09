#pragma once

//==============================================================================
/** Transport state read from the host DAW. Used for stem playback sync (Increment 5). */
struct TransportState
{
    int64_t timeInSamples{ 0 };
    double timeInSeconds{ 0.0 };
    bool isPlaying{ false };
    double bpm{ 120.0 };
    bool hasValidPosition{ false };
};
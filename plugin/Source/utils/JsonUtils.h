#pragma once


#include <juce_core/juce_core.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include "../StemModels.h"

struct JsonUtils
{

    static TrackInfo parseTrackInfo(const juce::var& json)
    {
        TrackInfo track;
        track.id = json.getProperty("id", "").toString();
        track.title = json.getProperty("title", "").toString();
        track.username = json.getProperty("username", "").toString();
        track.duration = json.getProperty("duration", "").toString();
        track.createdAt = json.getProperty("created_at", "").toString();
        track.metronome = json.getProperty("metronome_bpm", "").toString();
        track.timeSignature = json.getProperty("time_signature", "").toString();
        return track;
    }

    static juce::Array<StemTrack> parseStemData(const juce::var& json)
    {
        juce::Array<StemTrack> stems;

        // Check if response is directly an array of stems, or has "stems" property
        juce::var stemsArray;
        if (json.isArray())
        {
            // Response is directly an array of stems
            stemsArray = json;
        }
        else
        {
            // Try to get "stems" property from object response
            stemsArray = json.getProperty("stems", juce::var());
            if (!stemsArray.isArray())
            {
                // Get available property names for debugging
                juce::StringArray propertyNames;
                if (auto* obj = json.getDynamicObject())
                {
                    for (auto& prop : obj->getProperties())
                        propertyNames.add(prop.name.toString());
                }
                return stems;
            }
        }

        for (int i = 0; i < stemsArray.size(); ++i)
        {
            juce::var stemJson = stemsArray[i];

            StemTrack stem = parseStem(stemJson);
            stems.add(stem);
        }

        return stems;
    }

    static StemTrack parseStem(const juce::var& stemJson)
    {
        StemTrack stem;

        stem.trackId = stemJson.getProperty("track_id", 0);
        stem.audioUrl = stemJson.getProperty("audio_url", "").toString();
        stem.gain = (float)stemJson.getProperty("gain", 0.8);
        stem.order = stemJson.getProperty("order", 0);

        // Parse regions if present
        juce::var regionsJson = stemJson.getProperty("regions", juce::var());
        if (regionsJson.isArray())
        {
            stem.regions = parseRegions(regionsJson);
        }

        return stem;
    }

    static juce::Array<StemRegion> parseRegions(const juce::var& regionsJson)
    {
        juce::Array<StemRegion> regions;

        for (int i = 0; i < regionsJson.size(); ++i)
        {
            juce::var regionJson = regionsJson[i];
            StemRegion region;

            region.offset = regionJson.getProperty("offset", 0.0);
            region.startTime = regionJson.getProperty("startTime", 0.0);
            region.endTime = regionJson.getProperty("endTime", 0.0);

            regions.add(region);

        }

        return regions;
    }
};
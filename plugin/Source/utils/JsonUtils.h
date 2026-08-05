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

            auto loopEndVar = regionJson.getProperty("loopEnd", juce::var());
            if (!loopEndVar.isVoid() && !loopEndVar.isUndefined())
            {
                const double loopEnd = static_cast<double>(loopEndVar);
                if (loopEnd > region.endTime)
                    region.loopEnd = loopEnd;
            }

            regions.add(region);

        }

        return regions;
    }

    static ProjectClip parseProjectClip(const juce::var& clipJson)
    {
        ProjectClip clip;
        clip.clipId = static_cast<int>(clipJson.getProperty("clipId", 0));
        clip.trackId = static_cast<int>(clipJson.getProperty("trackId", 0));
        clip.audioUrl = clipJson.getProperty("audioUrl", "").toString();
        clip.assetId = static_cast<int>(clipJson.getProperty("assetId", 0));
        if (clip.assetId <= 0)
            clip.assetId = static_cast<int>(clipJson.getProperty("asset_id", 0));
        clip.startTime = static_cast<double>(clipJson.getProperty("startTime", 0.0));
        clip.trimStart = static_cast<double>(clipJson.getProperty("trimStart", 0.0));

        auto trimEndVar = clipJson.getProperty("trimEnd", juce::var());
        if (!trimEndVar.isVoid() && !trimEndVar.isUndefined())
            clip.trimEnd = static_cast<double>(trimEndVar);

        auto loopEndVar = clipJson.getProperty("loopEnd", juce::var());
        if (!loopEndVar.isVoid() && !loopEndVar.isUndefined())
            clip.loopEnd = static_cast<double>(loopEndVar);

        clip.gain = static_cast<float>(clipJson.getProperty("gain", 1.0));
        clip.trackGain = static_cast<float>(clipJson.getProperty("trackGain", 1.0));
        return clip;
    }

    static juce::Array<ProjectClip> parseProjectClips(const juce::var& clipsJson)
    {
        juce::Array<ProjectClip> clips;
        if (!clipsJson.isArray())
            return clips;

        for (int i = 0; i < clipsJson.size(); ++i)
            clips.add(parseProjectClip(clipsJson[i]));

        return clips;
    }

    static ProjectTrackInfo parseProjectTrackInfo(const juce::var& trackJson)
    {
        ProjectTrackInfo track;
        track.trackId = static_cast<int>(trackJson.getProperty("trackId", 0));
        track.name = trackJson.getProperty("name", "").toString();
        track.sortOrder = static_cast<int>(trackJson.getProperty("sortOrder", 0));
        track.color = trackJson.getProperty("color", "").toString();
        return track;
    }

    static juce::Array<ProjectTrackInfo> parseProjectTracks(const juce::var& tracksJson)
    {
        juce::Array<ProjectTrackInfo> tracks;
        if (!tracksJson.isArray())
            return tracks;

        for (int i = 0; i < tracksJson.size(); ++i)
            tracks.add(parseProjectTrackInfo(tracksJson[i]));

        return tracks;
    }

    static ProjectSummary parseProjectSummary(const juce::var& json)
    {
        ProjectSummary summary;
        summary.guid = json.getProperty("guid", "").toString();
        if (summary.guid.isEmpty())
            summary.guid = json.getProperty("id", "").toString();
        summary.name = json.getProperty("name", "").toString();
        summary.bpm = static_cast<int>(json.getProperty("bpm", 120));
        summary.timeSignature = json.getProperty("timeSignature", "4/4").toString();
        summary.durationSeconds = static_cast<double>(json.getProperty("durationSeconds", 60.0));
        summary.role = json.getProperty("role", "").toString();
        summary.updatedAt = json.getProperty("updatedAt", "").toString();
        return summary;
    }

    static juce::Array<ProjectSummary> parseProjectSummaries(const juce::var& json)
    {
        juce::Array<ProjectSummary> projects;
        juce::var projectsArray = json.getProperty("projects", juce::var());
        if (!projectsArray.isArray())
            return projects;

        for (int i = 0; i < projectsArray.size(); ++i)
            projects.add(parseProjectSummary(projectsArray[i]));

        return projects;
    }

    static ProjectPluginPayload parseProjectPluginPayload(const juce::var& json)
    {
        ProjectPluginPayload payload;
        payload.name = json.getProperty("name", "").toString();
        payload.bpm = static_cast<int>(json.getProperty("bpm", 120));
        payload.timeSignature = json.getProperty("timeSignature", "4/4").toString();
        payload.durationSeconds = static_cast<double>(json.getProperty("durationSeconds", 60.0));
        payload.clips = parseProjectClips(json.getProperty("clips", juce::var()));
        payload.tracks = parseProjectTracks(json.getProperty("tracks", juce::var()));
        return payload;
    }
};
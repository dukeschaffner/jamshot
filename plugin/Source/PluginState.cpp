#include "PluginState.h"

//==============================================================================
PluginState::PluginState()
{
    currentTrack = std::make_shared<juce::Optional<TrackInfo>>();
    currentProject = std::make_shared<juce::Optional<ProjectInfo>>();
    projectLoadProgress = std::make_shared<juce::Optional<ProjectLoadProgress>>();
}

//==============================================================================
void PluginState::setCurrentTrack(const TrackInfo& track)
{
    auto newPtr = std::make_shared<juce::Optional<TrackInfo>>(track);
    std::atomic_store(&currentTrack, newPtr);

    triggerAsyncUpdate(); // schedules handleAsyncUpdate() on message thread
}

void PluginState::clearCurrentTrack()
{
    auto newPtr = std::make_shared<juce::Optional<TrackInfo>>();
    std::atomic_store(&currentTrack, newPtr);

    triggerAsyncUpdate(); // schedules handleAsyncUpdate() on message thread
}

void PluginState::setCurrentProject(const ProjectInfo& project)
{
    auto newPtr = std::make_shared<juce::Optional<ProjectInfo>>(project);
    std::atomic_store(&currentProject, newPtr);
    triggerAsyncUpdate();
}

void PluginState::clearCurrentProject()
{
    auto newPtr = std::make_shared<juce::Optional<ProjectInfo>>();
    std::atomic_store(&currentProject, newPtr);
    triggerAsyncUpdate();
}

//==============================================================================
juce::Optional<TrackInfo> PluginState::getCurrentTrack() const
{
    auto ptr = std::atomic_load(&currentTrack);
    if (ptr)
        return *ptr;

    return {};
}

juce::Optional<ProjectInfo> PluginState::getCurrentProject() const
{
    auto ptr = std::atomic_load(&currentProject);
    if (ptr)
        return *ptr;

    return {};
}

void PluginState::setProjectLoadProgress(int current, int total)
{
    auto newPtr = std::make_shared<juce::Optional<ProjectLoadProgress>>();
    *newPtr = ProjectLoadProgress { current, total };
    std::atomic_store(&projectLoadProgress, newPtr);
    triggerAsyncUpdate();
}

void PluginState::clearProjectLoadProgress()
{
    auto newPtr = std::make_shared<juce::Optional<ProjectLoadProgress>>();
    std::atomic_store(&projectLoadProgress, newPtr);
    triggerAsyncUpdate();
}

juce::Optional<PluginState::ProjectLoadProgress> PluginState::getProjectLoadProgress() const
{
    auto ptr = std::atomic_load(&projectLoadProgress);
    if (ptr)
        return *ptr;

    return {};
}

//==============================================================================
void PluginState::handleAsyncUpdate()
{
    // Notify all listeners on the message thread
    listeners.call([](juce::ChangeListener& l) { l.changeListenerCallback(nullptr); });
}

//==============================================================================
void PluginState::addChangeListener(juce::ChangeListener* listener)
{
    listeners.add(listener);
}

void PluginState::removeChangeListener(juce::ChangeListener* listener)
{
    listeners.remove(listener);
}
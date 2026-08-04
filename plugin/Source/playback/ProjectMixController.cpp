#include "ProjectMixController.h"

//==============================================================================
ProjectMixController::ProjectMixController()
    : state(ProjectMixState::makeEmpty())
{
}

std::shared_ptr<const ProjectMixState> ProjectMixController::getState() const
{
    return std::atomic_load(&state);
}

void ProjectMixController::setState(std::shared_ptr<ProjectMixState> next)
{
    if (!next)
        next = ProjectMixState::makeEmpty();
    std::atomic_store(&state, std::move(next));
}

void ProjectMixController::clearActive()
{
    setState(ProjectMixState::makeEmpty());
}

void ProjectMixController::resetIfProjectChanged(const juce::String& previousProjectId,
                                                 const juce::String& nextProjectId)
{
    if (previousProjectId != nextProjectId)
        clearActive();
}

void ProjectMixController::toggleMute(int projectTrackId)
{
    if (projectTrackId <= 0)
        return;

    auto current = std::atomic_load(&state);
    if (!current)
        current = ProjectMixState::makeEmpty();

    setState(ProjectMixState::withToggledMute(*current, projectTrackId));
}

void ProjectMixController::toggleSolo(int projectTrackId)
{
    if (projectTrackId <= 0)
        return;

    auto current = std::atomic_load(&state);
    if (!current)
        current = ProjectMixState::makeEmpty();

    setState(ProjectMixState::withToggledSolo(*current, projectTrackId));
}

void ProjectMixController::pruneToTracks(const juce::Array<int>& validTrackIds)
{
    auto current = std::atomic_load(&state);
    if (!current)
        return;

    setState(ProjectMixState::prunedToTracks(*current, validTrackIds));
}

void ProjectMixController::applyPendingIfMatching(const juce::String& projectId)
{
    std::shared_ptr<ProjectMixState> pending;
    juce::String pendingId;
    {
        const juce::ScopedLock lock(pendingLock);
        pendingId = pendingProjectId;
        pending = pendingState;
    }

    if (pendingId.isEmpty() || pendingId != projectId || !pending)
        return;

    setState(pending);
}

void ProjectMixController::onProjectLoaded(const juce::String& projectId,
                                           const juce::Array<int>& validTrackIds)
{
    applyPendingIfMatching(projectId);
    pruneToTracks(validTrackIds);
}

juce::var ProjectMixController::serialize(const juce::String& loadedProjectId) const
{
    juce::DynamicObject::Ptr root = new juce::DynamicObject();

    juce::String projectId = loadedProjectId;
    if (projectId.isEmpty())
    {
        const juce::ScopedLock lock(pendingLock);
        projectId = pendingProjectId;
    }

    root->setProperty("projectId", projectId);

    auto mix = std::atomic_load(&state);
    if (!mix)
    {
        const juce::ScopedLock lock(pendingLock);
        mix = pendingState;
    }

    juce::Array<juce::var> muted;
    int soloId = -1;
    if (mix)
    {
        for (const int id : mix->mutedTrackIds)
            muted.add(id);
        soloId = mix->soloTrackId;
    }

    root->setProperty("mutedTrackIds", muted);
    root->setProperty("soloTrackId", soloId);
    return juce::var(root.get());
}

void ProjectMixController::restoreFromVar(const juce::var& stateVar,
                                          const juce::String& loadedProjectId,
                                          const juce::Array<int>& validTrackIds)
{
    if (!stateVar.isObject())
        return;

    auto* obj = stateVar.getDynamicObject();
    if (obj == nullptr)
        return;

    const juce::String projectId = obj->getProperty("projectId").toString();
    auto restored = ProjectMixState::makeEmpty();

    const juce::var mutedVar = obj->getProperty("mutedTrackIds");
    if (auto* mutedArr = mutedVar.getArray())
    {
        for (const auto& entry : *mutedArr)
        {
            const int id = static_cast<int>(entry);
            if (id > 0)
                restored->mutedTrackIds.addIfNotAlreadyThere(id);
        }
    }

    const int soloId = static_cast<int>(obj->getProperty("soloTrackId"));
    restored->soloTrackId = soloId > 0 ? soloId : -1;

    {
        const juce::ScopedLock lock(pendingLock);
        pendingProjectId = projectId;
        pendingState = restored;
    }

    if (loadedProjectId.isNotEmpty() && loadedProjectId == projectId)
    {
        setState(restored);
        pruneToTracks(validTrackIds);
    }
}

void ProjectMixController::writeToMemoryBlock(juce::MemoryBlock& destData,
                                              const juce::String& loadedProjectId) const
{
    const auto json = juce::JSON::toString(serialize(loadedProjectId));
    destData.replaceAll(json.toRawUTF8(), static_cast<size_t>(json.getNumBytesAsUTF8()));
}

void ProjectMixController::readFromMemory(const void* data,
                                          int sizeInBytes,
                                          const juce::String& loadedProjectId,
                                          const juce::Array<int>& validTrackIds)
{
    if (data == nullptr || sizeInBytes <= 0)
        return;

    const juce::String json = juce::String::fromUTF8(
        static_cast<const char*>(data), sizeInBytes);
    restoreFromVar(juce::JSON::parse(json), loadedProjectId, validTrackIds);
}

#include "TrackListPanel.h"
#include "../Colors.h"
#include <juce_gui_basics/juce_gui_basics.h>
#include "../utils/MessageStore.h"

using namespace juce;

//==============================================================================
TrackListPanel::TrackListPanel(Services& services)
    : apiClientRef(services.api),
      pluginStateRef(services.pluginState),
      trackListBox("Tracks", nullptr),
      scrollBar(false),
      refreshButton("Refresh", DrawableButton::ImageFitted)
{
    pluginStateRef.addChangeListener(this);
    addAndMakeVisible(refreshButton);
    
    // Load refresh icon from SVG file
    auto svgFile = File::getSpecialLocation(File::currentExecutableFile)
                      .getParentDirectory()
                      .getChildFile("Assets")
                      .getChildFile("icons")
                      .getChildFile("refresh.svg");
    
    // Try alternative path (for development/build scenarios)
    if (!svgFile.existsAsFile())
    {
        svgFile = File(__FILE__).getParentDirectory()
                     .getParentDirectory()
                     .getParentDirectory()
                     .getChildFile("Assets")
                     .getChildFile("icons")
                     .getChildFile("refresh.svg");
    }
    
    if (svgFile.existsAsFile())
    {
        auto svgContent = svgFile.loadFileAsString();
        // Replace currentColor with white in the SVG
        svgContent = svgContent.replace("currentColor", "black");
        
        // Parse SVG string into XmlElement
        auto svgXml = XmlDocument::parse(svgContent);
        if (svgXml != nullptr)
        {
            refreshIcon = Drawable::createFromSVG(*svgXml);
            
            if (refreshIcon != nullptr)
            {
                // Set the drawable on the button (normal, over, down states all use same icon)
                refreshButton.setImages(refreshIcon.get(), refreshIcon.get(), refreshIcon.get());
            }
        }
    }
    
    refreshButton.onClick = [this] { refreshTracks(); };

    // Style refresh button with seafoam color
    refreshButton.setColour(DrawableButton::backgroundColourId, Colors::WHITE);



    addAndMakeVisible(statusLabel);
    statusLabel.setText("No tracks loaded", dontSendNotification);
    statusLabel.setJustificationType(Justification::centred);

    // Set up the list box
    trackListBox.setModel(new TrackListPanel::TrackListBoxModel(*this));
    trackListBox.setRowHeight(40);
    trackListBox.setMultipleSelectionEnabled(false);

    // Override the default JUCE grey background
    trackListBox.setColour(ListBox::backgroundColourId, Colours::white);
    trackListBox.setColour(ListBox::outlineColourId, Colours::transparentBlack);

    addAndMakeVisible(trackListBox);

    // Start timer to check for loading state updates
    startTimer(100);
}

TrackListPanel::~TrackListPanel()
{
    stopTimer();
    pluginStateRef.removeChangeListener(this);
}

void TrackListPanel::changeListenerCallback(juce::ChangeBroadcaster*)
{
    DBG("TrackListPanel::changeListenerCallback()");
    auto track = pluginStateRef.getCurrentTrack();
    juce::String trackId;
    if (track.hasValue())
    {
        trackId = (*track).id;
    }
    else
    {
        trackId = "";
    }

    selectTrackById(trackId);
}

void TrackListPanel::paint(Graphics& g)
{
    // Use white background
    g.fillAll(Colors::WHITE);
}

void TrackListPanel::resized()
{
    auto bounds = getLocalBounds().toFloat();

    juce::FlexBox main;
    main.flexDirection = juce::FlexBox::Direction::column;

    // --- Button row ---
    juce::FlexBox buttonRow;
    buttonRow.flexDirection = juce::FlexBox::Direction::row;

    buttonRow.items.add(
        juce::FlexItem(refreshButton)
            .withWidth(20.0f)
            .withHeight(20.0f)
    );

    main.items.add(
        juce::FlexItem(buttonRow)
            .withHeight(20.0f)
    );

    // Status label
    main.items.add(
        juce::FlexItem(statusLabel)
            .withHeight(20.0f)
    );

    // Track list fills remaining space
    main.items.add(
        juce::FlexItem(trackListBox)
            .withFlex(1.0f)
    );

    main.performLayout(bounds);
}

void TrackListPanel::setUsername(const String& username)
{
    if (currentUsername != username)
    {
        currentUsername = username;
        refreshTracks();
    }
}

void TrackListPanel::refreshTracks()
{
    if (currentUsername.isEmpty())
        return;

    currentPage = 1;
    tracks.clear();
    trackListBox.deselectAllRows();
    trackListBox.updateContent();
    loadTracksInternal(1);
}

void TrackListPanel::loadMoreTracks()
{
    if (currentUsername.isEmpty() || !pagination.hasMore || isLoading)
        return;

    loadTracksInternal(currentPage + 1);
}

void TrackListPanel::setTrackSelectedCallback(TrackSelectedCallback callback)
{
    trackSelectedCallback = callback;
}

const TrackInfo* TrackListPanel::getSelectedTrack() const
{
    int row = trackListBox.getSelectedRow();
    if (row >= 0 && row < tracks.size())
        return &tracks.getReference(row);

    return nullptr;
}

void TrackListPanel::clearTracks()
{
    tracks.clear();
    pagination = PaginationInfo();
    currentPage = 1;
    trackListBox.deselectAllRows();
    trackListBox.updateContent();
    statusLabel.setText("No tracks loaded", dontSendNotification);
    resized(); // Trigger layout recalculation when visibility changes
}

void TrackListPanel::timerCallback()
{
    // Update UI based on loading state
    resized(); // Trigger layout recalculation when visibility changes

    if (isLoading)
    {
        statusLabel.setText("Loading tracks...", dontSendNotification);
    }
    else if (tracks.isEmpty())
    {
        statusLabel.setText("No tracks loaded", dontSendNotification);
    }
    else
    {
        statusLabel.setText(String(tracks.size()) + " tracks loaded", dontSendNotification);
    }
}

void TrackListPanel::loadTracksInternal(int page)
{
    if (isLoading || currentUsername.isEmpty())
        return;

    isLoading = true;

    // Run API call on background thread
    Thread::launch([this, page]() {
        auto result = apiClientRef.getLikedTracks(currentUsername, page, 15);

        if (result.failed())
        {
            DBG("TrackListPanel::loadTracksInternal() - error loading tracks: " + result.getErrorMessage());
            MessageStore::getInstance().pushMessage(PluginMessage{
                .severity = PluginMessage::Severity::Error,
                .content = "Failed to load tracks for user: " + currentUsername,
                .sourceModule = "TrackListPanel",
                .timestamp = std::chrono::system_clock::now()
            });
        }

        MessageManager::callAsync([this, result, page]() {
            isLoading = false;

            if (result.failed())
            {
                statusLabel.setText("Error loading tracks: " + result.getErrorMessage(), dontSendNotification);
                return;
            }

            currentPage = page;
            updateTracksDisplay(*result);
        });
    });
}

void TrackListPanel::updateTracksDisplay(const LikedTracksResponse& response)
{
    if (currentPage == 1)
    {
        tracks = response.tracks;
        trackListBox.deselectAllRows();
    }
    else
    {
        tracks.addArray(response.tracks);
    }

    pagination = response.pagination;
    trackListBox.updateContent();
    auto currentTrack = pluginStateRef.getCurrentTrack();
    if(currentTrack.hasValue())
    {
        selectTrackById((*currentTrack).id);
    }
}

void TrackListPanel::selectTrack(int trackIndex)
{
    if (trackIndex >= 0 && trackIndex < tracks.size())
    {
        selectTrackById(tracks[trackIndex].id);

        if (trackSelectedCallback)
            trackSelectedCallback(tracks[trackIndex]);
    }
}

void TrackListPanel::selectTrackById(const juce::String& trackId)
{
    for (int i = 0; i < tracks.size(); ++i)
    {
        if (tracks[i].id == trackId)
        {
            trackListBox.selectRow(i);
            trackListBox.scrollToEnsureRowIsOnscreen(i);
            return;
        }
    }

    trackListBox.deselectAllRows();
    trackListBox.repaint();
}
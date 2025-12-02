/*
  ==============================================================================

    This file contains the basic framework code for a JUCE plugin editor.

  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

//==============================================================================
SterioPluginAudioProcessorEditor::SterioPluginAudioProcessorEditor (SterioPluginAudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{
    // Set up title
    titleLabel.setText ("Sterio Plugin", juce::dontSendNotification);
    titleLabel.setFont (juce::FontOptions (20.0f, juce::Font::bold));
    titleLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (titleLabel);
    
    // Set up login form
    emailLabel.setText ("Email:", juce::dontSendNotification);
    addAndMakeVisible (emailLabel);
    
    emailEditor.setTextToShowWhenEmpty ("Enter your email", juce::Colours::grey);
    addAndMakeVisible (emailEditor);
    
    passwordLabel.setText ("Password:", juce::dontSendNotification);
    addAndMakeVisible (passwordLabel);
    
    passwordEditor.setTextToShowWhenEmpty ("Enter your password", juce::Colours::grey);
    passwordEditor.setPasswordCharacter ('*');
    addAndMakeVisible (passwordEditor);
    
    loginButton.setButtonText ("Login");
    loginButton.addListener (this);
    addAndMakeVisible (loginButton);
    
    logoutButton.setButtonText ("Logout");
    logoutButton.addListener (this);
    addAndMakeVisible (logoutButton);
    
    // Set up track list UI
    usernameLabel.setText ("", juce::dontSendNotification);
    usernameLabel.setFont (juce::FontOptions (14.0f, juce::Font::bold));
    usernameLabel.setJustificationType (juce::Justification::centred);
    usernameLabel.setColour (juce::Label::textColourId, juce::Colours::lightblue);
    addAndMakeVisible (usernameLabel);
    
    tracksLabel.setText ("Liked Tracks", juce::dontSendNotification);
    tracksLabel.setFont (juce::FontOptions (16.0f, juce::Font::bold));
    addAndMakeVisible (tracksLabel);
    
    tracksList.setModel (this);
    tracksList.setColour (juce::ListBox::backgroundColourId, juce::Colours::darkgrey);
    addAndMakeVisible (tracksList);
    
    refreshButton.setButtonText ("Refresh");
    refreshButton.addListener (this);
    addAndMakeVisible (refreshButton);
    
    statusLabel.setText ("Not logged in", juce::dontSendNotification);
    statusLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (statusLabel);
    
    // Set up playback controls
    playPauseButton.setButtonText ("Play");
    playPauseButton.addListener (this);
    addAndMakeVisible (playPauseButton);
    
    progressSlider.setRange (0.0, 100.0);
    progressSlider.setSliderStyle (juce::Slider::LinearHorizontal);
    progressSlider.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    progressSlider.addListener (this);
    addAndMakeVisible (progressSlider);
    
    trackInfoLabel.setText ("No track selected", juce::dontSendNotification);
    trackInfoLabel.setJustificationType (juce::Justification::centred);
    addAndMakeVisible (trackInfoLabel);

    // Check if already logged in
    if (audioProcessor.getApiClient().hasValidTokens())
    {
        currentState = UIState::TrackList;
        loadLikedTracks();
    }

    updateUIState();
    setSize (500, 600);
}

SterioPluginAudioProcessorEditor::~SterioPluginAudioProcessorEditor()
{
}

//==============================================================================
void SterioPluginAudioProcessorEditor::paint (juce::Graphics& g)
{
    // Fill background
    g.fillAll (juce::Colours::black);
    
    // Draw border
    g.setColour (juce::Colours::grey);
    g.drawRect (getLocalBounds(), 1);
}

void SterioPluginAudioProcessorEditor::resized()
{
    auto bounds = getLocalBounds().reduced (10);
    
    // Title
    titleLabel.setBounds (bounds.removeFromTop (30));
    bounds.removeFromTop (10);
    
    if (currentState == UIState::Login)
    {
        // Login form layout
        emailLabel.setBounds (bounds.removeFromTop (20));
        emailEditor.setBounds (bounds.removeFromTop (25));
        bounds.removeFromTop (5);
        
        passwordLabel.setBounds (bounds.removeFromTop (20));
        passwordEditor.setBounds (bounds.removeFromTop (25));
        bounds.removeFromTop (10);
        
        loginButton.setBounds (bounds.removeFromTop (30));
        bounds.removeFromTop (10);
        
        statusLabel.setBounds (bounds.removeFromTop (20));
    }
    else if (currentState == UIState::TrackList)
    {
        // Username display
        usernameLabel.setBounds (bounds.removeFromTop (25));
        bounds.removeFromTop (5);
        
        // Track list layout
        auto topControls = bounds.removeFromTop (30);
        logoutButton.setBounds (topControls.removeFromRight (80));
        refreshButton.setBounds (topControls.removeFromRight (80));
        tracksLabel.setBounds (topControls);
        
        bounds.removeFromTop (10);
        
        // Track list
        tracksList.setBounds (bounds.removeFromTop (300));
        bounds.removeFromTop (10);
        
        // Playback controls
        trackInfoLabel.setBounds (bounds.removeFromTop (20));
        bounds.removeFromTop (5);
        
        auto playbackControls = bounds.removeFromTop (30);
        playPauseButton.setBounds (playbackControls.removeFromLeft (80));
        playbackControls.removeFromLeft (10);
        progressSlider.setBounds (playbackControls);
        
        bounds.removeFromTop (10);
        statusLabel.setBounds (bounds.removeFromTop (20));
    }
    else
    {
        // Loading or error state
        statusLabel.setBounds (bounds.removeFromTop (20));
        
        if (currentState == UIState::Error)
        {
            bounds.removeFromTop (10);
            loginButton.setBounds (bounds.removeFromTop (30));
        }
    }
}

//==============================================================================
void SterioPluginAudioProcessorEditor::buttonClicked (juce::Button* button)
{
    if (button == &loginButton)
    {
        juce::String email = emailEditor.getText();
        juce::String password = passwordEditor.getText();
        
        if (email.isEmpty() || password.isEmpty())
        {
            showError ("Please enter both email and password");
            return;
        }
        
        currentState = UIState::Loading;
        statusMessage = "Logging in...";
        updateUIState();
        
        audioProcessor.getApiClient().loginAsync (email, password,
            [this](const AuthResponse& response)
            {
                handleLoginResponse (response);
            });
    }
    else if (button == &logoutButton)
    {
        audioProcessor.getApiClient().logout();
        likedTracks.clear();
        selectedTrackIndex = -1;
        currentUser = SterioUser(); // Clear user data
        usernameLabel.setText ("", juce::dontSendNotification); // Clear username display
        currentState = UIState::Login;
        clearLoginForm();
        updateUIState();
    }
    else if (button == &refreshButton)
    {
        loadLikedTracks();
    }
    else if (button == &playPauseButton)
    {
        // Audio player removed - button disabled
        DBG("Play/pause button clicked but audio player is not available");
    }
}

//==============================================================================
int SterioPluginAudioProcessorEditor::getNumRows()
{
    return likedTracks.size();
}

void SterioPluginAudioProcessorEditor::paintListBoxItem (int rowNumber, juce::Graphics& g, 
                                                        int width, int height, bool rowIsSelected)
{
    if (rowNumber >= likedTracks.size())
        return;
    
    const auto& track = likedTracks[rowNumber];
    
    // Background
    if (rowIsSelected)
        g.fillAll (juce::Colours::lightblue.withAlpha (0.3f));
    else if (rowNumber % 2 == 0)
        g.fillAll (juce::Colours::darkgrey.withAlpha (0.1f));
    
    // Text
    g.setColour (juce::Colours::white);
    g.setFont (14.0f);
    
    auto bounds = juce::Rectangle<int> (0, 0, width, height).reduced (5);
    
    // Track title
    g.drawText (track.title, bounds.removeFromTop (height / 2), 
                juce::Justification::left, true);
    
    // Artist and stats
    juce::String info = track.username + " • " + 
                       juce::String (track.likeCount) + " likes • " +
                       juce::String (track.playCount) + " plays";
    g.setFont (12.0f);
    g.setColour (juce::Colours::lightgrey);
    g.drawText (info, bounds, juce::Justification::left, true);
}

void SterioPluginAudioProcessorEditor::listBoxItemClicked (int row, const juce::MouseEvent& e)
{
    if (row >= 0 && row < likedTracks.size())
    {
        selectedTrackIndex = row;
        const auto& track = likedTracks[row];
        
        trackInfoLabel.setText (track.title + " by " + track.username, 
                               juce::dontSendNotification);
        
        // Update playback controls
        auto& player = audioProcessor.getAudioPlayer();
        if (player.isLoaded() && player.getCurrentTrack().id == track.id)
        {
            playPauseButton.setButtonText (player.isPlaying() ? "Pause" : "Play");
            
            // Update progress slider range
            double totalLength = player.getTotalLength();
            if (totalLength > 0.0)
            {
                progressSlider.setRange (0.0, totalLength);
                progressSlider.setValue (player.getCurrentPosition());
            }
        }
        else
        {
            playPauseButton.setButtonText ("Play");
            progressSlider.setValue (0.0);
        }
    }
}

//==============================================================================
void SterioPluginAudioProcessorEditor::updateUIState()
{
    // Hide all components first
    emailLabel.setVisible (false);
    emailEditor.setVisible (false);
    passwordLabel.setVisible (false);
    passwordEditor.setVisible (false);
    loginButton.setVisible (false);
    logoutButton.setVisible (false);
    usernameLabel.setVisible (false);
    tracksLabel.setVisible (false);
    tracksList.setVisible (false);
    refreshButton.setVisible (false);
    playPauseButton.setVisible (false);
    progressSlider.setVisible (false);
    trackInfoLabel.setVisible (false);
    
    switch (currentState)
    {
        case UIState::Login:
            emailLabel.setVisible (true);
            emailEditor.setVisible (true);
            passwordLabel.setVisible (true);
            passwordEditor.setVisible (true);
            loginButton.setVisible (true);
            statusLabel.setText ("Please log in to your Sterio account", juce::dontSendNotification);
            break;
            
        case UIState::Loading:
            statusLabel.setText (statusMessage, juce::dontSendNotification);
            break;
            
        case UIState::TrackList:
            usernameLabel.setVisible (true);
            tracksLabel.setVisible (true);
            tracksList.setVisible (true);
            refreshButton.setVisible (true);
            logoutButton.setVisible (true);
            playPauseButton.setVisible (true);
            progressSlider.setVisible (true);
            trackInfoLabel.setVisible (true);
            statusLabel.setText (juce::String (likedTracks.size()) + " liked tracks", 
                               juce::dontSendNotification);
            break;
            
        case UIState::Error:
            loginButton.setVisible (true);
            statusLabel.setText (statusMessage, juce::dontSendNotification);
            break;
    }
    
    resized();
    repaint();
}

void SterioPluginAudioProcessorEditor::handleLoginResponse (const AuthResponse& response)
{
    if (response.success)
    {
        currentUser = response.user;
        
        // Check if user data is included in login response
        if (currentUser.username.isNotEmpty())
        {
            // Update username display
            usernameLabel.setText ("Welcome, " + currentUser.username + "!", juce::dontSendNotification);
            
            currentState = UIState::TrackList;
            clearLoginForm();
            loadLikedTracks();
        }
        else
        {
            // Get current user info since it wasn't included in login response
            audioProcessor.getApiClient().getCurrentUserAsync([this](const AuthResponse& userResponse)
            {
                if (userResponse.success)
                {
                    currentUser = userResponse.user;
                    
                    if (currentUser.username.isNotEmpty())
                    {
                        usernameLabel.setText ("Welcome, " + currentUser.username + "!", juce::dontSendNotification);
                    }
                    else
                    {
                        usernameLabel.setText ("Welcome!", juce::dontSendNotification);
                    }
                }
                else
                {
                    // Fall back to email-based username
                    juce::String email = emailEditor.getText();
                    if (email.contains("@"))
                    {
                        juce::String username = email.upToFirstOccurrenceOf("@", false, false);
                        usernameLabel.setText ("Welcome, " + username + "!", juce::dontSendNotification);
                    }
                    else
                    {
                        usernameLabel.setText ("Welcome!", juce::dontSendNotification);
                    }
                }
                
                currentState = UIState::TrackList;
                clearLoginForm();
                loadLikedTracks();
            });
        }
    }
    else
    {
        showError (response.errorMessage);
    }
}

void SterioPluginAudioProcessorEditor::handleTracksResponse (const TracksResponse& response)
{
    if (response.success)
    {
        likedTracks = response.tracks;
        tracksList.updateContent();
        currentState = UIState::TrackList;
        updateUIState();
    }
    else
    {
        showError ("Failed to load tracks: " + response.errorMessage);
    }
}

void SterioPluginAudioProcessorEditor::loadLikedTracks()
{
    if (!audioProcessor.getApiClient().hasValidTokens())
    {
        showError ("Not logged in");
        return;
    }
    
    // Check if we have a valid username
    if (currentUser.username.isEmpty())
    {
        showError ("Username not available. Please try logging in again.");
        return;
    }
    
    juce::String username = currentUser.username;
    
    // Update username display
    usernameLabel.setText ("Welcome, " + currentUser.username + "!", juce::dontSendNotification);
    
    currentState = UIState::Loading;
    statusMessage = "Loading liked tracks...";
    updateUIState();
    
    audioProcessor.getApiClient().getLikedTracksAsync (username, 1, 50,
        [this](const TracksResponse& response)
        {
            handleTracksResponse (response);
        });
}

void SterioPluginAudioProcessorEditor::showError (const juce::String& message)
{
    currentState = UIState::Error;
    statusMessage = "Error: " + message;
    updateUIState();
}

void SterioPluginAudioProcessorEditor::clearLoginForm()
{
    emailEditor.setText ("");
    passwordEditor.setText ("");
}



void SterioPluginAudioProcessorEditor::sliderValueChanged (juce::Slider* slider)
{
    if (slider == &progressSlider)
    {
        // Audio player removed - slider disabled
        DBG("Progress slider moved but audio player is not available");
    }
}

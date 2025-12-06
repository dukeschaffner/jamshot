#include <juce_gui_extra/juce_gui_extra.h>
#include <tracktion_engine/tracktion_engine.h>

// JUCE module declarations
#if ! DONT_SET_USING_JUCE_NAMESPACE
 using namespace juce;
#endif

namespace te = tracktion::engine;
namespace tc = tracktion;

//==============================================================================
class MainComponent : public juce::Component,
                      private juce::Timer
{
public:
    MainComponent()
        : engine("TracktionTest")
    {
        // Create an empty edit
        edit = te::Edit::createSingleTrackEdit(engine);
        
        // Get the audio file path
        // For macOS .app bundle: executable is at .app/Contents/MacOS/AppName
        // Need to go up to: build/TracktionTest_artefacts/ -> build/ -> project root
        audioFile = juce::File::getSpecialLocation(juce::File::currentExecutableFile)
                        .getParentDirectory()  // MacOS/
                        .getParentDirectory()  // Contents/
                        .getParentDirectory()  // Tracktion Test.app/
                        .getParentDirectory()  // TracktionTest_artefacts/
                        .getParentDirectory()  // build/
                        .getParentDirectory()  // tracktion-test/
                        .getChildFile("test.mp3");
        
        // Fallback: try current working directory
        if (!audioFile.existsAsFile())
            audioFile = juce::File::getCurrentWorkingDirectory().getChildFile("test.mp3");
        
        // Fallback: hardcoded path for development
        if (!audioFile.existsAsFile())
            audioFile = juce::File("/Users/dukeschaffner/Documents/CODING/apps/jamshot/tracktion-test/test.mp3");
        
        // Set up the UI
        setupUI();
        
        // Load the audio file into the edit
        loadAudioFile();
        
        // Start timer to update UI
        startTimer(100);
        
        setSize(400, 200);
    }
    
    ~MainComponent() override
    {
        stopTimer();
        edit = nullptr;
    }
    
    void paint(juce::Graphics& g) override
    {
        g.fillAll(juce::Colour(0xff1a1a2e));
        
        // Draw title
        g.setColour(juce::Colours::white);
        g.setFont(juce::FontOptions(20.0f).withStyle("Bold"));
        g.drawText("Tracktion Engine Test", getLocalBounds().removeFromTop(50), 
                   juce::Justification::centred);
        
        // Draw file status
        g.setFont(juce::FontOptions(12.0f));
        g.setColour(audioFile.existsAsFile() ? juce::Colours::lightgreen : juce::Colours::red);
        juce::String fileStatus = audioFile.existsAsFile() 
            ? "Loaded: " + audioFile.getFileName()
            : "File not found: test.mp3";
        g.drawText(fileStatus, getLocalBounds().removeFromBottom(30), 
                   juce::Justification::centred);
    }
    
    void resized() override
    {
        auto bounds = getLocalBounds().reduced(40);
        bounds.removeFromTop(50);
        bounds.removeFromBottom(30);
        
        juce::ignoreUnused(bounds);
        
        // Center the play button
        int buttonWidth = 120;
        int buttonHeight = 50;
        playButton.setBounds(
            (getWidth() - buttonWidth) / 2,
            (getHeight() - buttonHeight) / 2,
            buttonWidth,
            buttonHeight
        );
        
        // Position time label below button
        timeLabel.setBounds(
            0,
            playButton.getBottom() + 10,
            getWidth(),
            20
        );
    }

private:
    void setupUI()
    {
        // Play/Pause button
        addAndMakeVisible(playButton);
        playButton.setButtonText("Play");
        playButton.setColour(juce::TextButton::buttonColourId, juce::Colour(0xff4a4e69));
        playButton.setColour(juce::TextButton::textColourOffId, juce::Colours::white);
        playButton.onClick = [this]() { togglePlayback(); };
        
        // Time display label
        addAndMakeVisible(timeLabel);
        timeLabel.setFont(juce::FontOptions(14.0f));
        timeLabel.setColour(juce::Label::textColourId, juce::Colours::lightgrey);
        timeLabel.setJustificationType(juce::Justification::centred);
        timeLabel.setText("00:00 / 00:00", juce::dontSendNotification);
    }
    
    void loadAudioFile()
    {
        if (!audioFile.existsAsFile())
        {
            DBG("Audio file not found: " + audioFile.getFullPathName());
            return;
        }
        
        if (edit == nullptr)
            return;
        
        // Get or create the first audio track
        auto* track = te::getAudioTracks(*edit).getFirst();
        if (track == nullptr)
            return;
        
        // Insert the audio clip
        auto audioFileObj = te::AudioFile(engine, audioFile);
        auto clipLength = audioFileObj.getLength();
        
        if (clipLength > 0)
        {
            track->insertWaveClip(audioFile.getFileNameWithoutExtension(),
                                  audioFile,
                                  {{ tc::TimePosition::fromSeconds(0), 
                                     tc::TimePosition::fromSeconds(clipLength) }},
                                  false);
            
            clipDuration = clipLength;
            DBG("Loaded audio file: " + audioFile.getFullPathName() + 
                " (duration: " + juce::String(clipLength) + "s)");
        }
    }
    
    void togglePlayback()
    {
        if (edit == nullptr)
            return;
        
        auto& transport = edit->getTransport();
        
        if (transport.isPlaying())
        {
            transport.stop(false, false);
            playButton.setButtonText("Play");
        }
        else
        {
            transport.play(false);
            playButton.setButtonText("Pause");
        }
    }
    
    void timerCallback() override
    {
        if (edit == nullptr)
            return;
        
        auto& transport = edit->getTransport();
        
        // Update button text based on playback state
        if (transport.isPlaying())
            playButton.setButtonText("Pause");
        else
            playButton.setButtonText("Play");
        
        // Update time display
        double currentTime = transport.getPosition().inSeconds();
        timeLabel.setText(formatTime(currentTime) + " / " + formatTime(clipDuration),
                          juce::dontSendNotification);
        
        // Loop back to start when finished
        if (currentTime >= clipDuration && clipDuration > 0)
        {
            transport.stop(false, false);
            transport.setPosition(tc::TimePosition::fromSeconds(0));
        }
    }
    
    juce::String formatTime(double seconds)
    {
        int mins = static_cast<int>(seconds) / 60;
        int secs = static_cast<int>(seconds) % 60;
        return juce::String::formatted("%02d:%02d", mins, secs);
    }
    
    //==========================================================================
    te::Engine engine;
    std::unique_ptr<te::Edit> edit;
    juce::File audioFile;
    double clipDuration = 0.0;
    
    juce::TextButton playButton;
    juce::Label timeLabel;
    
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MainComponent)
};

//==============================================================================
class MainWindow : public juce::DocumentWindow
{
public:
    MainWindow(juce::String name)
        : DocumentWindow(name,
                         juce::Colour(0xff1a1a2e),
                         DocumentWindow::allButtons)
    {
        setUsingNativeTitleBar(true);
        setContentOwned(new MainComponent(), true);
        setResizable(true, true);
        centreWithSize(getWidth(), getHeight());
        setVisible(true);
    }
    
    void closeButtonPressed() override
    {
        juce::JUCEApplication::getInstance()->systemRequestedQuit();
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(MainWindow)
};

//==============================================================================
class TracktionTestApplication : public juce::JUCEApplication
{
public:
    TracktionTestApplication() {}
    
    const juce::String getApplicationName() override    { return "Tracktion Test"; }
    const juce::String getApplicationVersion() override { return "1.0.0"; }
    bool moreThanOneInstanceAllowed() override          { return true; }
    
    void initialise(const juce::String& /*commandLine*/) override
    {
        mainWindow.reset(new MainWindow(getApplicationName()));
    }
    
    void shutdown() override
    {
        mainWindow = nullptr;
    }
    
    void systemRequestedQuit() override
    {
        quit();
    }
    
    void anotherInstanceStarted(const juce::String& /*commandLine*/) override {}

private:
    std::unique_ptr<MainWindow> mainWindow;
};

//==============================================================================
START_JUCE_APPLICATION(TracktionTestApplication)


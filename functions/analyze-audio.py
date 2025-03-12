import librosa
import numpy as np

def analyze_audio_rhythm(file_path):
    """
    Analyzes an audio file to extract BPM, grid adherence, and looping characteristics.
    
    Args:
        file_path (str): Path to the audio file (e.g., 'audio.wav').
    
    Returns:
        dict: Contains BPM, grid adherence score (0-1), and looping likelihood (bool).
    """
    try:
        # Load the audio file
        y, sr = librosa.load(file_path, sr=None)  # y = audio time series, sr = sample rate
        
        # Extract tempo (BPM) and beat frames
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        
        # Convert tempo to a scalar if it's an array
        bpm = float(tempo) if isinstance(tempo, np.ndarray) else tempo
        
        # 1. Calculate Grid Adherence
        # Theoretical beat intervals based on BPM
        beat_interval = 60 / bpm  # Seconds per beat
        expected_beat_times = np.arange(beat_times[0], beat_times[-1] + beat_interval, beat_interval)
        
        # Find nearest actual beat to each expected beat
        adherence_scores = []
        for expected in expected_beat_times:
            nearest_beat = beat_times[np.argmin(np.abs(beat_times - expected))]
            deviation = abs(nearest_beat - expected)
            # Score: 1 (perfect alignment) to 0 (max deviation = half beat interval)
            score = max(0, 1 - (deviation / (beat_interval / 2)))
            adherence_scores.append(score)
        
        # Average adherence score (0-1, where 1 = perfectly on grid)
        grid_adherence = np.mean(adherence_scores) if adherence_scores else 0
        
        # 2. Detect Looping
        # Use autocorrelation to find repeating patterns
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        autocorr = librosa.autocorrelate(onset_env, max_size=len(onset_env))
        
        # Find peaks in autocorrelation (excluding lag 0)
        lags = np.arange(len(autocorr))
        peaks = librosa.util.peak_pick(autocorr, pre_max=10, post_max=10, pre_avg=10, post_avg=10, delta=0.1, wait=10)
        peaks = peaks[peaks > 0]  # Exclude lag 0
        
        # Convert peaks to time (potential loop periods)
        peak_times = lags[peaks] * (len(y) / sr) / len(autocorr)
        
        # Check if there's a consistent loop period
        is_looped = False
        if len(peak_times) > 0:
            # Estimate loop duration from the first significant peak
            loop_duration = peak_times[0]
            # Check if the audio duration is a multiple of the loop duration
            audio_duration = len(y) / sr
            loop_ratio = audio_duration / loop_duration
            # If the ratio is close to an integer (within 5% tolerance), it's likely looped
            if abs(loop_ratio - round(loop_ratio)) < 0.05 and loop_ratio >= 1:
                is_looped = True
        
        # Return results
        return {
            "bpm": round(bpm, 2),
            "grid_adherence": round(grid_adherence, 2),  # 0-1 scale
            "is_looped": is_looped,
            "details": {
                "beat_count": len(beat_times),
                "audio_duration": round(audio_duration, 2),
                "detected_loop_period": round(loop_duration, 2) if is_looped else None
            }
        }
    
    except Exception as e:
        print(f"Error analyzing audio: {e}")
        return {
            "bpm": None,
            "grid_adherence": None,
            "is_looped": None,
            "details": {"error": str(e)}
        }

# Example usage
if __name__ == "__main__":
    audio_file = "path/to/your/audio.wav"  # Replace with your audio file path
    result = analyze_audio_rhythm(audio_file)
    
    print(f"BPM: {result['bpm']}")
    print(f"Grid Adherence: {result['grid_adherence']} (0-1, 1 = perfect)")
    print(f"Is Looped: {result['is_looped']}")
    print(f"Details: {result['details']}")
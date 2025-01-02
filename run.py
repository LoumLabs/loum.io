from flask import Flask, request, Response, send_file
from werkzeug.utils import secure_filename
import os
import json
import librosa
import numpy as np
import tempfile
from scipy.signal import butter, lfilter
import logging
from app.routes import main

app = Flask(__name__)
app.register_blueprint(main)

# Configure logging
logging.basicConfig(level=logging.INFO)

# Multiband analysis settings
SETTINGS = {
    'low_mid_crossover': 250,  # Hz
    'mid_high_crossover': 4000,  # Hz
    'filter_order': 5,
    'block_size': 3.0,  # seconds
    'step_size': 1.0  # seconds
}

def butter_lowpass(cutoff, fs, order=5):
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    b, a = butter(order, normal_cutoff, btype='low', analog=False)
    return b, a

def lowpass_filter(data, cutoff, fs, order=5):
    b, a = butter_lowpass(cutoff, fs, order=order)
    y = lfilter(b, a, data)
    return y

def butter_highpass(cutoff, fs, order=5):
    nyq = 0.5 * fs
    normal_cutoff = cutoff / nyq
    b, a = butter(order, normal_cutoff, btype='high', analog=False)
    return b, a

def highpass_filter(data, cutoff, fs, order=5):
    b, a = butter_highpass(cutoff, fs, order=order)
    y = lfilter(b, a, data)
    return y

def butter_bandpass(lowcut, highcut, fs, order=5):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band', analog=False)
    return b, a

def bandpass_filter(data, lowcut, highcut, fs, order=5):
    b, a = butter_bandpass(lowcut, highcut, fs, order=order)
    y = lfilter(b, a, data)
    return y

def calculate_short_term_rms_db(audio, sr, block_size, step_size):
    rms_list = []
    block_samples = int(block_size * sr)
    step_samples = int(step_size * sr)
    
    for start in range(0, len(audio), step_samples):
        end = start + block_samples
        if end > len(audio):
            end = len(audio)
        block = audio[start:end]
        if len(block) < block_samples:
            block = np.pad(block, (0, block_samples - len(block)), 'constant')
        
        rms = np.sqrt(np.mean(block**2))
        rms_db = 20 * np.log10(rms) if rms > 0 else -np.inf
        rms_list.append(rms_db)
    
    return rms_list

def calculate_band_rms(audio, sr, band, settings):
    if band == 'low':
        filtered = lowpass_filter(audio, settings['low_mid_crossover'], sr, order=settings['filter_order'])
    elif band == 'mid':
        filtered = bandpass_filter(audio, settings['low_mid_crossover'], settings['mid_high_crossover'], 
                                sr, order=settings['filter_order'])
    elif band == 'high':
        filtered = highpass_filter(audio, settings['mid_high_crossover'], sr, order=settings['filter_order'])
    else:
        return None

    rms_values = calculate_short_term_rms_db(filtered, sr, settings['block_size'], settings['step_size'])
    return max(rms_values) if rms_values else None

def analyze_audio(file_path):
    try:
        # Load audio file
        y, sr = librosa.load(file_path, sr=None, mono=True)
        
        # Get file info
        duration = librosa.get_duration(y=y, sr=sr)
        duration_str = f"{int(duration // 60):02d}:{int(duration % 60):02d}"
        
        file_size = os.path.getsize(file_path)
        file_size_mb = file_size / (1024 * 1024)
        
        # Calculate multiband RMS
        low_rms = calculate_band_rms(y, sr, 'low', SETTINGS)
        mid_rms = calculate_band_rms(y, sr, 'mid', SETTINGS)
        high_rms = calculate_band_rms(y, sr, 'high', SETTINGS)
        
        # Calculate loudness metrics using existing code...
        
        return {
            'file_info': {
                'filename': os.path.basename(file_path),
                'duration': duration_str,
                'file_size': f"{file_size_mb:.1f} MB",
                'file_type': "WAV",
                'sample_rate': f"{sr:,} Hz",
                'bit_depth': "16 bit"
            },
            'low': low_rms,
            'mid': mid_rms,
            'high': high_rms,
            # ... existing loudness metrics ...
        }
        
    except Exception as e:
        logging.error(f"Error analyzing file {file_path}: {e}")
        return None

# ... rest of your Flask routes and code ...

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8082, debug=True)

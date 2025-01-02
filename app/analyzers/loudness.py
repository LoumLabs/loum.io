import soundfile as sf
import pyloudnorm as pyln
import numpy as np
import logging
from scipy import signal
import os

def calculate_true_peak(audio_data, sample_rate):
    """Calculate true peak value of audio data"""
    # Upsample by 4x for true-peak calculation
    upsampled = signal.resample(audio_data, len(audio_data) * 4)
    return 20 * np.log10(np.max(np.abs(upsampled)))

def calculate_short_term_loudness(audio_data, sample_rate, meter):
    """Calculate short-term loudness values"""
    block_size = int(3 * sample_rate)  # 3-second blocks
    hop_size = int(sample_rate * 0.1)  # 100ms hop
    
    loudness_values = []
    for i in range(0, len(audio_data) - block_size, hop_size):
        block = audio_data[i:i + block_size]
        loudness = meter.integrated_loudness(block)
        if not np.isneginf(loudness):
            loudness_values.append(loudness)
    
    return np.array(loudness_values)

def calculate_loudness_range(short_term_values):
    """Calculate LRA and LUFS-S Max from short-term loudness values"""
    if len(short_term_values) == 0:
        return 0, -np.inf
        
    # Sort loudness values
    sorted_values = np.sort(short_term_values)
    
    # Calculate percentiles
    low_percentile = np.percentile(sorted_values, 10)
    high_percentile = np.percentile(sorted_values, 95)
    
    lra = high_percentile - low_percentile
    lufs_s_max = np.max(short_term_values)
    
    return lra, lufs_s_max

def analyze_file(file_path):
    """Analyze loudness metrics of an audio file"""
    try:
        # Load audio file
        y, sr = sf.read(file_path, dtype='float32')
        
        # Create loudness meter
        meter = pyln.Meter(sr)
        
        # Calculate integrated loudness (LUFS-I)
        loudness = meter.integrated_loudness(y)
        
        # Calculate true peak
        if y.ndim > 1:
            true_peaks = [calculate_true_peak(y[:, i], sr) for i in range(y.shape[1])]
            true_peak_db = max(true_peaks)
        else:
            true_peak_db = calculate_true_peak(y, sr)
            
        # Calculate sample peak
        sample_peak = np.max(np.abs(y))
        sample_peak_db = 20 * np.log10(sample_peak)
        
        # Calculate short-term loudness values
        short_term_loudness_values = calculate_short_term_loudness(y, sr, meter)
        
        # Calculate LRA and LUFS-S Max
        lra, lufs_s_max = calculate_loudness_range(short_term_loudness_values)
        
        file_name = os.path.splitext(os.path.basename(file_path))[0]
        
        return {
            'filename': file_name,
            'lufs_i': f"{loudness:.2f}",
            'lufs_s_max': f"{lufs_s_max:.2f}",
            'lra': f"{lra:.2f}",
            'sample_peak': f"{sample_peak_db:.2f}",
            'true_peak': f"{true_peak_db:.2f}"
        }
        
    except Exception as e:
        logging.error(f"Error analyzing {file_path}: {e}")
        return create_error_result(file_path)

def create_error_result(file_path):
    """Create an error result dictionary"""
    file_name = os.path.splitext(os.path.basename(file_path))[0]
    return {
        'filename': file_name,
        'lufs_i': 'Error',
        'lufs_s_max': 'Error',
        'lra': 'Error',
        'sample_peak': 'Error',
        'true_peak': 'Error'
    }
from flask import Blueprint, render_template, request, jsonify, Response, stream_with_context, send_file
import os
import soundfile as sf
import logging
import tempfile
import pyloudnorm as pyln
import numpy as np
from scipy import signal
import librosa
import json
import matplotlib
matplotlib.use('Agg')  # Set the backend before importing pyplot
import matplotlib.pyplot as plt
import io

main = Blueprint('main', __name__)

def format_file_size(size_in_bytes):
    mb_size = size_in_bytes / (1000 * 1000)  # Convert to MB using base 1000
    rounded_mb = round(mb_size, 1)  # Round to one decimal place
    if rounded_mb.is_integer():
        return f"{int(rounded_mb)} MB"  # Display as whole number
    else:
        return f"{rounded_mb:.1f} MB"  # Display with one decimal place

def format_duration(duration_seconds):
    hours, remainder = divmod(int(duration_seconds), 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes:02d}:{seconds:02d}"

def calculate_true_peak(signal_data, sample_rate):
    # Upsample by a factor of 4 (as per ITU-R BS.1770)
    upsample_factor = 4
    upsampled_signal = signal.resample_poly(signal_data, upsample_factor, 1)
    
    # Find the absolute peak value
    peak_value = np.max(np.abs(upsampled_signal))
    
    # Convert to dB
    return 20 * np.log10(peak_value) if peak_value > 0 else -np.inf

def analyze_file_info(file_path, original_filename=None):
    try:
        # Use soundfile to read the audio file
        data, samplerate = sf.read(file_path)
        file_size = os.path.getsize(file_path)
        file_size_formatted = format_file_size(file_size)
        duration = len(data) / samplerate
        duration_formatted = format_duration(duration)

        # Get the bit depth
        subtype = sf.info(file_path).subtype
        if subtype == 'FLOAT':
            bit_depth = '32 bit-f'
        else:
            bit_depth = subtype.split('_')[-1] + ' bit'

        # Get the file extension
        format_type = os.path.splitext(original_filename or file_path)[1][1:].upper() or 'WAV'

        # Use original filename if provided, otherwise use the file path
        if original_filename:
            filename = original_filename
        else:
            filename = os.path.basename(file_path)

        return {
            'filename': filename,  # Use full filename with extension
            'format': format_type,
            'sample_rate': f"{samplerate:,} Hz",
            'bit_depth': bit_depth,
            'duration': duration_formatted,
            'file_size': file_size_formatted
        }
    except Exception as e:
        logging.error(f"Error processing {file_path}: {e}")
        return None

def calculate_loudness_range(data, rate, meter):
    # Calculate short-term loudness values (3-second blocks)
    block_size = int(3 * rate)  # 3 seconds for short-term loudness
    step_size = int(rate)  # 1 second step
    short_term_loudness_values = []

    for start in range(0, len(data) - block_size + 1, step_size):
        block = data[start:start + block_size]
        block_loudness = meter.integrated_loudness(block)
        if not np.isnan(block_loudness) and block_loudness != float('-inf'):
            short_term_loudness_values.append(block_loudness)

    if not short_term_loudness_values:
        return 0, float('-inf')

    # Calculate loudness range (difference between 95th and 10th percentiles)
    sorted_values = np.array(short_term_loudness_values)
    lra = np.percentile(sorted_values, 95) - np.percentile(sorted_values, 10)
    lufs_s_max = np.max(sorted_values)

    return lra, lufs_s_max

def calculate_multiband_rms(data, sr):
    # Define frequency bands to match desktop version exactly
    low_mid_crossover = 250  # Hz
    mid_high_crossover = 4000  # Hz
    filter_order = 5
    block_size = 3.0  # seconds
    step_size = 1.0  # seconds

    # Create filters using Butterworth design
    nyquist = sr / 2
    low_norm = low_mid_crossover / nyquist
    mid_norm = mid_high_crossover / nyquist
    
    # Design filters with specified order
    b_low, a_low = signal.butter(filter_order, low_norm, btype='low')
    b_mid, a_mid = signal.butter(filter_order, [low_norm, mid_norm], btype='band')
    b_high, a_high = signal.butter(filter_order, mid_norm, btype='high')
    
    # Calculate RMS values in blocks
    def calculate_block_rms(x):
        block_samples = int(block_size * sr)
        step_samples = int(step_size * sr)
        rms_values = []
        
        for start in range(0, len(x), step_samples):
            end = start + block_samples
            if end > len(x):
                end = len(x)
            block = x[start:end]
            if len(block) < block_samples:
                block = np.pad(block, (0, block_samples - len(block)), 'constant')
            
            try:
                rms = np.sqrt(np.mean(np.square(block)))
                rms_db = 20 * np.log10(rms) if rms > 0 else -100
                rms_values.append(rms_db)
            except Exception as e:
                logging.error(f"Error calculating RMS for block: {e}")
                continue
        
        return max(rms_values) if rms_values else -100

    # Handle stereo data
    if data.ndim > 1:
        # Process each channel separately and take the maximum values
        results_per_channel = []
        for channel in range(data.shape[1]):
            channel_data = data[:, channel]
            # Apply filters to this channel
            low_band = signal.lfilter(b_low, a_low, channel_data)
            mid_band = signal.lfilter(b_mid, a_mid, channel_data)
            high_band = signal.lfilter(b_high, a_high, channel_data)
            
            # Calculate RMS for each band
            low_rms = calculate_block_rms(low_band)
            mid_rms = calculate_block_rms(mid_band)
            high_rms = calculate_block_rms(high_band)
            
            results_per_channel.append((low_rms, mid_rms, high_rms))
        
        # Take the maximum values across channels
        low_rms = max(r[0] for r in results_per_channel)
        mid_rms = max(r[1] for r in results_per_channel)
        high_rms = max(r[2] for r in results_per_channel)
    else:
        # Apply filters to mono data
        low_band = signal.lfilter(b_low, a_low, data)
        mid_band = signal.lfilter(b_mid, a_mid, data)
        high_band = signal.lfilter(b_high, a_high, data)
        
        # Calculate RMS for each band
        low_rms = calculate_block_rms(low_band)
        mid_rms = calculate_block_rms(mid_band)
        high_rms = calculate_block_rms(high_band)

    return {
        'low': low_rms,
        'mid': mid_rms,
        'high': high_rms
    }

def analyze_audio(file_path):
    try:
        # Load audio file using soundfile - match desktop version exactly
        y, sr = sf.read(file_path, dtype='float32')
        logging.info(f"[DEBUG] Audio loaded - Shape: {y.shape}, SR: {sr}, dtype: {y.dtype}")
        
        if len(y) == 0:
            raise ValueError("Audio file is empty.")
        
        # Create a loudness meter using the sample rate - match desktop version exactly
        meter = pyln.Meter(sr)  # Default to EBU R128 standard
        
        # Calculate integrated loudness (LUFS-I)
        loudness = meter.integrated_loudness(y)
        logging.info(f"[DEBUG] Integrated loudness: {loudness}")
        
        # Calculate true peak
        if y.ndim > 1:
            true_peaks = [calculate_true_peak(y[:, i], sr) for i in range(y.shape[1])]
            true_peak_db = max(true_peaks)
        else:
            true_peak_db = calculate_true_peak(y, sr)
        
        # Calculate sample peak
        sample_peak = np.max(np.abs(y))
        sample_peak_db = 20 * np.log10(sample_peak)
        
        # Calculate short-term loudness values using 3-second blocks
        short_term_loudness_values = []
        block_size = int(3 * sr)  # 3 seconds for short-term loudness
        step_size = int(sr)  # 1 second step
        
        for start in range(0, len(y) - block_size + 1, step_size):
            block = y[start:start + block_size]
            block_loudness = meter.integrated_loudness(block)
            if not np.isneginf(block_loudness):  # Filter out -inf values like desktop version
                short_term_loudness_values.append(block_loudness)
        
        if short_term_loudness_values:
            lra = np.percentile(short_term_loudness_values, 95) - np.percentile(short_term_loudness_values, 10)
            lufs_s_max = max(short_term_loudness_values)
        else:
            lra = 'N/A'
            lufs_s_max = 'N/A'
        
        # Calculate multiband RMS
        multiband_results = calculate_multiband_rms(y, sr)
        
        # Format values to match desktop version exactly
        formatted_loudness = f"-{abs(loudness):.1f}"
        formatted_lufs_s_max = f"-{abs(lufs_s_max):.1f}" if isinstance(lufs_s_max, float) else 'N/A'
        formatted_lra = f"{lra:.1f}" if isinstance(lra, float) else 'N/A'
        formatted_true_peak = f"-{abs(true_peak_db):.1f}"
        formatted_sample_peak = f"-{abs(sample_peak_db):.1f}"
        
        logging.info(f"[DEBUG] Final values:")
        logging.info(f"[DEBUG] LUFS-I: {formatted_loudness}")
        logging.info(f"[DEBUG] LUFS-S Max: {formatted_lufs_s_max}")
        logging.info(f"[DEBUG] LRA: {formatted_lra}")
        logging.info(f"[DEBUG] True Peak: {formatted_true_peak}")
        logging.info(f"[DEBUG] Sample Peak: {formatted_sample_peak}")
        
        return {
            'lufs_i': formatted_loudness,
            'lufs_s_max': formatted_lufs_s_max,
            'lra': formatted_lra,
            'true_peak': formatted_true_peak,
            'sample_peak': formatted_sample_peak,
            'low': multiband_results['low'],
            'mid': multiband_results['mid'],
            'high': multiband_results['high'],
            'file_info': analyze_file_info(file_path),
            'filename': os.path.basename(file_path)
        }
    except Exception as e:
        logging.error(f"Error analyzing audio: {e}")
        return None

@main.route('/')
def index():
    return render_template('index.html')

@main.route('/analyze', methods=['POST'])
def analyze():
    if 'files[]' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('files[]')

    def generate():
        for file in files:
            if file.filename == '':
                continue

            try:
                # Create a temporary file
                temp_file = tempfile.NamedTemporaryFile(delete=False)
                file.save(temp_file.name)
                temp_file.close()

                # Get file info with original filename
                file_info = analyze_file_info(temp_file.name, file.filename)
                if file_info:
                    # Send initial file info
                    partial_data = {
                        'type': 'partial',
                        'result': {
                            'file_info': file_info,
                            'filename': file.filename,
                            'status': 'analyzing'
                        }
                    }
                    yield f"data: {json.dumps(partial_data)}\n\n"

                # Analyze audio
                result = analyze_audio(temp_file.name)
                if result:
                    # Update file info with original filename
                    result['file_info'] = file_info
                    result['filename'] = file.filename
                    result['status'] = 'complete'
                    
                    # Send complete result
                    update_data = {
                        'type': 'update',
                        'result': result
                    }
                    yield f"data: {json.dumps(update_data)}\n\n"

                # Clean up temp file
                os.unlink(temp_file.name)

            except Exception as e:
                logging.error(f"Error processing file: {e}")
                continue

        # Send completion message
        complete_data = {
            'type': 'complete',
            'message': 'Analysis completed'
        }
        yield f"data: {json.dumps(complete_data)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no'
        }
    )

@main.route('/generate_multiband_chart', methods=['POST'])
def generate_multiband_chart():
    try:
        # Get the analysis data from the request
        data = request.get_json()
        if not data or 'files' not in data:
            return jsonify({'error': 'No data provided'}), 400

        # Create the chart without GUI
        plt.ioff()  # Turn off interactive mode
        fig = plt.figure(figsize=(12, 8), facecolor='#2b2b2b')
        ax = plt.axes(facecolor='#2b2b2b')

        # Set more vivid colors for the lines using rainbow colormap
        colors = plt.cm.rainbow(np.linspace(0, 1, len(data['files'])))

        frequency_bands = ['Low', 'Mid', 'High']
        for file_data, color in zip(data['files'], colors):
            filename = os.path.splitext(file_data['filename'])[0]  # Remove extension
            rms_values = [file_data['low'], file_data['mid'], file_data['high']]
            plt.plot(frequency_bands, rms_values, marker='o', label=filename, color=color, linewidth=2)

        # Customize the chart appearance
        plt.xlabel('Frequency Bands', color='white', fontsize=12)
        plt.ylabel('RMS Level (dB)', color='white', fontsize=12)
        plt.title('Multiband RMS Analysis', color='white', fontsize=16)
        
        # Customize the legend
        legend = plt.legend(facecolor='#2b2b2b', edgecolor='#555555')
        plt.setp(legend.get_texts(), color='white')

        # Set y-axis limits and customize grid
        plt.ylim(-30, 0)  # You might want to make these configurable
        plt.yticks(np.arange(-30, 1, 1), color='white')
        plt.xticks(color='white')
        plt.grid(True, which='both', linestyle='--', linewidth=0.5, color='#555555', alpha=0.7)

        # Customize spines and ticks
        for spine in ax.spines.values():
            spine.set_edgecolor('#555555')
        ax.tick_params(axis='both', colors='white', which='both')

        plt.tight_layout()

        # Save the chart to a bytes buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png', facecolor='#2b2b2b', edgecolor='none', bbox_inches='tight')
        plt.close(fig)  # Explicitly close the figure
        buf.seek(0)

        return send_file(buf, mimetype='image/png')

    except Exception as e:
        logging.error(f"Error generating chart: {e}")
        return jsonify({'error': str(e)}), 500

# Comment out metadata routes for now
# @main.route('/metadata', methods=['POST'])
# def analyze_metadata():
#     ... 
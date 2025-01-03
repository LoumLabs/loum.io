from flask import Flask, render_template, request, jsonify, send_file
import os
import json
from werkzeug.utils import secure_filename
from metadata import get_metadata, save_metadata, create_backup, validate_metadata

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get-metadata', methods=['POST'])
def get_file_metadata():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # Save file if it doesn't exist
        if not os.path.exists(filepath):
            file.save(filepath)
        
        # Get metadata
        metadata = get_metadata(filepath)
        return jsonify(metadata)
    
    return jsonify({'error': 'Invalid file'}), 400

@app.route('/api/save-metadata', methods=['POST'])
def save_file_metadata():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    if 'metadata' not in request.form:
        return jsonify({'error': 'No metadata provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        metadata = json.loads(request.form['metadata'])
        metadata = validate_metadata(metadata)
        
        if file:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # Save file if it doesn't exist
            if not os.path.exists(filepath):
                file.save(filepath)
            
            # Create backup before modifying
            if not create_backup(filepath):
                return jsonify({'error': 'Failed to create backup'}), 500
            
            # Save metadata
            if save_metadata(filepath, metadata):
                return jsonify({'success': True})
            else:
                return jsonify({'error': 'Failed to save metadata'}), 500
    
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid metadata format'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Invalid file'}), 400

if __name__ == '__main__':
    app.run(debug=True) 
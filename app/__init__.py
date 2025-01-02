from flask import Flask
from flask_socketio import SocketIO
import os
import logging

socketio = SocketIO()

def create_app():
    # Configure logging
    logging.basicConfig(level=logging.DEBUG)
    
    app = Flask(__name__, 
                template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'templates'),
                static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static'))
    
    app.config['SECRET_KEY'] = 'your-secret-key'
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size
    app.config['DEBUG'] = True  # Enable debug mode
    
    # Configure upload directory
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tmp')
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Configure allowed file types
    app.config['ALLOWED_EXTENSIONS'] = {'wav', 'mp3', 'aac', 'm4a', 'ogg', 'flac'}
    
    # Configure file list storage
    app.config['FILE_LIST'] = []
    
    from .routes import main
    app.register_blueprint(main)
    
    socketio.init_app(app)
    
    return app 
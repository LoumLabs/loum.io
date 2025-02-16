from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import re
import json
import urllib.request
import urllib.parse
import io
import uuid
import tempfile
import shutil
import logging
import asyncio

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioTranscriptionHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.temp_dir = tempfile.mkdtemp()
        super().__init__(*args, **kwargs)

    def do_GET(self):
        logger.info(f'Handling GET request for: {self.path}')
        
        # Check if this is a request for a temporary audio file
        audio_match = re.match(r'^/temp/audio/([^/]+)$', self.path)
        if audio_match:
            file_id = audio_match.group(1)
            file_path = os.path.join(self.temp_dir, file_id)
            if os.path.exists(file_path):
                self.send_response(200)
                self.send_header('Content-Type', 'audio/wav')
                self.send_header('Content-Length', os.path.getsize(file_path))
                self.end_headers()
                with open(file_path, 'rb') as f:
                    shutil.copyfileobj(f, self.wfile)
                return
            else:
                self.send_error(404, 'Audio file not found')
                return
                
        return SimpleHTTPRequestHandler.do_GET(self)

    async def transcribe_with_deepgram(self, audio_content, content_type):
        api_key = os.getenv('DEEPGRAM_API_KEY')
        if not api_key:
            raise ValueError('Deepgram API key not found in environment')

        url = 'https://api.deepgram.com/v1/listen?smart_format=true&model=general&language=en-US'
        
        headers = {
            'Authorization': f'Token {api_key}',
            'Content-Type': content_type
        }
        
        try:
            req = urllib.request.Request(
                url,
                data=audio_content,
                headers=headers,
                method='POST'
            )
            
            with urllib.request.urlopen(req) as response:
                response_data = json.loads(response.read().decode())
                
                if 'results' in response_data and 'channels' in response_data['results']:
                    transcript = response_data['results']['channels'][0]['alternatives'][0]
                    return {
                        'text': transcript['transcript'],
                        'confidence': transcript['confidence']
                    }
                else:
                    raise ValueError('Unexpected response format from Deepgram')
                    
        except Exception as e:
            logger.error(f'Error calling Deepgram API: {e}')
            raise

    def do_POST(self):
        logger.info(f'Handling POST request for: {self.path}')
        
        if self.path == '/api/transcribe' or self.path == '/audio2text/api/transcribe':
            try:
                # Get headers
                content_type = self.headers.get('Content-Type', '')
                content_length = int(self.headers.get('Content-Length', 0))
                
                logger.info(f'Headers received:')
                for header, value in self.headers.items():
                    logger.info(f'{header}: {value}')
                
                # Read the raw data
                audio_content = self.rfile.read(content_length)
                
                # Extract the actual audio data from the multipart form
                if b'Content-Type: audio/' in audio_content:
                    # Find the audio content boundary
                    start = audio_content.find(b'\r\n\r\n') + 4
                    end = audio_content.rfind(b'\r\n--')
                    if start > 0 and end > 0:
                        audio_content = audio_content[start:end]
                
                # Save the audio file temporarily
                file_id = str(uuid.uuid4())
                file_path = os.path.join(self.temp_dir, file_id)
                with open(file_path, 'wb') as f:
                    f.write(audio_content)
                
                # Get the actual content type (audio/wav, audio/mp3, etc.)
                audio_type = 'audio/wav'  # Default to wav if not found
                if b'Content-Type: audio/' in audio_content:
                    type_match = re.search(b'Content-Type: (audio/[^\r\n]+)', audio_content)
                    if type_match:
                        audio_type = type_match.group(1).decode()

                # Transcribe the audio
                response_data = asyncio.run(self.transcribe_with_deepgram(audio_content, audio_type))
                
                # Add the audio file URL to the response
                response_data['audioUrl'] = f'/temp/audio/{file_id}'

                # Send the response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
                
            except Exception as e:
                logger.error(f'Error handling transcription: {e}')
                self.send_error(500, f'Internal server error: {str(e)}')
                return
        else:
            self.send_error(404, 'Endpoint not found')

    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        SimpleHTTPRequestHandler.end_headers(self)

    def do_OPTIONS(self):
        # Handle preflight requests
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('', port), AudioTranscriptionHandler)
    logger.info(f'Starting server on port {port}...')
    server.serve_forever()
#!/usr/bin/env python3
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import re
import json
import urllib.request
import urllib.parse
import webbrowser
import time
import sys

class RefreshMixerHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        print(f'Handling request for: {self.path}')
        
        # Check if this is a mixer route
        mixer_match = re.match(r'^/mixer/([^/]+)/?$', self.path)
        config_match = re.match(r'^/mixer/configs/([^/]+)\.json$', self.path)
        proxy_match = re.match(r'^/proxy/(.+)$', self.path)
        
        if mixer_match:
            print('Serving mixer app')
            collection_name = mixer_match.group(1)
            print(f'Collection name: {collection_name}')
            
            # Check if config exists
            config_path = os.path.join('mixer', 'configs', f'{collection_name}.json')
            if not os.path.exists(config_path):
                print(f'Warning: Config file not found: {config_path}')
            
            # Serve the mixer's index.html with refresh header
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.send_header('Refresh', '1;url=' + self.path)  # Add refresh header
            self.end_headers()
            
            # Read and serve the file
            try:
                with open(os.path.join(os.getcwd(), 'mixer/index.html'), 'rb') as f:
                    self.wfile.write(f.read())
            except:
                self.send_error(404, 'File not found')
            return
            
        elif config_match:
            print('Serving config file')
            config_name = config_match.group(1)
            config_path = os.path.join('mixer', 'configs', f'{config_name}.json')
            
            if os.path.exists(config_path):
                print(f'Found config file: {config_path}')
                try:
                    with open(config_path, 'rb') as f:
                        content = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Content-Length', len(content))
                    self.end_headers()
                    self.wfile.write(content)
                    return
                except Exception as e:
                    print(f'Error reading config file: {e}')
                    self.send_error(500, f'Error reading config file: {str(e)}')
                    return
            else:
                print(f'Config file not found: {config_path}')
                self.send_error(404, f'Config file not found: {config_name}')
                return
                
        elif proxy_match:
            print('Proxying file request')
            encoded_url = proxy_match.group(1)
            url = urllib.parse.unquote(encoded_url)
            
            try:
                # Create request with headers to handle redirects
                req = urllib.request.Request(
                    url,
                    headers={
                        'User-Agent': 'Mozilla/5.0',
                        'Accept': '*/*'
                    }
                )
                
                # Open URL and follow redirects
                with urllib.request.urlopen(req) as response:
                    content = response.read()
                    content_type = response.getheader('Content-Type')
                    
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', len(content))
                    self.end_headers()
                    self.wfile.write(content)
                    return
            except Exception as e:
                print(f'Error proxying file: {e}')
                self.send_error(500, f'Error proxying file: {str(e)}')
                return
        
        # Handle the request normally (serve static files)
        return SimpleHTTPRequestHandler.do_GET(self)

    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        SimpleHTTPRequestHandler.end_headers(self)

def main():
    # Start server on port 8765
    port = 8765
    server = HTTPServer(('localhost', port), RefreshMixerHandler)
    print(f'Starting refresh server on port {port}...')
    
    # Open browser to the mixer app
    collection = sys.argv[1] if len(sys.argv) > 1 else 'hungryghost'
    url = f'http://localhost:{port}/mixer/{collection}'
    webbrowser.open(url)
    
    # Run server for a short time to handle the refresh
    timeout = time.time() + 5  # 5 second timeout
    while time.time() < timeout:
        server.handle_request()
    
    print('Refresh complete')

if __name__ == '__main__':
    main() 
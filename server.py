from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import re
import json
import urllib.request
import urllib.parse

class MixerHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        print(f'Handling request for: {self.path}')
        
        # Check if this is a mixer route
        mixer_match = re.match(r'^/mixer/([^/]+)/?$', self.path)
        config_match = re.match(r'^/configs/([^/]+)\.json$', self.path)
        proxy_match = re.match(r'^/proxy/(.+)$', self.path)
        
        if mixer_match:
            print('Serving mixer app')
            # Serve the mixer's index.html for any /mixer/* route
            self.path = '/mixer/index.html'
        elif config_match:
            print('Serving config file')
            config_name = config_match.group(1)
            config_path = os.path.join('configs', f'{config_name}.json')
            
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

if __name__ == '__main__':
    port = 8000
    server = HTTPServer(('', port), MixerHandler)
    print(f'Starting server on port {port}...')
    server.serve_forever() 
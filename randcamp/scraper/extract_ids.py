import requests
import re
import json

def extract_album_id(url):
    print(f"\nProcessing {url}")
    try:
        response = requests.get(url)
        response.raise_for_status()
        
        # Look for album ID in various patterns
        patterns = [
            r'album=(\d+)',  # Standard embed code
            r'album_id=(\d+)',  # Alternative embed code
            r'album/(\d+)',  # URL pattern
            r'album_id&quot;:(\d+)'  # JSON data
        ]
        
        for pattern in patterns:
            match = re.search(pattern, response.text)
            if match:
                album_id = match.group(1)
                print(f"✓ Found album ID: {album_id}")
                return album_id
        
        print("✗ Could not find album ID")
        return None
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return None

def main():
    # Load URLs from album_urls.json
    try:
        with open('album_urls.json', 'r') as f:
            urls = json.load(f)
    except FileNotFoundError:
        print("Error: album_urls.json not found!")
        return
    
    print(f"Loaded {len(urls)} URLs from album_urls.json")
    
    # Process each URL and collect results
    albums = []
    for i, url in enumerate(urls, 1):
        print(f"\n[{i}/{len(urls)}]", end=" ")
        album_id = extract_album_id(url)
        if album_id:
            albums.append({
                "id": album_id,
                "url": url
            })
            # Save progress after each successful album
            with open('bandcamp_albums.json', 'w') as f:
                json.dump(albums, f, indent=2)
    
    print(f"\nFound {len(albums)} album IDs")
    print("Results saved to bandcamp_albums.json")

if __name__ == '__main__':
    main()

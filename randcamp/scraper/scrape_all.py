from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException
import requests
import json
import time
import re

def extract_album_id(url):
    print(f"Processing {url}")
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

def get_album_urls():
    # Set up Chrome options
    chrome_options = Options()
    chrome_options.add_argument('--headless=new')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--window-size=1920,1080')
    chrome_options.add_argument('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')
    
    print("Setting up Chrome driver...")
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    
    album_urls = []
    
    try:
        # Load the electronic tag page with all releases
        print("Loading Bandcamp electronic tag page...")
        driver.get('https://bandcamp.com/tag/electronic?tab=all_releases')
        time.sleep(5)
        
        # Wait for grid items to appear
        print("Waiting for albums to load...")
        try:
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, '.music-grid-item'))
            )
        except TimeoutException:
            print("Warning: Timeout waiting for albums. Trying to proceed anyway...")
        
        # Scroll down a few times to load more content
        print("Scrolling to load more albums...")
        for i in range(5):
            print(f"Scroll {i+1}/5")
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(3)
            
            # Try to find albums after each scroll
            elements = driver.find_elements(By.CSS_SELECTOR, '.music-grid-item a[href*="/album/"]')
            for elem in elements:
                try:
                    url = elem.get_attribute('href')
                    if url and '/album/' in url and url not in album_urls:
                        print(f"Found: {url}")
                        album_urls.append(url)
                except:
                    continue
        
        # Final check for any missed albums
        print("\nDoing final check for albums...")
        elements = driver.find_elements(By.CSS_SELECTOR, 'a[href*="/album/"]')
        for elem in elements:
            try:
                url = elem.get_attribute('href')
                if url and '/album/' in url and url not in album_urls:
                    print(f"Found: {url}")
                    album_urls.append(url)
            except:
                continue
                
        return album_urls
        
    except Exception as e:
        print(f"An error occurred while getting URLs: {str(e)}")
        return album_urls
    finally:
        driver.quit()

def main():
    # Step 1: Get album URLs
    print("Step 1: Getting album URLs...")
    album_urls = get_album_urls()
    print(f"Found {len(album_urls)} album URLs")
    
    # Save URLs for reference
    with open('album_urls.json', 'w') as f:
        json.dump(album_urls, f, indent=2)
    
    # Step 2: Extract album IDs
    print("\nStep 2: Extracting album IDs...")
    albums = []
    for i, url in enumerate(album_urls, 1):
        print(f"\n[{i}/{len(album_urls)}]", end=" ")
        album_id = extract_album_id(url)
        if album_id:
            albums.append({
                "id": album_id,
                "url": url
            })
            # Save progress after each successful extraction
            with open('bandcamp_albums.json', 'w') as f:
                json.dump(albums, f, indent=2)
    
    print(f"\nFinished! Found {len(albums)} albums with IDs")
    print("Results saved to bandcamp_albums.json")

if __name__ == '__main__':
    main()

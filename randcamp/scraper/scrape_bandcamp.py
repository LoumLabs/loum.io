from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException, WebDriverException
import re
import json
import time

def extract_album_id(page_source):
    # Look for album ID in the embedded player script
    match = re.search(r'album=(\d+)', page_source)
    if match:
        return match.group(1)
    return None

def scrape_bandcamp_albums():
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
    
    albums = []
    
    try:
        # Load the electronic music discovery page
        print("Loading Bandcamp electronic music page...")
        driver.get('https://bandcamp.com/tag/electronic?tab=all_releases')
        time.sleep(5)  # Give initial page time to load
        
        # Wait for the grid to load and get initial album links
        print("Waiting for albums to load...")
        try:
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, '.discover-item'))
            )
        except TimeoutException:
            # Try alternative selector for tag page
            WebDriverWait(driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, '.music-grid-item'))
            )
        
        # Save initial page source for debugging
        with open('initial_page.html', 'w', encoding='utf-8') as f:
            f.write(driver.page_source)
        
        # Get all album links
        print("Finding album links...")
        album_links = driver.find_elements(By.CSS_SELECTOR, '.music-grid-item a[href*="/album/"]') or \
                     driver.find_elements(By.CSS_SELECTOR, '.discover-item a[href*="/album/"]')
        
        album_urls = []
        for link in album_links:
            try:
                url = link.get_attribute('href')
                if url and '/album/' in url:
                    album_urls.append(url)
            except:
                continue
        
        print(f"Found {len(album_urls)} album links")
        
        # Visit each album page and extract the ID
        for i, url in enumerate(album_urls, 1):
            try:
                print(f"\n[{i}/{len(album_urls)}] Visiting {url}")
                driver.get(url)
                time.sleep(5)  # Wait for page load
                
                album_id = extract_album_id(driver.page_source)
                if album_id:
                    albums.append({
                        'id': album_id,
                        'url': url
                    })
                    print(f" Found album ID: {album_id}")
                else:
                    print(" Could not find album ID")
                    # Save failed page for debugging
                    with open(f'failed_album_{i}.html', 'w', encoding='utf-8') as f:
                        f.write(driver.page_source)
            except WebDriverException as e:
                print(f"Browser error for {url}: {str(e)}")
                continue
            except Exception as e:
                print(f"Error processing {url}: {str(e)}")
                continue
            
            # Save progress after each successful album
            if albums:
                with open('bandcamp_albums.json', 'w') as f:
                    json.dump(albums, f, indent=2)
        
        print(f"\nSuccess! Found {len(albums)} albums")
        print("Album data saved to bandcamp_albums.json")
        
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        if albums:
            print("Saving albums found so far...")
            with open('bandcamp_albums.json', 'w') as f:
                json.dump(albums, f, indent=2)
    finally:
        try:
            driver.quit()
        except:
            pass

if __name__ == '__main__':
    scrape_bandcamp_albums()

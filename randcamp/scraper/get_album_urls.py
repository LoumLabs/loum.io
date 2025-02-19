from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException
import json
import time

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
        
        # Save page source for debugging
        with open('page_source.html', 'w', encoding='utf-8') as f:
            f.write(driver.page_source)
        
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
        
        # Save URLs to file
        with open('album_urls.json', 'w') as f:
            json.dump(album_urls, f, indent=2)
        
        print(f"\nSuccess! Found {len(album_urls)} unique album URLs")
        print("URLs saved to album_urls.json")
        
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        if album_urls:
            print("Saving URLs found so far...")
            with open('album_urls.json', 'w') as f:
                json.dump(album_urls, f, indent=2)
    finally:
        driver.quit()

if __name__ == '__main__':
    get_album_urls()

"""
Amazon List Creator - Selenium with Chrome Profile
Uses your existing Chrome profile so you're already logged in.

IMPORTANT: Close ALL Chrome windows before running!
"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import http.server
import json
import threading

# Config
CHROME_PROFILE_PATH = r"C:\Users\Snir\AppData\Local\Google\Chrome\User Data"
STOREFRONT_ID = "influencer-03f5875c"
PORT = 3847

# Type A Finds - 32 ASINs
ASINS = [
    "B0016HF5GK", "B01728NLRG", "B0764HS4SL", "B07F4128P2", "B07FNRXFTD",
    "B07MHMBHT7", "B07QPZYRB8", "B08ZY8HT1G", "B0997PYJJT", "B09BJRSZVC",
    "B09N3WPTY6", "B0B288QLYD", "B0B2K47S1T", "B0BJLBF8S8", "B0BRRPP5KH",
    "B0BTCZ2RR9", "B0C2C9NHZW", "B0C35D7X75", "B0C7C5NFJ3", "B0C89B5S14",
    "B0CGVSKR1G", "B0CHHFKWPV", "B0CHYL7R5C", "B0D3139TW6", "B0D313JRLG",
    "B0D69JSBZ5", "B0D8BQ4LFC", "B0DD5S7KF9", "B0FKBF6TYQ", "B0FL9L2CKD",
    "B0FM77N3H8", "B0FQ2QCZXK"
]

driver = None

def setup_chrome():
    global driver
    print("Setting up Chrome with your profile...")
    print("Make sure ALL Chrome windows are closed!\n")

    options = Options()
    options.add_argument(f"--user-data-dir={CHROME_PROFILE_PATH}")
    options.add_argument("--profile-directory=Default")
    options.add_argument("--start-maximized")
    # Don't use headless - we need to see and interact

    driver = webdriver.Chrome(options=options)
    print("Chrome launched!")
    return driver

def go_to_create_page():
    url = f"https://www.amazon.com/create/collection?affiliateId={STOREFRONT_ID}"
    print(f"Navigating to: {url}")
    driver.get(url)
    time.sleep(3)
    print("On create collection page")

def click_add_products():
    """Click the ADD PRODUCTS button"""
    try:
        btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Add') or contains(text(), 'ADD')]"))
        )
        btn.click()
        print("Clicked ADD PRODUCTS")
        time.sleep(2)
        return True
    except Exception as e:
        print(f"Could not click ADD PRODUCTS: {e}")
        return False

def click_browse_history_tab():
    """Click the Browse History tab (3rd tab)"""
    try:
        tabs = driver.find_elements(By.CSS_SELECTOR, "[role='tab'], .tab, button")
        for tab in tabs:
            if "history" in tab.text.lower() or "browse" in tab.text.lower():
                tab.click()
                print("Clicked Browse History tab")
                time.sleep(1)
                return True
        # Try 3rd tab
        tab_buttons = driver.find_elements(By.CSS_SELECTOR, "[role='tab']")
        if len(tab_buttons) >= 3:
            tab_buttons[2].click()
            print("Clicked 3rd tab")
            time.sleep(1)
            return True
    except Exception as e:
        print(f"Could not click tab: {e}")
    return False

def add_product(asin):
    """Search and add a product by ASIN"""
    try:
        # Find all inputs and get index 24 (the modal search)
        inputs = driver.find_elements(By.TAG_NAME, "input")
        if len(inputs) > 24:
            search_input = inputs[24]
        else:
            # Fallback: find by placeholder
            search_input = driver.find_element(By.CSS_SELECTOR, "input[placeholder*='amazon' i], input[placeholder*='search' i]")

        search_input.clear()
        search_input.send_keys(asin)
        time.sleep(0.5)
        search_input.send_keys(Keys.ENTER)
        print(f"  Searched: {asin}")
        time.sleep(2)

        # Click first product result
        try:
            # Look for product cards or results
            product = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-asin], .product-card, .s-result-item, [class*='product'], [class*='result']"))
            )
            product.click()
            print(f"  Added: {asin}")
            time.sleep(1)
            return True
        except:
            print(f"  Could not find product for: {asin}")
            return False

    except Exception as e:
        print(f"  Error adding {asin}: {e}")
        return False

def add_all_products():
    """Add all ASINs one by one"""
    print(f"\nAdding {len(ASINS)} products...")
    success = 0
    failed = []

    for i, asin in enumerate(ASINS):
        print(f"[{i+1}/{len(ASINS)}] ", end="")
        if add_product(asin):
            success += 1
        else:
            failed.append(asin)
        time.sleep(0.5)

    print(f"\n Done! {success}/{len(ASINS)} added")
    if failed:
        print(f"Failed: {failed}")
    return {"success": success, "failed": failed}

def interactive_mode():
    """Interactive mode for testing"""
    print("\n" + "="*50)
    print("INTERACTIVE MODE")
    print("="*50)
    print("Commands:")
    print("  1 - Go to create page")
    print("  2 - Click ADD PRODUCTS")
    print("  3 - Click Browse History tab")
    print("  4 - Add first ASIN (test)")
    print("  5 - Add ALL products")
    print("  s - Take screenshot")
    print("  q - Quit")
    print("="*50 + "\n")

    while True:
        cmd = input("\nCommand: ").strip().lower()

        if cmd == "1":
            go_to_create_page()
        elif cmd == "2":
            click_add_products()
        elif cmd == "3":
            click_browse_history_tab()
        elif cmd == "4":
            add_product(ASINS[0])
        elif cmd == "5":
            add_all_products()
        elif cmd == "s":
            driver.save_screenshot("browser-state/selenium-screenshot.png")
            print("Screenshot saved")
        elif cmd == "q":
            print("Closing browser...")
            driver.quit()
            break
        else:
            print("Unknown command")

if __name__ == "__main__":
    print("="*50)
    print("AMAZON LIST CREATOR - SELENIUM")
    print("="*50 + "\n")

    setup_chrome()
    interactive_mode()

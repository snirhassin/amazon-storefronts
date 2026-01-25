"""
Amazon List Creator - Using selectors from Playwright codegen
"""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

STOREFRONT_ID = "influencer-03f5875c"
PROFILE_DIR = r"C:\Users\Snir\documents\claude\amazon-storefronts\browser-state\selenium-profile"

ASINS = [
    "B0016HF5GK", "B01728NLRG", "B0764HS4SL", "B07F4128P2", "B07FNRXFTD",
    "B07MHMBHT7", "B07QPZYRB8", "B08ZY8HT1G", "B0997PYJJT", "B09BJRSZVC",
    "B09N3WPTY6", "B0B288QLYD", "B0B2K47S1T", "B0BJLBF8S8", "B0BRRPP5KH",
    "B0BTCZ2RR9", "B0C2C9NHZW", "B0C35D7X75", "B0C7C5NFJ3", "B0C89B5S14",
    "B0CGVSKR1G", "B0CHHFKWPV", "B0CHYL7R5C", "B0D3139TW6", "B0D313JRLG",
    "B0D69JSBZ5", "B0D8BQ4LFC", "B0DD5S7KF9", "B0FKBF6TYQ", "B0FL9L2CKD",
    "B0FM77N3H8", "B0FQ2QCZXK"
]

print("Starting Chrome with persistent profile...")
options = Options()
options.add_argument("--start-maximized")
options.add_argument(f"--user-data-dir={PROFILE_DIR}")
options.add_argument("--disable-blink-features=AutomationControlled")
options.add_experimental_option("excludeSwitches", ["enable-automation"])
options.add_experimental_option("useAutomationExtension", False)

driver = webdriver.Chrome(options=options)
wait = WebDriverWait(driver, 10)
print("Chrome opened!")

# Check if already logged in
driver.get("https://www.amazon.com")
time.sleep(2)
try:
    account = driver.find_element(By.ID, "nav-link-accountList")
    account_text = account.text.lower()
    if "sign in" in account_text:
        print("\n>>> Not logged in. Please LOG IN, then press Enter <<<")
        driver.get("https://www.amazon.com/ap/signin")
        input()
    else:
        print("Already logged in!")
except:
    print("\n>>> Please LOG IN TO AMAZON, then press Enter <<<")
    driver.get("https://www.amazon.com/ap/signin")
    input()

# Go to create collection page
url = f"https://www.amazon.com/create/collection?affiliateId={STOREFRONT_ID}"
print(f"Going to: {url}")
driver.get(url)
time.sleep(3)

# Click "Add products" button
print("Clicking 'Add products'...")
try:
    add_btn = wait.until(EC.element_to_be_clickable((By.XPATH, "//*[contains(text(), 'Add products')]")))
    add_btn.click()
    time.sleep(2)
except Exception as e:
    print(f"Could not click Add products: {e}")
    print(">>> Click 'Add products' manually, then press Enter <<<")
    input()

# Click "Browse History" tab
print("Clicking 'Browse History' tab...")
try:
    browse_tab = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid='ocpBrowseHistory']")))
    browse_tab.click()
    time.sleep(2)
except Exception as e:
    print(f"Could not click Browse History: {e}")
    print(">>> Click 'Browse History' tab manually, then press Enter <<<")
    input()

def find_search_box():
    """Find the search box using multiple selectors"""
    selectors = [
        "input[aria-label='Search Amazon.com']",
        "input[placeholder*='Search']",
        "input[placeholder*='search']",
        "input[name*='search']",
        "[data-testid*='search'] input",
    ]
    for sel in selectors:
        try:
            elem = driver.find_element(By.CSS_SELECTOR, sel)
            if elem.is_displayed():
                return elem
        except:
            pass

    # Fallback: get all visible text inputs
    inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='text'], input:not([type])")
    for inp in inputs:
        try:
            if inp.is_displayed() and inp.size['height'] > 20:
                placeholder = inp.get_attribute('placeholder') or ''
                aria = inp.get_attribute('aria-label') or ''
                if 'search' in placeholder.lower() or 'search' in aria.lower() or 'amazon' in placeholder.lower():
                    return inp
        except:
            pass
    return None

def add_asin(asin):
    try:
        # Find search box
        search = find_search_box()
        if not search:
            print(f"  Search box not found!")
            return False

        search.clear()
        search.send_keys(asin)
        search.send_keys(Keys.ENTER)
        time.sleep(2)

        # Click first product result (any clickable product card/image)
        try:
            # Try clicking any product result
            product = wait.until(EC.element_to_be_clickable((
                By.XPATH, "//div[contains(@class, 'product') or contains(@class, 'result')]//img | //img[contains(@src, 'images-amazon')]"
            )))
            product.click()
            time.sleep(2)
        except:
            # Fallback: click any substantial image
            images = driver.find_elements(By.TAG_NAME, "img")
            for img in images:
                try:
                    if img.is_displayed() and img.size['height'] > 50:
                        src = img.get_attribute('src') or ''
                        if 'images-amazon' in src or 'media-amazon' in src:
                            img.click()
                            time.sleep(2)
                            break
                except:
                    continue

        # Click "Add product" button
        try:
            add_product_btn = wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR, "[data-testid='tagProductButton']"
            )))
            add_product_btn.click()
            print(f"  Added: {asin}")
            time.sleep(1)
            return True
        except:
            # Fallback: find button with "Add product" text
            buttons = driver.find_elements(By.XPATH, "//*[contains(text(), 'Add product')]")
            for btn in buttons:
                try:
                    btn.click()
                    print(f"  Added: {asin}")
                    time.sleep(1)
                    return True
                except:
                    continue
            print(f"  Could not find Add product button for: {asin}")
            return False

    except Exception as e:
        print(f"  Error: {e}")
        return False

# Verify search box exists before starting
print("Looking for search box...")
test_search = find_search_box()
if test_search:
    print(f"  Found search box: {test_search.get_attribute('placeholder') or test_search.get_attribute('aria-label')}")
else:
    print("  Search box NOT found. Listing all inputs:")
    inputs = driver.find_elements(By.TAG_NAME, "input")
    for i, inp in enumerate(inputs):
        try:
            if inp.is_displayed():
                print(f"    [{i}] placeholder='{inp.get_attribute('placeholder')}' aria='{inp.get_attribute('aria-label')}'")
        except:
            pass
    print(">>> Make sure the modal is open with Browse History tab selected, then press Enter <<<")
    input()

print(f"\nAdding {len(ASINS)} products...")
success = 0
failed = []

for i, asin in enumerate(ASINS):
    print(f"[{i+1}/{len(ASINS)}] {asin}")
    if add_asin(asin):
        success += 1
    else:
        failed.append(asin)

print(f"\nDone! {success}/{len(ASINS)} added")
if failed:
    print(f"Failed ASINs: {failed}")

print("\nPress Enter to close browser...")
input()
driver.quit()

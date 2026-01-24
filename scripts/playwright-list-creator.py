"""
Amazon List Creator - Playwright with exact selectors from codegen
"""

import asyncio
from playwright.sync_api import sync_playwright
import time

STOREFRONT_ID = "influencer-03f5875c"
PROFILE_DIR = r"C:\Users\Snir\documents\claude\amazon-storefronts\browser-state\playwright-profile"

ASINS = [
    "B0016HF5GK", "B01728NLRG", "B0764HS4SL", "B07F4128P2", "B07FNRXFTD",
    "B07MHMBHT7", "B07QPZYRB8", "B08ZY8HT1G", "B0997PYJJT", "B09BJRSZVC",
    "B09N3WPTY6", "B0B288QLYD", "B0B2K47S1T", "B0BJLBF8S8", "B0BRRPP5KH",
    "B0BTCZ2RR9", "B0C2C9NHZW", "B0C35D7X75", "B0C7C5NFJ3", "B0C89B5S14",
    "B0CGVSKR1G", "B0CHHFKWPV", "B0CHYL7R5C", "B0D3139TW6", "B0D313JRLG",
    "B0D69JSBZ5", "B0D8BQ4LFC", "B0DD5S7KF9", "B0FKBF6TYQ", "B0FL9L2CKD",
    "B0FM77N3H8", "B0FQ2QCZXK"
]

def main():
    with sync_playwright() as p:
        print("Starting browser with persistent profile...")

        # Use persistent context to save login
        context = p.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=False,
            viewport={"width": 1920, "height": 1080},
            args=["--start-maximized"]
        )

        page = context.pages[0] if context.pages else context.new_page()
        print("Browser opened!")

        # Navigate to Amazon and check login
        print("Navigate to Amazon and log in if needed...")
        print(f"\n>>> Go to this URL and log in: https://www.amazon.com/create/collection?affiliateId={STOREFRONT_ID}")
        print(">>> Press Enter here when you're on the create collection page <<<")
        input()

        page.wait_for_timeout(2000)

        # Click "Add products"
        print("Clicking 'Add products'...")
        try:
            page.get_by_text("Add products").click()
            page.wait_for_timeout(2000)
        except:
            print(">>> Click 'Add products' manually, then press Enter <<<")
            input()

        # Click "Browse History" tab
        print("Clicking 'Browse History' tab...")
        try:
            page.get_by_test_id("ocpBrowseHistory").click()
            page.wait_for_timeout(1000)
        except:
            print(">>> Click 'Browse History' tab manually, then press Enter <<<")
            input()

        def add_asin(asin):
            try:
                # Use exact selector from recording
                search_box = page.get_by_role("textbox", name="Search Amazon.com")
                search_box.click()
                search_box.fill(asin)
                search_box.press("Enter")
                page.wait_for_timeout(2000)

                # Click first product result (the image/card)
                # Try to find and click any product image
                try:
                    page.locator("img[src*='images-amazon']").first.click()
                    page.wait_for_timeout(2000)
                except:
                    # Try clicking any visible product
                    page.locator("[class*='product'] img, [class*='result'] img").first.click()
                    page.wait_for_timeout(2000)

                # Click "Add product" button
                try:
                    page.get_by_test_id("tagProductButton").get_by_text("Add product").click()
                except:
                    page.get_by_text("Add product").click()

                print(f"  Added: {asin}")
                page.wait_for_timeout(1000)
                return True

            except Exception as e:
                print(f"  Error: {e}")
                return False

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
        context.close()

if __name__ == "__main__":
    main()

"""
Amazon List Creator - Using exact recorded selectors
"""

from playwright.sync_api import sync_playwright

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
        print("Starting Chrome (not Chromium)...")
        context = p.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=False,
            channel="chrome",  # Use system Chrome
            viewport={"width": 1920, "height": 1080}
        )
        page = context.pages[0] if context.pages else context.new_page()
        print("Chrome opened!")

        print("\n" + "="*60)
        print("MANUAL STEPS:")
        print("1. Go to: https://www.amazon.com/create/collection?affiliateId=influencer-03f5875c")
        print("2. Log in if needed")
        print("="*60)
        print("\n>>> Press Enter when you're on the create collection page <<<")
        input()

        # Click "Add products"
        print("Clicking 'Add products'...")
        page.get_by_text("Add products").click()
        page.wait_for_timeout(2000)

        # Click "Browse History" tab
        print("Clicking 'Browse History' tab...")
        page.get_by_test_id("text-ocpBrowseHistory").click()
        page.wait_for_timeout(1000)

        def add_asin(asin):
            try:
                # Search for ASIN - exact selectors from recording
                search_box = page.get_by_role("textbox", name="Search Amazon.com")
                search_box.click()
                search_box.fill(asin)
                search_box.press("Enter")
                page.wait_for_timeout(2500)

                # Click first search result (product card/image)
                # Try multiple approaches
                try:
                    # Click any visible product image from Amazon
                    page.locator("img[src*='images-amazon']").first.click()
                except:
                    try:
                        # Click first clickable item in results
                        page.locator("[class*='product'], [class*='result']").first.click()
                    except:
                        print(f"  Could not click product")
                        return False

                page.wait_for_timeout(2000)

                # Click "Add product" button - exact selector from recording
                page.get_by_test_id("tagProductButton").get_by_text("Add product").click()

                print(f"  Added: {asin}")
                page.wait_for_timeout(1500)
                return True

            except Exception as e:
                print(f"  Error: {str(e)[:60]}")
                return False

        print(f"\nAdding {len(ASINS)} products...\n")
        success = 0
        failed = []

        for i, asin in enumerate(ASINS):
            print(f"[{i+1}/{len(ASINS)}] {asin}", end=" ")
            if add_asin(asin):
                success += 1
            else:
                failed.append(asin)

        # Click Done when finished
        print("\nClicking 'Done'...")
        try:
            page.get_by_test_id("text-ocpDone").click()
        except:
            pass

        print(f"\nComplete! {success}/{len(ASINS)} added")
        if failed:
            print(f"Failed: {failed}")

        print("\nPress Enter to close...")
        input()
        context.close()

if __name__ == "__main__":
    main()

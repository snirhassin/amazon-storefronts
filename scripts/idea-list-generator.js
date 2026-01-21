/**
 * Amazon Idea List Generator - POC
 *
 * Creates Idea Lists on Worth The Cart storefront by copying products from source lists
 *
 * Usage:
 * 1. Run: node scripts/idea-list-generator.js
 * 2. Log in to Amazon Associates when browser opens
 * 3. Press Enter in terminal when logged in
 * 4. Script will automate list creation
 */

const { chromium } = require('playwright');
const readline = require('readline');

// Configuration
const SOURCE_LIST_URL = 'https://www.amazon.com/shop/arinsolange/list/3VG86HFNQ71G1';
const TARGET_STOREFRONT_URL = 'https://www.amazon.com/shop/influencer-03f5875c';
const CREATE_IDEA_LIST_URL = 'https://www.amazon.com/create/collection?affiliateId=influencer-03f5875c&ref=inf_sf_idealist_influencer-03f5875c';
const STOREFRONT_MANAGEMENT_URL = 'https://www.amazon.com/shop/influencer-03f5875c?ccs_id=8e2ba43c-9956-4832-9f65-450ac23c4987';

// Helper to wait for user input via file signal
async function waitForSignal(signalFile) {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, signalFile);

    // Delete signal file if exists
    if (fs.existsSync(file)) fs.unlinkSync(file);

    console.log(`\n   To continue, create the file: ${file}`);
    console.log(`   Or run: echo "go" > "${file}"`);

    // Wait for file to be created
    while (!fs.existsSync(file)) {
        await new Promise(r => setTimeout(r, 1000));
    }

    // Clean up
    fs.unlinkSync(file);
}

// Alternative: wait for login state on page
async function waitForLogin(page, timeout = 120000) {
    console.log('\n   Waiting for login (checking every 3 seconds)...');
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        // Check if we can access storefront management features
        const isLoggedIn = await page.evaluate(() => {
            // Look for signs of being logged in
            const hasAccountLink = !!document.querySelector('#nav-link-accountList');
            const hasSignOut = !!document.querySelector('a[href*="signout"]');
            const hasHelloText = document.body.innerText.includes('Hello,');
            const hasYourAccount = document.body.innerText.includes('Your Account');
            const hasSignOutText = document.body.innerText.includes('Sign Out');
            const hasNavAccount = !!document.querySelector('#nav-item-signout');

            return hasAccountLink || hasSignOut || hasHelloText || hasYourAccount || hasSignOutText || hasNavAccount;
        });

        if (isLoggedIn) {
            console.log('   ✅ Login detected!');
            return true;
        }

        await page.waitForTimeout(3000);
    }

    return false;
}

// Scrape products from source list
async function scrapeSourceList(page, url) {
    console.log('\n📋 Scraping source list...');
    console.log(`   URL: ${url}`);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for products to load
    await page.waitForTimeout(3000);

    // Take screenshot of source list
    await page.screenshot({ path: 'source-list.png', fullPage: false });
    console.log('   Screenshot saved: source-list.png');

    // Get list title - try multiple selectors
    let title = 'Untitled List';
    const titleSelectors = [
        'h1',
        '[data-testid="list-title"]',
        '.list-title',
        'h2',
        'span.a-text-bold'
    ];

    for (const selector of titleSelectors) {
        try {
            const titleEl = await page.$(selector);
            if (titleEl) {
                const text = await titleEl.textContent();
                if (text && text.trim().length > 3 && text.trim().length < 100) {
                    title = text.trim();
                    break;
                }
            }
        } catch (e) {}
    }
    console.log(`   Title: ${title}`);

    // Scroll to load all products (lazy loading)
    console.log('   Scrolling to load all products...');
    let previousHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30;

    while (scrollAttempts < maxScrollAttempts) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) {
            scrollAttempts++;
            if (scrollAttempts >= 5) break;
        } else {
            scrollAttempts = 0;
        }
        previousHeight = currentHeight;

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(800);
    }

    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Extract product ASINs using multiple methods
    const products = await page.evaluate(() => {
        const items = [];
        const seenAsins = new Set();

        // Method 1: Look for data-asin attributes
        document.querySelectorAll('[data-asin]').forEach(el => {
            const asin = el.getAttribute('data-asin');
            if (asin && asin.length === 10 && /^[A-Z0-9]+$/.test(asin) && !seenAsins.has(asin)) {
                seenAsins.add(asin);
                items.push({ asin, title: 'Product' });
            }
        });

        // Method 2: Extract from all links containing /dp/
        document.querySelectorAll('a[href*="/dp/"]').forEach(el => {
            const href = el.href || '';
            const match = href.match(/\/dp\/([A-Z0-9]{10})/);
            if (match && !seenAsins.has(match[1])) {
                seenAsins.add(match[1]);
                // Try to get title from nearby text
                const parent = el.closest('[class*="product"], [class*="item"], [class*="card"]') || el.parentElement;
                const titleText = parent?.querySelector('span, h3, h4, div')?.textContent?.trim() || 'Product';
                items.push({ asin: match[1], title: titleText.substring(0, 80) });
            }
        });

        // Method 3: Look in script tags for product data
        document.querySelectorAll('script').forEach(script => {
            const text = script.textContent || '';
            const asinMatches = text.match(/"asin"\s*:\s*"([A-Z0-9]{10})"/g);
            if (asinMatches) {
                asinMatches.forEach(match => {
                    const asin = match.match(/"([A-Z0-9]{10})"/)?.[1];
                    if (asin && !seenAsins.has(asin)) {
                        seenAsins.add(asin);
                        items.push({ asin, title: 'Product' });
                    }
                });
            }
        });

        return items;
    });

    console.log(`   Found ${products.length} products`);

    // If no products found, log page content for debugging
    if (products.length === 0) {
        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        console.log(`   Page content preview: ${pageText.substring(0, 200)}...`);
    }

    return { title, products };
}

// Create new Idea List
async function createIdeaList(page, listTitle, products) {
    console.log('\n🆕 Creating new Idea List...');

    // Go directly to the Create Idea List page
    console.log(`   Navigating to: ${CREATE_IDEA_LIST_URL}`);
    await page.goto(CREATE_IDEA_LIST_URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'create-idea-list-page.png', fullPage: true });
    console.log('   Screenshot saved: create-idea-list-page.png');

    // Check if we're on the right page
    const pageContent = await page.content();
    const isCreatePage = pageContent.includes('Idea List') ||
                         pageContent.includes('Create') ||
                         pageContent.includes('collection');

    if (!isCreatePage) {
        console.log('   ⚠️  May not be on create page - check screenshot');

        // List visible form elements
        const formElements = await page.$$eval('input, textarea, button, select', els =>
            els.filter(el => el.offsetParent !== null)
               .map(el => ({
                   tag: el.tagName,
                   type: el.type || '',
                   placeholder: el.placeholder || '',
                   text: el.textContent?.trim().substring(0, 40) || '',
                   name: el.name || '',
                   id: el.id || ''
               }))
        );
        console.log('\n   Form elements found:');
        formElements.slice(0, 20).forEach((el, i) => {
            console.log(`   ${i + 1}. [${el.tag}] ${el.type} ${el.placeholder || el.text || el.name || el.id}`);
        });
    }

    return { success: true, message: 'On create idea list page' };
}

// Add products to list by ASIN
async function addProductsToList(page, products) {
    console.log(`\n➕ Adding ${products.length} products to list...`);

    for (let i = 0; i < Math.min(products.length, 5); i++) { // Test with first 5 products
        const product = products[i];
        console.log(`   Adding ${i + 1}/${Math.min(products.length, 5)}: ${product.asin}`);

        // Look for product search/add input
        const searchInput = await page.$('input[placeholder*="search"], input[placeholder*="ASIN"], input[type="search"], #product-search');

        if (searchInput) {
            await searchInput.fill(product.asin);
            await page.waitForTimeout(1000);

            // Press enter or click search
            await searchInput.press('Enter');
            await page.waitForTimeout(2000);

            // Look for add button
            const addButton = await page.$('button:has-text("Add"), button:has-text("+"), [data-testid="add-product"]');
            if (addButton) {
                await addButton.click();
                await page.waitForTimeout(1000);
            }
        }
    }

    await page.screenshot({ path: 'products-added.png', fullPage: true });
    console.log('   Screenshot saved: products-added.png');
}

// Main function
async function main() {
    console.log('='.repeat(60));
    console.log('Amazon Idea List Generator - POC');
    console.log('='.repeat(60));

    // Launch browser (visible for login)
    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    try {
        // Navigate to Amazon Associates login
        console.log('\n🔐 Opening Amazon...');
        await page.goto('https://www.amazon.com/shop/influencer-03f5875c', { waitUntil: 'networkidle' });

        // Wait for user to log in
        console.log('\n' + '='.repeat(60));
        console.log('👤 Please log in to your Amazon Associates account');
        console.log('   in the browser window that just opened.');
        console.log('='.repeat(60));

        // Auto-detect login
        const loggedIn = await waitForLogin(page, 180000); // 3 min timeout
        if (!loggedIn) {
            console.log('❌ Login timeout. Please try again.');
            await browser.close();
            return;
        }

        // Verify login by checking for account-specific elements
        console.log('\n✅ Proceeding with automation...');

        // Step 1: Scrape source list
        const sourceData = await scrapeSourceList(page, SOURCE_LIST_URL);

        if (sourceData.products.length === 0) {
            console.log('\n❌ No products found in source list');
            await browser.close();
            return;
        }

        // Step 2: Navigate to storefront and create list
        const createResult = await createIdeaList(page, sourceData.title, sourceData.products);

        if (!createResult.success) {
            console.log(`\n⚠️  ${createResult.message}`);
            console.log('   Check the screenshots for current page state');
        }

        // Keep browser open for inspection
        console.log('\n' + '='.repeat(60));
        console.log('Browser kept open for inspection.');
        console.log('Check the screenshots in the project folder.');
        console.log('Browser will close in 60 seconds...');
        await page.waitForTimeout(60000);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        console.log('   Error screenshot saved: error-screenshot.png');
    } finally {
        await browser.close();
    }
}

main();

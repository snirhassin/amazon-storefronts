/**
 * Playwright test for Export List Products feature
 * Tests the 📥 Excel button on production
 *
 * Usage: node scripts/test-export-feature.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PRODUCTION_URL = 'https://amazon-storefronts.vercel.app';
const DOWNLOAD_DIR = path.join(__dirname, '../test-downloads');

async function runTest() {
    console.log('🧪 Testing Export List Products Feature');
    console.log('=====================================');
    console.log(`URL: ${PRODUCTION_URL}`);
    console.log('');

    // Create download directory
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        acceptDownloads: true,
    });

    const page = await context.newPage();
    let testsPassed = 0;
    let testsFailed = 0;

    try {
        // Test 1: Load the page and login
        console.log('Test 1: Loading production page and logging in...');
        await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle', timeout: 30000 });

        // Check if login form is visible and login
        const loginForm = await page.locator('#loginForm').isVisible();
        if (loginForm) {
            await page.fill('#loginUsername', 'snir');
            await page.fill('#loginPassword', 'snir');
            await page.click('button[type="submit"]');
            await page.waitForTimeout(1000);
            console.log('  ✅ Logged in successfully');
        }

        const title = await page.title();
        if (title.includes('Storefronts') || title.includes('Amazon')) {
            console.log('  ✅ Page loaded successfully');
            testsPassed++;
        } else {
            console.log('  ❌ Page title unexpected:', title);
            testsFailed++;
        }

        // Take screenshot for debugging
        await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'page-loaded.png') });
        console.log('  📸 Screenshot saved to test-downloads/page-loaded.png');

        // Test 2: Click on Lists tab
        console.log('Test 2: Clicking Lists tab...');
        await page.waitForTimeout(2000); // Wait for data to load

        // Wait for tab to be visible and click
        const listsTab = page.locator('.nav-tab[data-tab="lists"]');
        await listsTab.waitFor({ state: 'visible', timeout: 10000 });
        await listsTab.click();
        await page.waitForTimeout(1000);

        // Check if lists table is visible
        const listsTable = await page.locator('#listsBody').isVisible();
        if (listsTable) {
            console.log('  ✅ Lists tab opened successfully');
            testsPassed++;
        } else {
            console.log('  ❌ Lists table not visible');
            testsFailed++;
        }

        // Test 3: Search for abeautifulmess
        console.log('Test 3: Searching for abeautifulmess...');
        const searchInput = await page.locator('#listSearch');
        await searchInput.fill('abeautifulmess');
        await page.waitForTimeout(500);

        // Check if Home Decor list appears
        const homeDecorRow = await page.locator('tr:has-text("Home Decor")').first();
        const rowVisible = await homeDecorRow.isVisible();
        if (rowVisible) {
            console.log('  ✅ Found Home Decor list from abeautifulmess');
            testsPassed++;
        } else {
            console.log('  ❌ Home Decor list not found');
            testsFailed++;
        }

        // Test 4: Click Export button and verify download
        console.log('Test 4: Clicking Export Excel button...');

        // Set up download listener
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 });

        // Find and click the Excel export button in the Home Decor row
        const exportButton = await homeDecorRow.locator('button:has-text("Excel")');
        await exportButton.click();

        try {
            const download = await downloadPromise;
            const filename = download.suggestedFilename();
            const downloadPath = path.join(DOWNLOAD_DIR, filename);
            await download.saveAs(downloadPath);

            // Verify file was downloaded and has content
            if (fs.existsSync(downloadPath)) {
                const content = fs.readFileSync(downloadPath, 'utf-8');
                const lines = content.split('\n').filter(l => l.trim());

                if (lines.length > 1 && content.includes('ASIN')) {
                    console.log(`  ✅ CSV downloaded: ${filename}`);
                    console.log(`     - ${lines.length - 1} products in file`);
                    console.log(`     - Headers: ${lines[0].substring(0, 50)}...`);
                    console.log(`     - First product: ${lines[1].substring(0, 60)}...`);
                    testsPassed++;
                } else {
                    console.log('  ❌ CSV file is empty or malformed');
                    testsFailed++;
                }
            } else {
                console.log('  ❌ Download file not found');
                testsFailed++;
            }
        } catch (downloadError) {
            console.log('  ❌ Download failed or timed out:', downloadError.message);
            testsFailed++;

            // Take screenshot for debugging
            await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'export-error.png') });
            console.log('     Screenshot saved to test-downloads/export-error.png');
        }

        // Test 5: Verify CSV content structure
        console.log('Test 5: Verifying CSV content structure...');
        const csvFiles = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.csv'));
        if (csvFiles.length > 0) {
            const csvPath = path.join(DOWNLOAD_DIR, csvFiles[0]);
            const content = fs.readFileSync(csvPath, 'utf-8');

            const hasASIN = content.includes('ASIN');
            const hasTitle = content.includes('Title');
            const hasURL = content.includes('URL');
            const hasAmazonLinks = content.includes('amazon.com/dp/');

            if (hasASIN && hasTitle && hasURL && hasAmazonLinks) {
                console.log('  ✅ CSV has correct structure (ASIN, Title, URL columns)');
                console.log('     - Contains Amazon product URLs');
                testsPassed++;
            } else {
                console.log('  ❌ CSV structure incorrect');
                console.log(`     ASIN: ${hasASIN}, Title: ${hasTitle}, URL: ${hasURL}, Amazon links: ${hasAmazonLinks}`);
                testsFailed++;
            }
        } else {
            console.log('  ⚠️ Skipped - no CSV file to verify');
        }

    } catch (error) {
        console.log('❌ Test error:', error.message);
        await page.screenshot({ path: path.join(DOWNLOAD_DIR, 'test-error.png') });
        testsFailed++;
    } finally {
        await browser.close();
    }

    // Summary
    console.log('');
    console.log('=====================================');
    console.log('📊 Test Results');
    console.log('=====================================');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log('');

    if (testsFailed === 0) {
        console.log('🎉 All tests passed! Export feature is working on production.');
        return true;
    } else {
        console.log('⚠️ Some tests failed. Check the output above.');
        return false;
    }
}

runTest()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });

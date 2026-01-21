/**
 * Opens a browser for manual navigation
 * User can log in and navigate to the Create Content page
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('Opening browser...');
    console.log('Please log in and navigate to the Create Content page.\n');

    const browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // Start at Amazon
    await page.goto('https://www.amazon.com');

    // Monitor URL changes and log them
    let lastUrl = '';
    setInterval(async () => {
        try {
            const currentUrl = page.url();
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                console.log(`\n📍 Current URL: ${currentUrl}`);

                // Save URL to file for reference
                fs.writeFileSync(
                    path.join(__dirname, 'current-url.txt'),
                    currentUrl
                );
            }
        } catch (e) {}
    }, 2000);

    // Keep browser open for 10 minutes
    console.log('Browser will stay open for 10 minutes.');
    console.log('Navigate to the Create Content page and I will capture the URL.\n');

    // Take screenshots every 30 seconds
    let screenshotCount = 0;
    const screenshotInterval = setInterval(async () => {
        try {
            screenshotCount++;
            await page.screenshot({
                path: path.join(__dirname, '..', `browser-state-${screenshotCount}.png`),
                fullPage: false
            });
            console.log(`📸 Screenshot ${screenshotCount} saved`);
        } catch (e) {}
    }, 30000);

    // Wait 10 minutes
    await new Promise(r => setTimeout(r, 600000));

    clearInterval(screenshotInterval);
    await browser.close();
    console.log('\nBrowser closed.');
}

main();

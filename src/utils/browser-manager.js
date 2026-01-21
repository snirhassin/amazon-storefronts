const { chromium } = require('playwright');

class BrowserManager {
    constructor(options = {}) {
        this.browser = null;
        this.context = null;
        this.options = {
            headless: options.headless !== false,
            userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: options.viewport || { width: 1920, height: 1080 },
            timeout: options.timeout || 30000
        };
    }

    async init() {
        console.log('Launching Playwright browser...');
        this.browser = await chromium.launch({
            headless: this.options.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        this.context = await this.browser.newContext({
            userAgent: this.options.userAgent,
            viewport: this.options.viewport,
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: ['geolocation']
        });

        // Add stealth scripts to evade detection
        await this.context.addInitScript(() => {
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });

        console.log('Browser initialized');
        return this;
    }

    async newPage() {
        if (!this.context) {
            throw new Error('Browser not initialized. Call init() first.');
        }
        const page = await this.context.newPage();
        page.setDefaultTimeout(this.options.timeout);
        return page;
    }

    async close() {
        if (this.context) {
            await this.context.close();
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        console.log('Browser closed');
    }

    isInitialized() {
        return this.browser !== null && this.context !== null;
    }
}

module.exports = BrowserManager;

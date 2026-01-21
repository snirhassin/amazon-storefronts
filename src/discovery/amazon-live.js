const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');

class AmazonLiveDiscovery {
    constructor(options = {}) {
        this.browser = new BrowserManager({ headless: options.headless !== false });
        this.rateLimiter = new RateLimiter();
        this.csvHandler = new CSVHandler();
        this.maxPages = options.maxPages || 10;
        this.marketplace = options.marketplace || 'com';
    }

    async discover() {
        const urls = [];

        try {
            await this.browser.init();
            const page = await this.browser.newPage();

            const targetUrl = `https://www.amazon.${this.marketplace}/live`;
            console.log(`\nNavigating to Amazon Live: ${targetUrl}`);
            console.log(`Discovering streamers with storefronts...\n`);

            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

                // Wait for content to load
                await page.waitForTimeout(3000);

                // Scroll to load more streamers
                let previousCount = 0;
                let scrollAttempts = 0;
                const maxScrollAttempts = 30;

                while (scrollAttempts < maxScrollAttempts) {
                    // Extract streamer/creator links
                    const pageUrls = await page.evaluate(() => {
                        const links = [];

                        // Look for streamer profile links and storefront links
                        const allLinks = document.querySelectorAll('a[href*="/shop/"], a[href*="/live/channel/"]');

                        allLinks.forEach(a => {
                            const href = a.href;

                            // Direct storefront links
                            if (href.includes('/shop/')) {
                                const match = href.match(/\/shop\/([^/?&"'<>]+)/i);
                                if (match && match[1]) {
                                    links.push({ type: 'storefront', url: href, username: match[1] });
                                }
                            }

                            // Channel links (may lead to storefronts)
                            if (href.includes('/live/channel/')) {
                                links.push({ type: 'channel', url: href });
                            }
                        });

                        return links;
                    });

                    // Process storefront URLs
                    for (const link of pageUrls) {
                        if (link.type === 'storefront') {
                            const storefrontData = this.parseStorefrontUrl(link.url);
                            if (storefrontData && !urls.some(u => u.storefront_id === storefrontData.storefront_id)) {
                                urls.push(storefrontData);
                            }
                        }
                    }

                    // Check progress
                    if (urls.length === previousCount) {
                        scrollAttempts++;
                    } else {
                        scrollAttempts = 0;
                        previousCount = urls.length;
                        console.log(`  Found ${urls.length} unique storefronts so far...`);
                    }

                    // Scroll down
                    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
                    await this.rateLimiter.wait(2000);

                    // Break if we haven't found new content in a while
                    if (scrollAttempts >= 5) {
                        console.log('  No new content after scrolling, checking for pagination...');

                        // Try to click "Load More" or similar buttons
                        const loadMoreClicked = await page.evaluate(() => {
                            const buttons = document.querySelectorAll('button, a');
                            for (const btn of buttons) {
                                const text = btn.textContent.toLowerCase();
                                if (text.includes('load more') || text.includes('show more') || text.includes('see more')) {
                                    btn.click();
                                    return true;
                                }
                            }
                            return false;
                        });

                        if (!loadMoreClicked) {
                            break;
                        }

                        await this.rateLimiter.wait(3000);
                    }
                }

            } catch (error) {
                console.log(`Error during Amazon Live discovery: ${error.message}`);
            }

        } finally {
            await this.browser.close();
        }

        console.log(`\nAmazon Live discovery complete: ${urls.length} unique storefronts found`);
        return urls;
    }

    parseStorefrontUrl(url) {
        const match = url.match(/amazon\.([a-z.]+)\/shop\/([^/?&"'<>]+)/i);

        if (!match) return null;

        const domain = match[1];
        const username = match[2].toLowerCase();

        if (['info', 'help', 'about', 'live'].includes(username)) {
            return null;
        }

        return {
            storefront_id: username,
            url: `https://www.amazon.${domain}/shop/${username}`,
            username: username,
            discovery_source: 'amazonlive',
            discovered_at: new Date().toISOString()
        };
    }

    async saveResults(urls) {
        if (urls.length === 0) {
            console.log('No URLs to save');
            return;
        }
        await this.csvHandler.saveDiscoveredUrls(urls);
    }
}

// Run if called directly
if (require.main === module) {
    const discovery = new AmazonLiveDiscovery();

    discovery.discover()
        .then(urls => discovery.saveResults(urls))
        .then(() => console.log('Done!'))
        .catch(err => console.error('Error:', err));
}

module.exports = AmazonLiveDiscovery;

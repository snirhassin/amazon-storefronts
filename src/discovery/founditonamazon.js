const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');

class FoundItOnAmazonDiscovery {
    constructor(options = {}) {
        this.browser = new BrowserManager({ headless: options.headless !== false });
        this.rateLimiter = new RateLimiter();
        this.csvHandler = new CSVHandler();
        this.maxScrolls = options.maxScrolls || 100;
        this.marketplace = options.marketplace || 'com';
    }

    async discover() {
        const urls = [];

        try {
            await this.browser.init();
            const page = await this.browser.newPage();

            // Navigate to #FoundItOnAmazon page
            // This URL varies - may need to search for it or use Amazon's discover page
            const targetUrl = `https://www.amazon.${this.marketplace}/shop/`;

            console.log(`\nNavigating to Amazon discover page: ${targetUrl}`);
            console.log(`Will scroll up to ${this.maxScrolls} times to load content\n`);

            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

                // Try to find the #FoundItOnAmazon or similar content feed
                // Look for influencer content sections
                const feedFound = await page.evaluate(() => {
                    // Look for various possible content containers
                    const selectors = [
                        '[data-component-type="s-search-result"]',
                        '.shop-container',
                        '.influencer-feed',
                        '[data-asin]',
                        '.creator-content'
                    ];

                    for (const sel of selectors) {
                        if (document.querySelector(sel)) return true;
                    }
                    return false;
                });

                if (!feedFound) {
                    console.log('Could not find content feed. Trying alternative URLs...');

                    // Try alternative discovery URLs
                    const alternativeUrls = [
                        `https://www.amazon.${this.marketplace}/live`,
                        `https://www.amazon.${this.marketplace}/gp/browse.html?node=23675065011`, // Ideas from influencers
                    ];

                    for (const altUrl of alternativeUrls) {
                        console.log(`  Trying: ${altUrl}`);
                        try {
                            await page.goto(altUrl, { waitUntil: 'networkidle', timeout: 30000 });
                            break;
                        } catch (e) {
                            console.log(`    Failed: ${e.message}`);
                        }
                    }
                }

                // Scroll and collect creator links
                let previousCount = 0;
                let noNewContentCount = 0;

                for (let scroll = 0; scroll < this.maxScrolls; scroll++) {
                    // Extract creator/storefront links
                    const pageUrls = await page.evaluate(() => {
                        const links = [];

                        // Look for links to creator storefronts
                        const allLinks = document.querySelectorAll('a[href*="/shop/"]');

                        allLinks.forEach(a => {
                            const href = a.href;
                            const match = href.match(/\/shop\/([^/?&"'<>]+)/i);
                            if (match && match[1] && !['info', 'help', 'about'].includes(match[1].toLowerCase())) {
                                links.push(href);
                            }
                        });

                        return [...new Set(links)];
                    });

                    // Add new URLs
                    for (const url of pageUrls) {
                        const storefrontData = this.parseStorefrontUrl(url);
                        if (storefrontData && !urls.some(u => u.storefront_id === storefrontData.storefront_id)) {
                            urls.push(storefrontData);
                        }
                    }

                    // Check if we're still finding new content
                    if (urls.length === previousCount) {
                        noNewContentCount++;
                        if (noNewContentCount >= 5) {
                            console.log('  No new content after 5 scrolls, stopping');
                            break;
                        }
                    } else {
                        noNewContentCount = 0;
                        previousCount = urls.length;
                    }

                    if (scroll % 10 === 0) {
                        console.log(`  Scroll ${scroll + 1}/${this.maxScrolls}: ${urls.length} unique storefronts found`);
                    }

                    // Scroll down
                    await page.evaluate(() => {
                        window.scrollBy(0, window.innerHeight);
                    });

                    // Wait for content to load
                    await this.rateLimiter.wait(2000);
                }

            } catch (error) {
                console.log(`Error during discovery: ${error.message}`);
            }

        } finally {
            await this.browser.close();
        }

        console.log(`\n#FoundItOnAmazon discovery complete: ${urls.length} unique storefronts found`);
        return urls;
    }

    parseStorefrontUrl(url) {
        const match = url.match(/amazon\.([a-z.]+)\/shop\/([^/?&"'<>]+)/i);

        if (!match) return null;

        const domain = match[1];
        const username = match[2].toLowerCase();

        if (['info', 'help', 'about', 'founditonamazon'].includes(username)) {
            return null;
        }

        return {
            storefront_id: username,
            url: `https://www.amazon.${domain}/shop/${username}`,
            username: username,
            discovery_source: 'founditonamazon',
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
    const args = process.argv.slice(2);
    const maxScrolls = args.find(a => a.startsWith('--scrolls='))?.split('=')[1] || 50;

    const discovery = new FoundItOnAmazonDiscovery({ maxScrolls: parseInt(maxScrolls) });

    discovery.discover()
        .then(urls => discovery.saveResults(urls))
        .then(() => console.log('Done!'))
        .catch(err => console.error('Error:', err));
}

module.exports = FoundItOnAmazonDiscovery;

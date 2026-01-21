const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');

class GoogleDiscovery {
    constructor(options = {}) {
        this.browser = new BrowserManager({ headless: options.headless !== false });
        this.rateLimiter = new RateLimiter();
        this.csvHandler = new CSVHandler();
        this.marketplace = options.marketplace || 'com';
        this.maxPages = options.maxPages || 20;
        this.resultsPerPage = 100;
    }

    async discover() {
        const urls = [];

        try {
            await this.browser.init();
            const page = await this.browser.newPage();

            // Search query for Amazon storefronts
            const searchQuery = `site:amazon.${this.marketplace}/shop/`;
            console.log(`\nSearching Google for: ${searchQuery}`);
            console.log(`Target: ${this.maxPages} pages of results\n`);

            for (let pageNum = 0; pageNum < this.maxPages; pageNum++) {
                const start = pageNum * this.resultsPerPage;
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=${this.resultsPerPage}&start=${start}`;

                console.log(`Page ${pageNum + 1}/${this.maxPages}: fetching results ${start + 1}-${start + this.resultsPerPage}...`);

                try {
                    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

                    // Check for CAPTCHA
                    const captcha = await page.$('form[action*="captcha"]');
                    if (captcha) {
                        console.log('\n  CAPTCHA detected! Please solve manually or try again later.');
                        console.log('  Saving progress and stopping...\n');
                        break;
                    }

                    // Extract storefront URLs from search results
                    const pageUrls = await page.evaluate(() => {
                        const links = [];
                        const results = document.querySelectorAll('a[href*="amazon."][href*="/shop/"]');

                        results.forEach(a => {
                            const href = a.href;
                            // Extract the actual Amazon URL (Google sometimes wraps links)
                            const match = href.match(/amazon\.[a-z.]+\/shop\/[^/?&"'<>]+/i);
                            if (match) {
                                links.push('https://www.' + match[0]);
                            }
                        });

                        return [...new Set(links)]; // Remove duplicates
                    });

                    if (pageUrls.length === 0) {
                        console.log('  No more results found, stopping pagination');
                        break;
                    }

                    // Process each URL
                    for (const url of pageUrls) {
                        const storefrontData = this.parseStorefrontUrl(url);
                        if (storefrontData && !urls.some(u => u.storefront_id === storefrontData.storefront_id)) {
                            urls.push(storefrontData);
                        }
                    }

                    console.log(`  Found ${pageUrls.length} URLs (total unique: ${urls.length})`);

                    // Rate limit between pages
                    if (pageNum < this.maxPages - 1) {
                        await this.rateLimiter.waitBetweenPages();
                    }

                } catch (error) {
                    console.log(`  Error on page ${pageNum + 1}: ${error.message}`);
                    if (error.message.includes('timeout')) {
                        await this.rateLimiter.exponentialBackoff(0);
                    }
                }
            }

        } finally {
            await this.browser.close();
        }

        console.log(`\nGoogle discovery complete: ${urls.length} unique storefronts found`);
        return urls;
    }

    parseStorefrontUrl(url) {
        // Match patterns like:
        // amazon.com/shop/influencer-abc123
        // amazon.com/shop/username
        // amazon.co.uk/shop/username
        const match = url.match(/amazon\.([a-z.]+)\/shop\/([^/?&"'<>]+)/i);

        if (!match) return null;

        const domain = match[1];
        const username = match[2].toLowerCase();

        // Skip non-storefront URLs
        if (['info', 'help', 'about'].includes(username)) {
            return null;
        }

        return {
            storefront_id: username,
            url: `https://www.amazon.${domain}/shop/${username}`,
            username: username,
            discovery_source: 'google',
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
    const maxPages = args.find(a => a.startsWith('--pages='))?.split('=')[1] || 5;
    const marketplace = args.find(a => a.startsWith('--market='))?.split('=')[1] || 'com';

    const discovery = new GoogleDiscovery({
        maxPages: parseInt(maxPages),
        marketplace: marketplace
    });

    discovery.discover()
        .then(urls => discovery.saveResults(urls))
        .then(() => console.log('Done!'))
        .catch(err => console.error('Error:', err));
}

module.exports = GoogleDiscovery;

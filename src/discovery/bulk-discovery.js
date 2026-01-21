const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');
const Deduplicator = require('./deduplicator');

class BulkDiscovery {
    constructor(options = {}) {
        this.browser = new BrowserManager({ headless: options.headless !== false });
        this.rateLimiter = new RateLimiter({ minDelay: 5000, maxDelay: 10000 });
        this.csvHandler = new CSVHandler();
        this.deduplicator = new Deduplicator();
        this.targetCount = options.targetCount || 500;
        this.marketplace = options.marketplace || 'com';

        // Different search queries to find diverse storefronts
        this.searchQueries = [
            'site:amazon.com/shop/influencer-',
            'site:amazon.com/shop/ fashion',
            'site:amazon.com/shop/ beauty',
            'site:amazon.com/shop/ home decor',
            'site:amazon.com/shop/ kitchen',
            'site:amazon.com/shop/ tech gadgets',
            'site:amazon.com/shop/ fitness',
            'site:amazon.com/shop/ skincare',
            'site:amazon.com/shop/ lifestyle',
            'site:amazon.com/shop/ mom',
            'site:amazon.com/shop/ organization',
            'site:amazon.com/shop/ travel',
            'site:amazon.com/shop/ pets',
            'site:amazon.com/shop/ baby',
            'site:amazon.com/shop/ style',
            'site:amazon.com/shop/ makeup',
            'site:amazon.com/shop/ wellness',
            'site:amazon.com/shop/ food',
            'site:amazon.com/shop/ DIY',
            'site:amazon.com/shop/ gaming'
        ];
    }

    async discover() {
        const allUrls = new Map();

        try {
            await this.browser.init();
            const page = await this.browser.newPage();

            console.log('='.repeat(60));
            console.log('Bulk Storefront Discovery');
            console.log('='.repeat(60));
            console.log(`Target: ${this.targetCount} storefronts`);
            console.log(`Search queries: ${this.searchQueries.length}`);
            console.log('='.repeat(60));

            for (let queryIndex = 0; queryIndex < this.searchQueries.length; queryIndex++) {
                const query = this.searchQueries[queryIndex];

                // Check if we've reached target
                if (allUrls.size >= this.targetCount) {
                    console.log(`\nReached target of ${this.targetCount} storefronts!`);
                    break;
                }

                console.log(`\n[${queryIndex + 1}/${this.searchQueries.length}] Searching: "${query}"`);
                console.log(`  Current total: ${allUrls.size} unique storefronts`);

                // Search multiple pages per query
                const maxPagesPerQuery = Math.ceil((this.targetCount - allUrls.size) / 50);
                const pagesToSearch = Math.min(maxPagesPerQuery, 5); // Max 5 pages per query

                for (let pageNum = 0; pageNum < pagesToSearch; pageNum++) {
                    if (allUrls.size >= this.targetCount) break;

                    const start = pageNum * 100;
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=100&start=${start}`;

                    try {
                        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await page.waitForTimeout(2000);

                        // Check for CAPTCHA
                        const hasCaptcha = await page.evaluate(() => {
                            return document.body.innerText.includes('unusual traffic') ||
                                   document.querySelector('form[action*="captcha"]') !== null;
                        });

                        if (hasCaptcha) {
                            console.log('  CAPTCHA detected! Waiting 60 seconds...');
                            await this.rateLimiter.wait(60000);
                            continue;
                        }

                        // Extract storefront URLs
                        const urls = await page.evaluate(() => {
                            const results = [];
                            const links = document.querySelectorAll('a[href*="amazon."][href*="/shop/"]');

                            links.forEach(link => {
                                const href = link.href;
                                // Match amazon.com/shop/username patterns
                                const match = href.match(/amazon\.([a-z.]+)\/shop\/([a-zA-Z0-9_-]+)/i);
                                if (match && match[2]) {
                                    const domain = match[1];
                                    const username = match[2].toLowerCase();
                                    // Filter out non-storefront pages
                                    if (!['info', 'help', 'about', 'browse', 'gp'].includes(username)) {
                                        results.push({
                                            domain,
                                            username,
                                            url: `https://www.amazon.${domain}/shop/${username}`
                                        });
                                    }
                                }
                            });

                            return results;
                        });

                        // Add new unique URLs
                        let newCount = 0;
                        for (const urlData of urls) {
                            if (!allUrls.has(urlData.username)) {
                                allUrls.set(urlData.username, {
                                    storefront_id: urlData.username,
                                    url: urlData.url,
                                    username: urlData.username,
                                    discovery_source: 'google',
                                    search_query: query,
                                    discovered_at: new Date().toISOString()
                                });
                                newCount++;
                            }
                        }

                        console.log(`  Page ${pageNum + 1}: found ${urls.length} URLs, ${newCount} new (total: ${allUrls.size})`);

                        if (urls.length === 0) {
                            console.log('  No more results for this query');
                            break;
                        }

                        // Rate limit between pages
                        await this.rateLimiter.waitBetweenPages();

                    } catch (error) {
                        console.log(`  Error: ${error.message}`);
                        await this.rateLimiter.wait(10000);
                    }
                }

                // Longer delay between different search queries
                if (queryIndex < this.searchQueries.length - 1 && allUrls.size < this.targetCount) {
                    console.log('  Waiting before next search query...');
                    await this.rateLimiter.wait(15000);
                }
            }

        } finally {
            await this.browser.close();
        }

        const results = Array.from(allUrls.values());

        console.log('\n' + '='.repeat(60));
        console.log('Discovery Complete!');
        console.log('='.repeat(60));
        console.log(`Total unique storefronts: ${results.length}`);
        console.log('='.repeat(60));

        return results;
    }

    async saveResults(urls) {
        if (urls.length === 0) {
            console.log('No URLs to save');
            return;
        }
        await this.csvHandler.saveDiscoveredUrls(urls);
        console.log(`Saved ${urls.length} storefronts to data/input/discovered-urls.csv`);
    }
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    const targetCount = parseInt(args.find(a => a.startsWith('--target='))?.split('=')[1]) || 500;

    console.log(`Starting bulk discovery for ${targetCount} storefronts...\n`);

    const discovery = new BulkDiscovery({ targetCount });

    discovery.discover()
        .then(urls => discovery.saveResults(urls))
        .then(() => console.log('\nDone!'))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = BulkDiscovery;

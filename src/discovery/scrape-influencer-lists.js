const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');

class InfluencerListScraper {
    constructor(options = {}) {
        this.browser = new BrowserManager({ headless: options.headless !== false });
        this.rateLimiter = new RateLimiter({ minDelay: 3000, maxDelay: 6000 });
        this.csvHandler = new CSVHandler();

        // Curated list sources - articles that list many influencers with storefront URLs
        this.sources = [
            {
                name: 'Influence Agency - Top Creators 2025',
                url: 'https://theinfluenceagency.com/blog/amazon-storefront-top-creators-2025',
            },
            {
                name: 'Amra & Elma - Top 25 Influencers',
                url: 'https://www.amraandelma.com/top-influencers-with-amazon-storefronts/',
            },
            {
                name: 'Amra & Elma - Top Stores by Sales',
                url: 'https://www.amraandelma.com/top-amazon-influencer-stores-by-sales-in-2025/',
            },
            {
                name: 'Influencer Marketing Hub - Top Amazon Influencers',
                url: 'https://influencermarketinghub.com/top-amazon-influencers/',
            },
            {
                name: 'BQool - Top Amazon Influencers',
                url: 'https://blog.bqool.com/top-amazon-influencers/',
            },
            {
                name: 'AlgoRift - Top 50 Influencers',
                url: 'https://algorift.io/amazon-influencer-storefront/',
            },
            {
                name: 'aInfluencer - Top 50 Influencers',
                url: 'https://influencermarketing.ainfluencer.com/amazon-influencer-storefront/',
            },
            {
                name: 'Creator Hero - Best Storefronts',
                url: 'https://www.creator-hero.com/blog/best-amazon-influencer-storefronts',
            },
            {
                name: 'Stack Influence - Find Amazon Influencers',
                url: 'https://stackinfluence.com/find-amazon-influencers-and-their-storefronts/',
            },
            {
                name: 'Peer to Peer Marketing - Amazon Influencers',
                url: 'https://peertopeermarketing.co/amazon-influencers/',
            },
            {
                name: 'Modash - Find Amazon Influencers',
                url: 'https://www.modash.io/blog/how-to-find-amazon-influencers',
            },
            {
                name: 'Billo - Find Amazon Influencers',
                url: 'https://billo.app/blog/how-to-find-amazon-influencer-storefront/',
            },
            {
                name: 'Influencer Hero - Ultimate Guide',
                url: 'https://www.influencer-hero.com/blogs/how-to-find-influencers-on-amazon-and-their-storefronts-the-ultimate-guide',
            },
            {
                name: 'Feedspot - Top 100 Amazon Influencers',
                url: 'https://influencers.feedspot.com/amazon_instagram_influencers/',
            },
            {
                name: 'Popular Pays - Find Amazon Storefronts',
                url: 'https://popularpays.com/blog/how-to-find-amazon-influencer-storefront',
            },
            {
                name: 'Join Status - Find Amazon Influencers',
                url: 'https://brands.joinstatus.com/how-to-find-amazon-influencers',
            }
        ];
    }

    async discover() {
        const allUrls = new Map();

        try {
            await this.browser.init();
            const page = await this.browser.newPage();

            console.log('='.repeat(60));
            console.log('Scraping Influencer List Articles');
            console.log('='.repeat(60));
            console.log(`Sources to scrape: ${this.sources.length}`);
            console.log('='.repeat(60));

            for (let i = 0; i < this.sources.length; i++) {
                const source = this.sources[i];
                console.log(`\n[${i + 1}/${this.sources.length}] ${source.name}`);
                console.log(`  URL: ${source.url}`);

                try {
                    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await page.waitForTimeout(2000);

                    // Extract all Amazon storefront links from the page
                    const urls = await page.evaluate(() => {
                        const results = [];
                        const allLinks = document.querySelectorAll('a[href*="amazon."][href*="/shop/"]');

                        allLinks.forEach(link => {
                            const href = link.href;
                            const match = href.match(/amazon\.([a-z.]+)\/shop\/([a-zA-Z0-9_-]+)/i);
                            if (match && match[2]) {
                                const domain = match[1];
                                const username = match[2].toLowerCase();
                                if (!['info', 'help', 'about', 'browse'].includes(username)) {
                                    // Try to get the influencer name from nearby text
                                    const parentText = link.closest('p, li, div, td')?.textContent || '';
                                    results.push({
                                        domain,
                                        username,
                                        url: `https://www.amazon.${domain}/shop/${username}`,
                                        context: parentText.substring(0, 200)
                                    });
                                }
                            }
                        });

                        return results;
                    });

                    // Add unique URLs
                    let newCount = 0;
                    for (const urlData of urls) {
                        if (!allUrls.has(urlData.username)) {
                            allUrls.set(urlData.username, {
                                storefront_id: urlData.username,
                                url: urlData.url,
                                username: urlData.username,
                                discovery_source: 'curated_list',
                                source_name: source.name,
                                discovered_at: new Date().toISOString()
                            });
                            newCount++;
                        }
                    }

                    console.log(`  Found ${urls.length} URLs, ${newCount} new (total: ${allUrls.size})`);

                } catch (error) {
                    console.log(`  Error: ${error.message}`);
                }

                await this.rateLimiter.waitBetweenPages();
            }

        } finally {
            await this.browser.close();
        }

        const results = Array.from(allUrls.values());

        console.log('\n' + '='.repeat(60));
        console.log('Curated List Scraping Complete!');
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
    }
}

// Run if called directly
if (require.main === module) {
    const scraper = new InfluencerListScraper();

    scraper.discover()
        .then(urls => scraper.saveResults(urls))
        .then(() => console.log('\nDone!'))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = InfluencerListScraper;

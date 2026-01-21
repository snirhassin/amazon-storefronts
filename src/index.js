const BrowserManager = require('./utils/browser-manager');
const RateLimiter = require('./utils/rate-limiter');
const CheckpointManager = require('./utils/checkpoint');
const CSVHandler = require('./utils/csv-handler');
const StorefrontScraper = require('./scrapers/storefront-scraper');
const { runDiscovery } = require('./discovery/index');

class AmazonStorefrontsScraper {
    constructor(options = {}) {
        this.options = {
            scrapeProducts: options.scrapeProducts !== false,
            maxListsPerStorefront: options.maxListsPerStorefront || 20,
            concurrency: options.concurrency || 1, // Sequential for safety
            testMode: options.testMode || false,
            limit: options.limit || null,
            resume: options.resume || false,
            ...options
        };

        this.browser = new BrowserManager({ headless: true });
        this.rateLimiter = new RateLimiter();
        this.checkpointManager = new CheckpointManager();
        this.csvHandler = new CSVHandler();
        this.storefrontScraper = null;

        this.stats = {
            total: 0,
            processed: 0,
            successful: 0,
            failed: 0,
            totalLists: 0,
            totalProducts: 0,
            startTime: null
        };
    }

    async run() {
        console.log('='.repeat(60));
        console.log('Amazon Storefronts Scraper');
        console.log('='.repeat(60));

        this.stats.startTime = Date.now();

        try {
            // Initialize browser
            await this.browser.init();

            // Create scraper with shared browser
            this.storefrontScraper = new StorefrontScraper({
                browser: this.browser,
                scrapeProducts: this.options.scrapeProducts,
                maxListsPerStorefront: this.options.maxListsPerStorefront
            });

            // Load discovered URLs
            let urls = await this.csvHandler.loadDiscoveredUrls();

            if (urls.length === 0) {
                console.log('\nNo discovered URLs found. Running discovery first...\n');
                urls = await runDiscovery({
                    sources: ['google'],
                    googlePages: this.options.testMode ? 2 : 10
                });
            }

            // Apply limit if specified
            if (this.options.limit) {
                urls = urls.slice(0, this.options.limit);
                console.log(`Limited to ${urls.length} storefronts (--limit=${this.options.limit})`);
            }

            this.stats.total = urls.length;
            console.log(`\nTotal storefronts to scrape: ${urls.length}`);

            // Load checkpoint for resume
            let checkpoint = await this.checkpointManager.load();
            let startIndex = 0;

            if (this.options.resume) {
                startIndex = this.checkpointManager.getResumeIndex(checkpoint, urls);
                if (startIndex > 0) {
                    console.log(`Resuming from index ${startIndex} (${startIndex} already processed)`);
                    this.stats.processed = startIndex;
                }
            }

            console.log('\n' + '-'.repeat(60));
            console.log('Starting scrape...');
            console.log('-'.repeat(60));

            // Process storefronts
            for (let i = startIndex; i < urls.length; i++) {
                const urlData = urls[i];
                const url = urlData.url || urlData.storefront_url;
                const source = urlData.discovery_source || 'manual';

                console.log(`\n[${i + 1}/${urls.length}] Processing: ${url}`);

                try {
                    const result = await this.storefrontScraper.scrapeStorefront(url, source);

                    // Save results incrementally
                    await this.saveResults(result);

                    // Update stats
                    this.stats.processed++;
                    if (result.storefront.scrape_status === 'success') {
                        this.stats.successful++;
                        this.stats.totalLists += result.lists.length;
                        this.stats.totalProducts += result.products.length;
                    } else {
                        this.stats.failed++;
                        await this.checkpointManager.addFailedUrl(checkpoint, url, result.storefront.error);
                    }

                    // Update checkpoint
                    await this.checkpointManager.updateScrapingProgress(
                        checkpoint, i, urlData.storefront_id, urls.length
                    );

                    // Log progress
                    this.logProgress();

                    // Rate limit between storefronts
                    if (i < urls.length - 1) {
                        await this.rateLimiter.waitBetweenStorefronts();
                        await this.rateLimiter.waitForBatch();
                    }

                } catch (error) {
                    console.log(`  Unexpected error: ${error.message}`);
                    this.stats.failed++;
                    this.stats.processed++;
                    await this.checkpointManager.addFailedUrl(checkpoint, url, error.message);
                }
            }

            // Final save
            await this.checkpointManager.save(checkpoint);

            // Print summary
            this.printSummary();

        } finally {
            await this.browser.close();
        }
    }

    async saveResults(result) {
        // Save storefront
        await this.csvHandler.saveStorefronts([result.storefront]);

        // Save lists
        if (result.lists.length > 0) {
            await this.csvHandler.saveLists(result.lists);
        }

        // Save products
        if (result.products.length > 0) {
            await this.csvHandler.saveProducts(result.products);
        }
    }

    logProgress() {
        const elapsed = (Date.now() - this.stats.startTime) / 1000;
        const rate = this.stats.processed / elapsed;
        const remaining = this.stats.total - this.stats.processed;
        const eta = remaining / rate;

        console.log(`  Progress: ${this.stats.processed}/${this.stats.total} (${(this.stats.processed / this.stats.total * 100).toFixed(1)}%)`);
        console.log(`  Success: ${this.stats.successful}, Failed: ${this.stats.failed}`);
        console.log(`  ETA: ${this.formatTime(eta)}`);
    }

    formatTime(seconds) {
        if (seconds < 60) return `${Math.round(seconds)}s`;
        if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
        return `${(seconds / 3600).toFixed(1)}h`;
    }

    printSummary() {
        const elapsed = (Date.now() - this.stats.startTime) / 1000;

        console.log('\n' + '='.repeat(60));
        console.log('SCRAPE COMPLETE');
        console.log('='.repeat(60));
        console.log(`Total storefronts: ${this.stats.total}`);
        console.log(`Processed: ${this.stats.processed}`);
        console.log(`Successful: ${this.stats.successful}`);
        console.log(`Failed: ${this.stats.failed}`);
        console.log(`Total lists: ${this.stats.totalLists}`);
        console.log(`Total products: ${this.stats.totalProducts}`);
        console.log(`Time elapsed: ${this.formatTime(elapsed)}`);
        console.log(`Rate: ${(this.stats.processed / elapsed * 60).toFixed(1)} storefronts/minute`);
        console.log('='.repeat(60));
        console.log('\nOutput files:');
        console.log('  - data/output/storefronts.csv');
        console.log('  - data/output/lists.csv');
        console.log('  - data/output/products.csv');
        console.log('='.repeat(60));
    }
}

// CLI handling
async function main() {
    const args = process.argv.slice(2);

    const options = {
        testMode: args.includes('--test'),
        resume: args.includes('--resume'),
        limit: parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1]) || null,
        scrapeProducts: !args.includes('--no-products'),
        maxListsPerStorefront: parseInt(args.find(a => a.startsWith('--max-lists='))?.split('=')[1]) || 20
    };

    // Show help
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Amazon Storefronts Scraper

Usage: node src/index.js [options]

Options:
  --test            Run in test mode (limited discovery)
  --resume          Resume from last checkpoint
  --limit=N         Limit to N storefronts
  --no-products     Skip product scraping (faster, lists only)
  --max-lists=N     Max lists to scrape per storefront (default: 20)
  --help, -h        Show this help message

Examples:
  node src/index.js                    # Run full scrape
  node src/index.js --test --limit=5   # Test with 5 storefronts
  node src/index.js --resume           # Resume interrupted scrape
  node src/index.js --no-products      # Scrape storefronts and lists only
`);
        return;
    }

    console.log('Options:', options);

    const scraper = new AmazonStorefrontsScraper(options);
    await scraper.run();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

module.exports = AmazonStorefrontsScraper;

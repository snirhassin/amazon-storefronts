const GoogleDiscovery = require('./google-discovery');
const FoundItOnAmazonDiscovery = require('./founditonamazon');
const AmazonLiveDiscovery = require('./amazon-live');
const Deduplicator = require('./deduplicator');
const CSVHandler = require('../utils/csv-handler');

async function runDiscovery(options = {}) {
    const {
        sources = ['google', 'founditonamazon', 'amazonlive'],
        marketplace = 'com',
        googlePages = 10,
        maxScrolls = 50
    } = options;

    const allUrls = [];
    const csvHandler = new CSVHandler();

    console.log('='.repeat(60));
    console.log('Amazon Storefronts Discovery');
    console.log('='.repeat(60));
    console.log(`Sources: ${sources.join(', ')}`);
    console.log(`Marketplace: amazon.${marketplace}`);
    console.log('='.repeat(60));

    // Run enabled discovery sources
    if (sources.includes('google')) {
        console.log('\n--- Google Site Search Discovery ---');
        const googleDiscovery = new GoogleDiscovery({
            marketplace,
            maxPages: googlePages,
            headless: true
        });
        const googleUrls = await googleDiscovery.discover();
        allUrls.push(googleUrls);
        console.log(`Google: ${googleUrls.length} URLs found`);
    }

    if (sources.includes('founditonamazon')) {
        console.log('\n--- #FoundItOnAmazon Discovery ---');
        const foundItDiscovery = new FoundItOnAmazonDiscovery({
            marketplace,
            maxScrolls,
            headless: true
        });
        const foundItUrls = await foundItDiscovery.discover();
        allUrls.push(foundItUrls);
        console.log(`#FoundItOnAmazon: ${foundItUrls.length} URLs found`);
    }

    if (sources.includes('amazonlive')) {
        console.log('\n--- Amazon Live Discovery ---');
        const liveDiscovery = new AmazonLiveDiscovery({
            marketplace,
            headless: true
        });
        const liveUrls = await liveDiscovery.discover();
        allUrls.push(liveUrls);
        console.log(`Amazon Live: ${liveUrls.length} URLs found`);
    }

    // Deduplicate all URLs
    console.log('\n--- Deduplicating Results ---');
    const deduplicator = new Deduplicator();
    const uniqueUrls = deduplicator.deduplicate(allUrls);
    const stats = deduplicator.getStats(uniqueUrls);

    console.log(`\nDeduplication complete:`);
    console.log(`  Total unique storefronts: ${stats.total}`);
    console.log(`  Found in multiple sources: ${stats.multiSource}`);
    console.log(`  By source:`);
    for (const [source, count] of Object.entries(stats.bySource)) {
        console.log(`    - ${source}: ${count}`);
    }

    // Save results
    console.log('\n--- Saving Results ---');
    await csvHandler.saveDiscoveredUrls(uniqueUrls);

    console.log('\n' + '='.repeat(60));
    console.log('Discovery Complete!');
    console.log('='.repeat(60));
    console.log(`Total storefronts discovered: ${uniqueUrls.length}`);
    console.log(`Output: data/input/discovered-urls.csv`);
    console.log('='.repeat(60));

    return uniqueUrls;
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);

    const options = {
        marketplace: args.find(a => a.startsWith('--market='))?.split('=')[1] || 'com',
        googlePages: parseInt(args.find(a => a.startsWith('--pages='))?.split('=')[1] || '10'),
        maxScrolls: parseInt(args.find(a => a.startsWith('--scrolls='))?.split('=')[1] || '50')
    };

    // Parse sources
    const sourcesArg = args.find(a => a.startsWith('--sources='));
    if (sourcesArg) {
        options.sources = sourcesArg.split('=')[1].split(',');
    }

    // Quick test mode
    if (args.includes('--test')) {
        options.googlePages = 2;
        options.maxScrolls = 10;
        console.log('Running in TEST mode (limited pages/scrolls)');
    }

    runDiscovery(options)
        .then(() => console.log('\nDone!'))
        .catch(err => {
            console.error('Error:', err);
            process.exit(1);
        });
}

module.exports = { runDiscovery };

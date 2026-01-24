/**
 * Amazon Storefront Discovery Script
 * Uses SerpAPI to find new storefronts via Google search
 *
 * Usage:
 *   node scripts/discover-storefronts.js
 *   node scripts/discover-storefronts.js --dry-run
 *
 * Requires:
 *   - SERPAPI_KEY in .env
 *   - SUPABASE_URL and SUPABASE_ANON_KEY in .env
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  serpApiKey: process.env.SERPAPI_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,

  // Search settings (Developer Plan: 5,000/month = ~166/day)
  searchesPerRun: 50,         // Run twice daily = 100 searches/day
  resultsPerSearch: 100,      // Max results per search (SerpAPI limit)
  delayBetweenSearches: 1000, // ms between searches

  // Search query variations to find more storefronts
  searchQueries: [
    'site:amazon.com/shop/',
    'site:amazon.com/shop/ influencer',
    'site:amazon.com/shop/ creator',
    'site:amazon.com/shop/ finds',
    'site:amazon.com/shop/ favorites',
    'site:amazon.com/shop/ picks',
    'site:amazon.com/shop/ lifestyle',
    'site:amazon.com/shop/ fashion',
    'site:amazon.com/shop/ beauty',
    'site:amazon.com/shop/ tech',
    'site:amazon.com/shop/ home',
    'site:amazon.com/shop/ fitness',
    'site:amazon.com/shop/ mom',
    'site:amazon.com/shop/ dad',
    'site:amazon.com/shop/ kitchen',
    'site:amazon.com/shop/ travel',
    'site:amazon.com/shop/ outdoor',
    'site:amazon.com/shop/ pet',
    'site:amazon.com/shop/ baby',
    'site:amazon.com/shop/ gaming',
  ]
};

// Initialize Supabase client
const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

/**
 * Search Google via SerpAPI
 */
async function searchGoogle(query, start = 0) {
  const params = new URLSearchParams({
    api_key: CONFIG.serpApiKey,
    engine: 'google',
    q: query,
    start: start,
    num: 100,  // Max results per page
    gl: 'us',  // Country
    hl: 'en',  // Language
  });

  const response = await fetch(`https://serpapi.com/search?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SerpAPI error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Extract storefront usernames from search results
 */
function extractStorefronts(results) {
  const storefronts = new Set();

  if (!results.organic_results) return storefronts;

  for (const result of results.organic_results) {
    const url = result.link || '';

    // Match amazon.com/shop/username patterns
    const match = url.match(/amazon\.com\/shop\/([^\/\?#]+)/i);
    if (match) {
      const username = match[1].toLowerCase();
      // Filter out generic pages
      if (!['info', 'help', 'about', 'terms', 'privacy'].includes(username)) {
        storefronts.add(username);
      }
    }
  }

  return storefronts;
}

/**
 * Get existing storefronts from Supabase
 */
async function getExistingStorefronts() {
  const { data, error } = await supabase
    .from('storefronts')
    .select('id');

  if (error) {
    console.error('Error fetching existing storefronts:', error);
    return new Set();
  }

  return new Set(data.map(s => s.id.toLowerCase()));
}

/**
 * Save discovered storefronts to a queue table
 */
async function queueNewStorefronts(usernames) {
  if (usernames.length === 0) return { queued: 0 };

  // Insert into discovery_queue table (create if needed)
  const records = usernames.map(username => ({
    username,
    url: `https://www.amazon.com/shop/${username}`,
    status: 'pending',
    discovered_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from('discovery_queue')
    .upsert(records, { onConflict: 'username', ignoreDuplicates: true });

  if (error) {
    console.error('Error queueing storefronts:', error);
    return { queued: 0, error };
  }

  return { queued: usernames.length };
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main discovery function
 */
async function discoverStorefronts(options = {}) {
  const { dryRun = false } = options;

  console.log('🔍 Amazon Storefront Discovery');
  console.log('================================');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Searches per run: ${CONFIG.searchesPerRun}`);
  console.log('');

  // Check API key
  if (!CONFIG.serpApiKey) {
    console.error('❌ SERPAPI_KEY not found in .env');
    process.exit(1);
  }

  // Get existing storefronts
  console.log('📦 Fetching existing storefronts from Supabase...');
  const existing = await getExistingStorefronts();
  console.log(`   Found ${existing.size} existing storefronts`);
  console.log('');

  // Track discoveries
  const allDiscovered = new Set();
  const newStorefronts = new Set();
  let searchCount = 0;
  let totalResults = 0;

  // Run searches
  console.log('🌐 Starting Google searches via SerpAPI...');
  console.log('');

  for (let i = 0; i < CONFIG.searchesPerRun; i++) {
    // Rotate through query variations
    const query = CONFIG.searchQueries[i % CONFIG.searchQueries.length];
    const start = Math.floor(i / CONFIG.searchQueries.length) * 10; // Paginate

    try {
      console.log(`[${i + 1}/${CONFIG.searchesPerRun}] Searching: "${query}" (start: ${start})`);

      if (!dryRun) {
        const results = await searchGoogle(query, start);
        totalResults += results.organic_results?.length || 0;

        const found = extractStorefronts(results);
        found.forEach(username => {
          allDiscovered.add(username);
          if (!existing.has(username)) {
            newStorefronts.add(username);
          }
        });

        console.log(`   Found ${found.size} storefronts (${newStorefronts.size} new total)`);

        // Check remaining credits
        if (results.serpapi_credits_used) {
          console.log(`   SerpAPI credits used: ${results.serpapi_credits_used}`);
        }
      } else {
        console.log('   [DRY RUN - skipping actual search]');
      }

      searchCount++;

      // Rate limiting
      if (i < CONFIG.searchesPerRun - 1) {
        await sleep(CONFIG.delayBetweenSearches);
      }

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      // Continue with next search
    }
  }

  console.log('');
  console.log('📊 Discovery Summary');
  console.log('====================');
  console.log(`Searches completed: ${searchCount}`);
  console.log(`Total results processed: ${totalResults}`);
  console.log(`Unique storefronts found: ${allDiscovered.size}`);
  console.log(`New storefronts (not in DB): ${newStorefronts.size}`);
  console.log('');

  // Queue new storefronts
  if (!dryRun && newStorefronts.size > 0) {
    console.log('💾 Queueing new storefronts for scraping...');
    const result = await queueNewStorefronts([...newStorefronts]);
    console.log(`   Queued ${result.queued} storefronts`);
  }

  // Output new storefronts
  if (newStorefronts.size > 0) {
    console.log('');
    console.log('🆕 New Storefronts Found:');
    console.log('-------------------------');
    [...newStorefronts].slice(0, 50).forEach(username => {
      console.log(`   https://www.amazon.com/shop/${username}`);
    });
    if (newStorefronts.size > 50) {
      console.log(`   ... and ${newStorefronts.size - 50} more`);
    }
  }

  return {
    searchCount,
    totalResults,
    discovered: allDiscovered.size,
    new: newStorefronts.size,
    newStorefronts: [...newStorefronts],
  };
}

// CLI execution
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  discoverStorefronts({ dryRun })
    .then(results => {
      console.log('');
      console.log('✅ Discovery complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { discoverStorefronts, searchGoogle, extractStorefronts };

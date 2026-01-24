/**
 * Process Discovery Queue - Scrape pending storefronts
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --limit 100
 *
 * Requires:
 *   - SUPABASE_URL and SUPABASE_ANON_KEY in .env
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  batchSize: 50,              // Storefronts to process per batch
  delayBetweenScrapes: 3000,  // ms between scrapes to avoid Amazon rate limits
  maxRetries: 3,
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

/**
 * Fetch pending storefronts from queue
 */
async function getPendingStorefronts(limit = 100) {
  const { data, error } = await supabase
    .from('discovery_queue')
    .select('*')
    .eq('status', 'pending')
    .order('discovered_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('Error fetching queue:', error);
    return [];
  }

  return data;
}

/**
 * Update queue item status
 */
async function updateQueueStatus(username, status, error = null) {
  const update = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (error) update.error = error;

  await supabase
    .from('discovery_queue')
    .update(update)
    .eq('username', username);
}

/**
 * Scrape a single storefront
 */
async function scrapeStorefront(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract data from HTML (basic extraction)
    const data = {
      name: extractMeta(html, 'og:title') || extractText(html, /<h1[^>]*>([^<]+)<\/h1>/),
      bio: extractMeta(html, 'og:description'),
      image: extractMeta(html, 'og:image'),
      url: url,
    };

    // Extract username from URL
    const match = url.match(/\/shop\/([^\/\?#]+)/);
    data.username = match ? match[1] : null;
    data.id = data.username;

    // Check if it's a valid storefront page
    if (html.includes('Page not found') || html.includes('404')) {
      throw new Error('Page not found');
    }

    // Try to extract lists count and likes from page
    const listsMatch = html.match(/(\d+)\s*(?:idea\s*)?lists?/i);
    const likesMatch = html.match(/(\d+(?:,\d+)*)\s*likes?/i);

    data.lists = listsMatch ? parseInt(listsMatch[1]) : 0;
    data.likes = likesMatch ? parseInt(likesMatch[1].replace(/,/g, '')) : 0;

    // Check for top creator badge
    data.is_top = html.includes('Top Creator') || html.includes('top-creator');

    // Detect marketplace
    if (url.includes('amazon.co.uk')) data.marketplace = 'UK';
    else if (url.includes('amazon.de')) data.marketplace = 'DE';
    else if (url.includes('amazon.fr')) data.marketplace = 'FR';
    else if (url.includes('amazon.ca')) data.marketplace = 'CA';
    else if (url.includes('amazon.co.jp')) data.marketplace = 'JP';
    else data.marketplace = 'US';

    return data;

  } catch (error) {
    throw error;
  }
}

/**
 * Helper to extract meta tags
 */
function extractMeta(html, property) {
  const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  return match ? match[1] : null;
}

/**
 * Helper to extract text with regex
 */
function extractText(html, regex) {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Save storefront to database
 */
async function saveStorefront(data) {
  const { error } = await supabase
    .from('storefronts')
    .upsert({
      id: data.id,
      url: data.url,
      username: data.username,
      name: data.name,
      bio: data.bio,
      image: data.image,
      is_top: data.is_top,
      likes: data.likes,
      lists: data.lists,
      marketplace: data.marketplace,
    }, { onConflict: 'id' });

  if (error) throw error;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main processing function
 */
async function processQueue(options = {}) {
  const { limit = 100 } = options;

  console.log('🔄 Processing Discovery Queue');
  console.log('==============================');
  console.log(`Limit: ${limit} storefronts`);
  console.log('');

  // Get pending items
  console.log('📋 Fetching pending storefronts...');
  const pending = await getPendingStorefronts(limit);
  console.log(`   Found ${pending.length} pending storefronts`);
  console.log('');

  if (pending.length === 0) {
    console.log('✅ Queue is empty!');
    return { processed: 0, success: 0, failed: 0 };
  }

  let processed = 0;
  let success = 0;
  let failed = 0;

  console.log('🌐 Scraping storefronts...');
  console.log('');

  for (const item of pending) {
    try {
      process.stdout.write(`[${processed + 1}/${pending.length}] ${item.username}... `);

      const data = await scrapeStorefront(item.url);
      await saveStorefront(data);
      await updateQueueStatus(item.username, 'completed');

      console.log(`✅ (${data.name || 'No name'})`);
      success++;

    } catch (error) {
      console.log(`❌ ${error.message}`);
      await updateQueueStatus(item.username, 'failed', error.message);
      failed++;
    }

    processed++;

    // Rate limiting
    if (processed < pending.length) {
      await sleep(CONFIG.delayBetweenScrapes);
    }
  }

  console.log('');
  console.log('📊 Processing Summary');
  console.log('=====================');
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);

  // Update stats table
  await updateStats();

  return { processed, success, failed };
}

/**
 * Update stats table
 */
async function updateStats() {
  const { data: storefronts } = await supabase.from('storefronts').select('id, is_top, likes');
  const { data: lists } = await supabase.from('lists').select('id');
  const { data: products } = await supabase.from('products').select('id');

  if (storefronts) {
    await supabase.from('stats').upsert({
      id: 1,
      total_storefronts: storefronts.length,
      top_creators: storefronts.filter(s => s.is_top).length,
      total_lists: lists?.length || 0,
      total_likes: storefronts.reduce((sum, s) => sum + (s.likes || 0), 0),
      total_products: products?.length || 0,
      last_updated: new Date().toISOString(),
    });
  }
}

// CLI execution
if (require.main === module) {
  const limitArg = process.argv.find(arg => arg.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf('--limit') + 1]) : 100;

  processQueue({ limit })
    .then(results => {
      console.log('');
      console.log('✅ Processing complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { processQueue };

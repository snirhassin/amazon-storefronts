/**
 * Process Discovery Queue - Scrape pending storefronts
 * Improved version with retry logic, better headers, and list scraping
 *
 * Usage:
 *   node scripts/process-queue.js
 *   node scripts/process-queue.js --limit 100
 *   node scripts/process-queue.js --all
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  delayBetweenScrapes: 5000,  // 5 seconds between scrapes
  delayBetweenLists: 2000,    // 2 seconds between list scrapes
  maxRetries: 3,
  retryDelay: 10000,          // 10 seconds before retry
};

// Realistic browser headers
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

/**
 * Fetch pending storefronts from queue
 */
async function getPendingStorefronts(limit = 1000) {
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
 * Fetch with retry logic
 */
async function fetchWithRetry(url, retries = CONFIG.maxRetries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: HEADERS });

      if (response.status === 503 || response.status === 429) {
        if (attempt < retries) {
          console.log(`   ⏳ Rate limited, retry ${attempt}/${retries} in ${CONFIG.retryDelay/1000}s...`);
          await sleep(CONFIG.retryDelay * attempt); // Exponential backoff
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      if (attempt === retries) throw error;
      console.log(`   ⏳ Error, retry ${attempt}/${retries}...`);
      await sleep(CONFIG.retryDelay * attempt);
    }
  }
}

/**
 * Scrape a single storefront
 */
async function scrapeStorefront(url) {
  const html = await fetchWithRetry(url);

  // Check if it's a valid storefront page
  if (html.includes('Page not found') || html.includes('404') || html.includes('Sorry, we couldn')) {
    throw new Error('Page not found');
  }

  // Extract data from HTML
  const data = {
    name: extractMeta(html, 'og:title')?.replace(/'s Amazon Page$/, '') || extractText(html, /<h1[^>]*>([^<]+)<\/h1>/),
    bio: extractMeta(html, 'og:description'),
    image: extractMeta(html, 'og:image'),
    url: url,
  };

  // Extract username from URL
  const match = url.match(/\/shop\/([^\/\?#]+)/);
  data.username = match ? match[1] : null;
  data.id = data.username;

  // Try to extract lists count and likes from page
  const listsMatch = html.match(/(\d+)\s*(?:idea\s*)?lists?/i);
  const likesMatch = html.match(/(\d+(?:,\d+)*)\s*likes?/i);

  data.lists = listsMatch ? parseInt(listsMatch[1]) : 0;
  data.likes = likesMatch ? parseInt(likesMatch[1].replace(/,/g, '')) : 0;

  // Check for top creator badge
  data.is_top = html.includes('Top Creator') || html.includes('top-creator') || html.includes('Top Influencer');

  // Detect marketplace
  if (url.includes('amazon.co.uk')) data.marketplace = 'UK';
  else if (url.includes('amazon.de')) data.marketplace = 'DE';
  else if (url.includes('amazon.fr')) data.marketplace = 'FR';
  else if (url.includes('amazon.ca')) data.marketplace = 'CA';
  else if (url.includes('amazon.co.jp')) data.marketplace = 'JP';
  else data.marketplace = 'US';

  // Extract list URLs from the page
  const listUrls = [];
  const listRegex = /href="(\/shop\/[^"]+\/list\/[^"]+)"/g;
  let listMatch;
  while ((listMatch = listRegex.exec(html)) !== null) {
    const listUrl = 'https://www.amazon.com' + listMatch[1].split('?')[0];
    if (!listUrls.includes(listUrl)) {
      listUrls.push(listUrl);
    }
  }
  data.listUrls = listUrls;

  return data;
}

/**
 * Scrape a single list
 */
async function scrapeList(listUrl, storefrontId) {
  try {
    const html = await fetchWithRetry(listUrl);

    // Extract list ID from URL
    const idMatch = listUrl.match(/\/list\/([^\/\?#]+)/);
    const listId = idMatch ? idMatch[1] : null;

    if (!listId) return null;

    // Extract list name
    const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/) ||
                      html.match(/og:title"[^>]*content="([^"]+)"/);
    const name = nameMatch ? nameMatch[1].trim() : 'Untitled List';

    // Extract likes
    const likesMatch = html.match(/(\d+(?:,\d+)*)\s*likes?/i);
    const likes = likesMatch ? parseInt(likesMatch[1].replace(/,/g, '')) : 0;

    // Count products (rough estimate from ASIN patterns)
    const asinMatches = html.match(/\/dp\/[A-Z0-9]{10}/g) || [];
    const uniqueAsins = [...new Set(asinMatches.map(m => m.replace('/dp/', '')))];

    return {
      id: listId,
      storefront_id: storefrontId,
      name: name,
      url: listUrl,
      likes: likes,
      products: uniqueAsins.length,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Helper to extract meta tags
 */
function extractMeta(html, property) {
  const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const altRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i');
  const match = html.match(regex) || html.match(altRegex);
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
 * Save list to database
 */
async function saveList(listData) {
  const { error } = await supabase
    .from('lists')
    .upsert(listData, { onConflict: 'id' });

  if (error) console.log(`   Warning: Could not save list ${listData.id}`);
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update stats table
 */
async function updateStats() {
  try {
    const { data: storefronts } = await supabase.from('storefronts').select('id, is_top, likes');
    const { data: lists } = await supabase.from('lists').select('id, likes');
    const { data: products } = await supabase.from('products').select('id');

    if (storefronts) {
      const totalLikes = (storefronts.reduce((sum, s) => sum + (s.likes || 0), 0)) +
                        (lists?.reduce((sum, l) => sum + (l.likes || 0), 0) || 0);

      await supabase.from('stats').upsert({
        id: 1,
        total_storefronts: storefronts.length,
        top_creators: storefronts.filter(s => s.is_top).length,
        total_lists: lists?.length || 0,
        total_likes: totalLikes,
        total_products: products?.length || 0,
        last_updated: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.log('Warning: Could not update stats');
  }
}

/**
 * Main processing function
 */
async function processQueue(options = {}) {
  const { limit = 1000, all = false } = options;
  const actualLimit = all ? 10000 : limit;

  console.log('🔄 Processing Discovery Queue');
  console.log('==============================');
  console.log(`Limit: ${all ? 'ALL' : actualLimit} storefronts`);
  console.log(`Delay between scrapes: ${CONFIG.delayBetweenScrapes/1000}s`);
  console.log(`Max retries: ${CONFIG.maxRetries}`);
  console.log('');

  // Get pending items
  console.log('📋 Fetching pending storefronts...');
  const pending = await getPendingStorefronts(actualLimit);
  console.log(`   Found ${pending.length} pending storefronts`);
  console.log('');

  if (pending.length === 0) {
    console.log('✅ Queue is empty!');
    return { processed: 0, success: 0, failed: 0, lists: 0 };
  }

  let processed = 0;
  let success = 0;
  let failed = 0;
  let totalLists = 0;

  console.log('🌐 Scraping storefronts...');
  console.log('');

  const startTime = Date.now();

  for (const item of pending) {
    try {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rate = processed > 0 ? (success / processed * 100).toFixed(0) : 0;
      process.stdout.write(`[${processed + 1}/${pending.length}] ${item.username} (${rate}% success, ${elapsed}s)... `);

      const data = await scrapeStorefront(item.url);
      await saveStorefront(data);

      // Scrape lists if found
      let listCount = 0;
      if (data.listUrls && data.listUrls.length > 0) {
        process.stdout.write(`\n   📋 Found ${data.listUrls.length} lists, scraping... `);

        for (const listUrl of data.listUrls.slice(0, 20)) { // Limit to 20 lists per storefront
          const listData = await scrapeList(listUrl, data.id);
          if (listData) {
            await saveList(listData);
            listCount++;
            totalLists++;
          }
          await sleep(CONFIG.delayBetweenLists);
        }
        process.stdout.write(`saved ${listCount}\n`);
      }

      await updateQueueStatus(item.username, 'completed');

      const displayName = data.name ? data.name.substring(0, 30) : 'No name';
      if (listCount === 0) {
        console.log(`✅ ${displayName}`);
      } else {
        console.log(`   ✅ ${displayName} (${listCount} lists)`);
      }

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

    // Progress update every 50
    if (processed % 50 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = pending.length - processed;
      const eta = Math.floor((elapsed / processed) * remaining);
      console.log(`\n📊 Progress: ${processed}/${pending.length} | Success: ${success} | Failed: ${failed} | Lists: ${totalLists} | ETA: ${Math.floor(eta/60)}m ${eta%60}s\n`);

      // Update stats periodically
      await updateStats();
    }
  }

  const totalTime = Math.floor((Date.now() - startTime) / 1000);

  console.log('');
  console.log('📊 Final Summary');
  console.log('================');
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${success} (${(success/processed*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed}`);
  console.log(`Lists scraped: ${totalLists}`);
  console.log(`Total time: ${Math.floor(totalTime/60)}m ${totalTime%60}s`);

  // Final stats update
  await updateStats();

  return { processed, success, failed, lists: totalLists };
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const limitArg = args.find(arg => arg.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : 1000;

  processQueue({ limit, all })
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

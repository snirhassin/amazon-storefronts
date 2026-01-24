/**
 * Process Discovery Queue with Playwright
 * Uses headless browser to avoid bot detection
 *
 * Usage:
 *   node scripts/process-queue-playwright.js
 *   node scripts/process-queue-playwright.js --all
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_ANON_KEY,
  delayBetweenScrapes: 3000,  // 3 seconds between scrapes
  delayBetweenLists: 1500,    // 1.5 seconds between list scrapes
  maxListsPerStorefront: 20,
  headless: true,             // Run headless
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
      is_top: data.is_top || false,
      likes: data.likes || 0,
      lists: data.lists || 0,
      marketplace: data.marketplace || 'US',
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
 * Scrape storefront with Playwright
 */
async function scrapeStorefront(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Check for 404 or error pages (Amazon's dog error page)
  const title = await page.title();
  if (title.includes('Sorry! Something went wrong') || title.includes('Page Not Found') || title === 'Amazon.com') {
    throw new Error('Page not found');
  }

  // Wait for content to load
  await page.waitForTimeout(1000);

  // Extract data
  const data = await page.evaluate(() => {
    const getMeta = (property) => {
      const el = document.querySelector(`meta[property="${property}"]`);
      return el ? el.getAttribute('content') : null;
    };

    const name = getMeta('og:title')?.replace(/'s Amazon Page$/, '').replace(/&#39;/g, "'") ||
                 document.querySelector('h1')?.textContent?.trim() || null;

    const bio = getMeta('og:description');
    const image = getMeta('og:image');

    // Extract likes
    const likesText = document.body.innerText.match(/(\d+(?:,\d+)*)\s*likes?/i);
    const likes = likesText ? parseInt(likesText[1].replace(/,/g, '')) : 0;

    // Extract list count
    const listsText = document.body.innerText.match(/(\d+)\s*(?:idea\s*)?lists?/i);
    const lists = listsText ? parseInt(listsText[1]) : 0;

    // Check for top creator
    const isTop = document.body.innerHTML.includes('Top Creator') ||
                  document.body.innerHTML.includes('top-creator') ||
                  document.body.innerHTML.includes('Top Influencer');

    // Extract list URLs
    const listLinks = [...document.querySelectorAll('a[href*="/list/"]')];
    const listUrls = listLinks
      .map(a => a.href)
      .filter(href => href.includes('/shop/') && href.includes('/list/'))
      .map(href => href.split('?')[0])
      .filter((href, i, arr) => arr.indexOf(href) === i);

    return { name, bio, image, likes, lists, isTop, listUrls };
  });

  // Extract username from URL
  const match = url.match(/\/shop\/([^\/\?#]+)/);
  data.username = match ? match[1] : null;
  data.id = data.username;
  data.url = url;
  data.is_top = data.isTop;
  delete data.isTop;

  // Detect marketplace
  if (url.includes('amazon.co.uk')) data.marketplace = 'UK';
  else if (url.includes('amazon.de')) data.marketplace = 'DE';
  else if (url.includes('amazon.fr')) data.marketplace = 'FR';
  else if (url.includes('amazon.ca')) data.marketplace = 'CA';
  else if (url.includes('amazon.co.jp')) data.marketplace = 'JP';
  else data.marketplace = 'US';

  return data;
}

/**
 * Scrape a list with Playwright
 */
async function scrapeList(page, listUrl, storefrontId) {
  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(500);

    const listData = await page.evaluate((storefrontId) => {
      const getMeta = (property) => {
        const el = document.querySelector(`meta[property="${property}"]`);
        return el ? el.getAttribute('content') : null;
      };

      const name = getMeta('og:title')?.replace(/&#39;/g, "'") ||
                   document.querySelector('h1')?.textContent?.trim() || 'Untitled List';

      // Extract likes
      const likesText = document.body.innerText.match(/(\d+(?:,\d+)*)\s*likes?/i);
      const likes = likesText ? parseInt(likesText[1].replace(/,/g, '')) : 0;

      // Count products (ASIN patterns)
      const asinMatches = document.body.innerHTML.match(/\/dp\/[A-Z0-9]{10}/g) || [];
      const uniqueAsins = [...new Set(asinMatches.map(m => m.replace('/dp/', '')))];

      // Extract "updated X days/hours ago" text
      const updatedMatch = document.body.innerText.match(/updated\s+(\d+)\s+(day|hour|week|month|minute)s?\s+ago/i);
      let lastUpdated = null;
      if (updatedMatch) {
        const num = parseInt(updatedMatch[1]);
        const unit = updatedMatch[2].toLowerCase();
        const now = new Date();
        if (unit === 'minute') now.setMinutes(now.getMinutes() - num);
        else if (unit === 'hour') now.setHours(now.getHours() - num);
        else if (unit === 'day') now.setDate(now.getDate() - num);
        else if (unit === 'week') now.setDate(now.getDate() - (num * 7));
        else if (unit === 'month') now.setMonth(now.getMonth() - num);
        lastUpdated = now.toISOString();
      }

      return { name, likes, products: uniqueAsins.length, storefront_id: storefrontId, last_updated: lastUpdated };
    }, storefrontId);

    // Extract list ID from URL
    const idMatch = listUrl.match(/\/list\/([^\/\?#]+)/);
    listData.id = idMatch ? idMatch[1] : null;
    listData.url = listUrl;

    return listData.id ? listData : null;
  } catch (error) {
    return null;
  }
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
    // Ignore stats errors
  }
}

/**
 * Main processing function
 */
async function processQueue(options = {}) {
  const { limit = 1000, all = false } = options;
  const actualLimit = all ? 10000 : limit;

  console.log('🔄 Processing Discovery Queue (Playwright)');
  console.log('==========================================');
  console.log(`Limit: ${all ? 'ALL' : actualLimit} storefronts`);
  console.log(`Delay between scrapes: ${CONFIG.delayBetweenScrapes/1000}s`);
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

  // Launch browser
  console.log('🌐 Launching browser...');
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  let processed = 0;
  let success = 0;
  let failed = 0;
  let totalLists = 0;

  console.log('');
  console.log('🌐 Scraping storefronts...');
  console.log('');

  const startTime = Date.now();

  for (const item of pending) {
    try {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rate = processed > 0 ? (success / processed * 100).toFixed(0) : 0;
      process.stdout.write(`[${processed + 1}/${pending.length}] ${item.username} (${rate}% success, ${elapsed}s)... `);

      const data = await scrapeStorefront(page, item.url);
      await saveStorefront(data);

      // Scrape lists if found
      let listCount = 0;
      if (data.listUrls && data.listUrls.length > 0) {
        const listsToScrape = data.listUrls.slice(0, CONFIG.maxListsPerStorefront);
        process.stdout.write(`\n   📋 Found ${data.listUrls.length} lists, scraping ${listsToScrape.length}... `);

        for (const listUrl of listsToScrape) {
          const listData = await scrapeList(page, listUrl, data.id);
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

    // Progress update every 25
    if (processed % 25 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = pending.length - processed;
      const avgTime = elapsed / processed;
      const eta = Math.floor(avgTime * remaining);
      console.log(`\n📊 Progress: ${processed}/${pending.length} | Success: ${success} | Failed: ${failed} | Lists: ${totalLists} | ETA: ${Math.floor(eta/60)}m ${eta%60}s\n`);

      // Update stats periodically
      await updateStats();
    }
  }

  // Close browser
  await browser.close();

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

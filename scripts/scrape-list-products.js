/**
 * Scrape products from a specific Amazon list
 *
 * Usage:
 *   node scripts/scrape-list-products.js <list_url>
 *   node scripts/scrape-list-products.js <list_id>
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

/**
 * Scrape products from a list page
 */
async function scrapeListProducts(listUrl) {
  console.log(`\n🔍 Scraping products from: ${listUrl}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  try {
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for products to load
    await page.waitForTimeout(2000);

    // Scroll down to load more products
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 500));
      }
    });

    // Wait a bit more for lazy-loaded content
    await page.waitForTimeout(1000);

    // Take screenshot for debugging
    await page.screenshot({ path: 'list-debug.png' });
    console.log('📸 Screenshot saved to list-debug.png');

    // Extract products
    const products = await page.evaluate(() => {
      const items = [];

      // Method 1: Look for product cards with ASIN links
      const productLinks = document.querySelectorAll('a[href*="/dp/"]');
      const seenAsins = new Set();

      productLinks.forEach(link => {
        const href = link.href;
        const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/);
        if (!asinMatch) return;

        const asin = asinMatch[1];
        if (seenAsins.has(asin)) return;
        seenAsins.add(asin);

        // Try to find title - look for nearby text
        let title = '';

        // Check if link has title attribute
        if (link.title) {
          title = link.title;
        }

        // Check for aria-label
        if (!title && link.getAttribute('aria-label')) {
          title = link.getAttribute('aria-label');
        }

        // Look for text content in parent elements
        if (!title) {
          let parent = link.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const h2 = parent.querySelector('h2');
            const h3 = parent.querySelector('h3');
            const span = parent.querySelector('span[class*="title"], span[class*="name"]');

            if (h2?.textContent?.trim()) {
              title = h2.textContent.trim();
              break;
            }
            if (h3?.textContent?.trim()) {
              title = h3.textContent.trim();
              break;
            }
            if (span?.textContent?.trim() && span.textContent.length > 10) {
              title = span.textContent.trim();
              break;
            }
            parent = parent.parentElement;
          }
        }

        // Get image if available
        let image = '';
        const img = link.querySelector('img') || link.parentElement?.querySelector('img');
        if (img?.src && !img.src.includes('pixel') && !img.src.includes('transparent')) {
          image = img.src;
        }

        items.push({
          asin,
          title: title || '',
          url: `https://www.amazon.com/dp/${asin}`,
          image,
        });
      });

      return items;
    });

    console.log(`\n📦 Found ${products.length} products:\n`);
    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.asin} - ${p.title?.substring(0, 60) || '(no title)'}...`);
    });

    await browser.close();
    return products;

  } catch (error) {
    console.error('❌ Error scraping:', error.message);
    await page.screenshot({ path: 'error-screenshot.png' });
    await browser.close();
    return [];
  }
}

/**
 * Save products to Supabase
 */
async function saveProducts(products, listId, storefrontId) {
  if (products.length === 0) return 0;

  console.log(`\n💾 Saving ${products.length} products to database...`);

  // Delete existing products for this list first
  await supabase.from('products').delete().eq('list_id', listId);

  // Insert new products
  const toInsert = products.map((p, i) => ({
    asin: p.asin,
    title: p.title,
    url: p.url,
    image: p.image,
    list_id: listId,
    storefront_id: storefrontId,
    position: i + 1,
  }));

  const { error } = await supabase.from('products').insert(toInsert);

  if (error) {
    console.error('Error saving products:', error);
    return 0;
  }

  // Update list product count
  await supabase
    .from('lists')
    .update({ products: products.length, last_scraped: new Date().toISOString() })
    .eq('id', listId);

  console.log(`✅ Saved ${products.length} products`);
  return products.length;
}

/**
 * Main function
 */
async function main() {
  const input = process.argv[2];

  if (!input) {
    console.log('Usage: node scripts/scrape-list-products.js <list_url or list_id>');
    console.log('Example: node scripts/scrape-list-products.js https://www.amazon.com/shop/abeautifulmess/list/XXXXX');
    console.log('Example: node scripts/scrape-list-products.js LISTID123');
    process.exit(1);
  }

  let listUrl = input;
  let listId = null;
  let storefrontId = null;

  // If input is a list ID (not a URL), look it up in database
  if (!input.startsWith('http')) {
    console.log(`Looking up list ID: ${input}`);
    const { data: list, error } = await supabase
      .from('lists')
      .select('*')
      .eq('id', input)
      .single();

    if (error || !list) {
      console.error('List not found in database');
      process.exit(1);
    }

    listUrl = list.url;
    listId = list.id;
    storefrontId = list.storefront_id;
    console.log(`Found list: ${list.name}`);
    console.log(`URL: ${listUrl}`);
  } else {
    // Extract list ID from URL
    const idMatch = input.match(/\/list\/([^\/\?#]+)/);
    listId = idMatch ? idMatch[1] : null;

    // Extract storefront from URL
    const sfMatch = input.match(/\/shop\/([^\/\?#]+)/);
    storefrontId = sfMatch ? sfMatch[1] : null;
  }

  const products = await scrapeListProducts(listUrl);

  if (products.length > 0 && listId) {
    await saveProducts(products, listId, storefrontId);
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);

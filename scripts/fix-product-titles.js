/**
 * Fix products with bad titles by fetching from Amazon
 *
 * Usage:
 *   node scripts/fix-product-titles.js           # Fix all bad titles
 *   node scripts/fix-product-titles.js --list=ID # Fix titles for specific list
 *   node scripts/fix-product-titles.js --limit=N # Limit to N products
 */

require('dotenv').config();
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const BAD_TITLES = ['Skip to', 'Product Detail Page Link', 'Skip to main content', '', null];

function isBadTitle(title) {
  if (!title || title.length < 5) return true;
  const lower = title.toLowerCase();
  return BAD_TITLES.some(bad => bad && lower.startsWith(bad.toLowerCase()));
}

async function fetchProductTitle(page, asin) {
  try {
    const url = `https://www.amazon.com/dp/${asin}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);

    const title = await page.evaluate(() => {
      // Try multiple selectors for product title
      const selectors = [
        '#productTitle',
        '#title',
        'h1.a-size-large',
        'span.product-title-word-break',
        'h1[data-automation-id="title"]'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          return el.textContent.trim();
        }
      }

      // Try meta title
      const meta = document.querySelector('meta[name="title"]');
      if (meta?.content) return meta.content;

      return null;
    });

    return title;
  } catch (err) {
    console.log(`    Error fetching ${asin}: ${err.message}`);
    return null;
  }
}

async function fixBadTitles(options = {}) {
  const { listId, limit = 100 } = options;

  console.log('🔧 Fixing products with bad titles');
  console.log('='.repeat(50));

  // Build query
  let query = supabase.from('products').select('*');

  if (listId) {
    query = query.eq('list_id', listId);
    console.log(`List: ${listId}`);
  }

  const { data: allProducts, error } = await query.limit(limit * 10); // Get more to filter

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  // Filter to products with bad titles
  const badProducts = allProducts.filter(p => isBadTitle(p.title)).slice(0, limit);

  console.log(`Found ${badProducts.length} products with bad titles (limit: ${limit})`);
  console.log('');

  if (badProducts.length === 0) {
    console.log('No products to fix!');
    return;
  }

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let fixed = 0;
  let failed = 0;

  for (let i = 0; i < badProducts.length; i++) {
    const product = badProducts[i];
    process.stdout.write(`[${i + 1}/${badProducts.length}] ${product.asin}: `);

    const newTitle = await fetchProductTitle(page, product.asin);

    if (newTitle && !isBadTitle(newTitle)) {
      // Update in database
      const { error: updateError } = await supabase
        .from('products')
        .update({ title: newTitle })
        .eq('asin', product.asin)
        .eq('list_id', product.list_id);

      if (updateError) {
        console.log(`❌ DB error`);
        failed++;
      } else {
        console.log(`✅ ${newTitle.substring(0, 50)}...`);
        fixed++;
      }
    } else {
      console.log('❌ No title found');
      failed++;
    }

    // Rate limiting
    if (i < badProducts.length - 1) {
      await page.waitForTimeout(1000);
    }
  }

  await browser.close();

  console.log('');
  console.log('='.repeat(50));
  console.log(`✅ Fixed: ${fixed}`);
  console.log(`❌ Failed: ${failed}`);
}

// Parse CLI args
const args = process.argv.slice(2);
const listArg = args.find(a => a.startsWith('--list='));
const limitArg = args.find(a => a.startsWith('--limit='));

const options = {
  listId: listArg ? listArg.split('=')[1] : null,
  limit: limitArg ? parseInt(limitArg.split('=')[1]) : 50,
};

fixBadTitles(options).catch(console.error);

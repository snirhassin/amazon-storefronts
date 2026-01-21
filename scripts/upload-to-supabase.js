/**
 * Upload JSON data to Supabase
 *
 * Usage:
 * 1. Create .env file with SUPABASE_URL and SUPABASE_ANON_KEY
 * 2. Run: node scripts/upload-to-supabase.js
 */

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Error: Missing Supabase credentials');
    console.error('Create a .env file with:');
    console.error('  SUPABASE_URL=your-url');
    console.error('  SUPABASE_ANON_KEY=your-key');
    process.exit(1);
}

const DATA_DIR = path.join(__dirname, '../ui/data');

// Simple fetch-based Supabase client
async function supabaseRequest(table, method, data = null, options = {}) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);

    if (options.query) {
        Object.entries(options.query).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });
    }

    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': options.prefer || 'return=minimal'
    };

    const response = await fetch(url.toString(), {
        method,
        headers,
        body: data ? JSON.stringify(data) : null
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${response.status} - ${errorText}`);
    }

    if (options.prefer?.includes('return=representation')) {
        return response.json();
    }
    return null;
}

async function clearTable(table) {
    console.log(`  Clearing ${table}...`);
    await supabaseRequest(table, 'DELETE', null, { query: { id: 'neq.' } });
}

async function uploadStorefronts() {
    const filePath = path.join(DATA_DIR, 'storefronts.json');
    if (!fs.existsSync(filePath)) {
        console.log('  No storefronts.json found, skipping');
        return { count: 0, ids: new Set() };
    }

    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const storefronts = json.data;

    console.log(`  Uploading ${storefronts.length} storefronts...`);

    // Transform to Supabase format and deduplicate by id
    const seen = new Set();
    const rows = [];
    for (const s of storefronts) {
        if (!seen.has(s.id)) {
            seen.add(s.id);
            rows.push({
                id: s.id,
                url: s.url,
                username: s.username,
                name: s.name || '',
                bio: s.bio || '',
                image: s.image || '',
                is_top: s.isTop || false,
                likes: s.likes || 0,
                lists: s.lists || 0,
                total_list_likes: s.totalListLikes || 0,
                marketplace: s.marketplace || 'US'
            });
        }
    }

    console.log(`  Deduplicated to ${rows.length} unique storefronts`);

    // Upload in batches of 100 (smaller batches to avoid conflicts)
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await supabaseRequest('storefronts', 'POST', batch, {
            prefer: 'resolution=merge-duplicates'
        });
        console.log(`    Uploaded ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }

    return { count: rows.length, ids: seen };
}

async function uploadLists(validStorefrontIds) {
    const filePath = path.join(DATA_DIR, 'lists.json');
    if (!fs.existsSync(filePath)) {
        console.log('  No lists.json found, skipping');
        return 0;
    }

    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const lists = json.data;

    console.log(`  Uploading ${lists.length} lists...`);

    // Transform to Supabase format, deduplicate, and filter by valid storefronts
    const seen = new Set();
    const rows = [];
    let skipped = 0;
    for (const l of lists) {
        if (!seen.has(l.id)) {
            seen.add(l.id);
            // Only include lists with valid storefront references
            if (validStorefrontIds.has(l.storefront)) {
                rows.push({
                    id: l.id,
                    storefront_id: l.storefront,
                    name: l.name || '',
                    url: l.url || '',
                    likes: l.likes || 0,
                    products: l.products || 0
                });
            } else {
                skipped++;
            }
        }
    }

    console.log(`  Deduplicated to ${rows.length} unique lists (${skipped} skipped - orphaned)`);

    // Upload in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await supabaseRequest('lists', 'POST', batch, {
            prefer: 'resolution=merge-duplicates'
        });
        console.log(`    Uploaded ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }

    return rows.length;
}

async function uploadProducts() {
    const filePath = path.join(DATA_DIR, 'products.json');
    if (!fs.existsSync(filePath)) {
        console.log('  No products.json found, skipping');
        return 0;
    }

    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const products = json.data;

    console.log(`  Uploading ${products.length} products...`);

    // Transform to Supabase format and deduplicate by asin+list_id
    const seen = new Set();
    const rows = [];
    for (const p of products) {
        const key = `${p.asin}_${p.listId}`;
        if (!seen.has(key) && p.asin && p.listId) {
            seen.add(key);
            rows.push({
                asin: p.asin,
                title: p.title || '',
                url: p.url || '',
                price: p.price || null,
                currency: p.currency || 'USD',
                image: p.image || '',
                list_id: p.listId,
                storefront_id: p.storefront,
                position: p.position || 0
            });
        }
    }

    console.log(`  Deduplicated to ${rows.length} unique products`);

    // Upload in batches (smaller to handle errors)
    const batchSize = 50;
    let uploaded = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        try {
            await supabaseRequest('products', 'POST', batch, {
                prefer: 'resolution=merge-duplicates'
            });
            uploaded += batch.length;
        } catch (err) {
            // Try one by one if batch fails
            for (const row of batch) {
                try {
                    await supabaseRequest('products', 'POST', [row], {
                        prefer: 'resolution=merge-duplicates'
                    });
                    uploaded++;
                } catch (e) {
                    // Skip individual failures
                }
            }
        }
        console.log(`    Uploaded ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
    }

    return uploaded;
}

async function updateStats(storefrontCount, listCount, productCount) {
    console.log('  Updating stats...');

    // Load storefronts to calculate stats
    const storefrontsPath = path.join(DATA_DIR, 'storefronts.json');
    let topCreators = 0;
    let totalLikes = 0;

    if (fs.existsSync(storefrontsPath)) {
        const json = JSON.parse(fs.readFileSync(storefrontsPath, 'utf8'));
        topCreators = json.data.filter(s => s.isTop).length;
        totalLikes = json.data.reduce((sum, s) => sum + (s.totalListLikes || 0), 0);
    }

    const statsRow = {
        id: 1,
        total_storefronts: storefrontCount,
        top_creators: topCreators,
        total_lists: listCount,
        total_likes: totalLikes,
        total_products: productCount,
        last_updated: new Date().toISOString()
    };

    await supabaseRequest('stats', 'POST', statsRow, {
        prefer: 'resolution=merge-duplicates'
    });
}

async function main() {
    console.log('='.repeat(50));
    console.log('Upload JSON Data to Supabase');
    console.log('='.repeat(50));
    console.log(`Supabase URL: ${SUPABASE_URL}`);
    console.log('');

    try {
        console.log('Step 1: Upload Storefronts');
        const { count: storefrontCount, ids: storefrontIds } = await uploadStorefronts();

        console.log('\nStep 2: Upload Lists');
        const listCount = await uploadLists(storefrontIds);

        console.log('\nStep 3: Upload Products');
        const productCount = await uploadProducts();

        console.log('\nStep 4: Update Stats');
        await updateStats(storefrontCount, listCount, productCount);

        console.log('\n' + '='.repeat(50));
        console.log('Upload Complete!');
        console.log('='.repeat(50));
        console.log(`Storefronts: ${storefrontCount}`);
        console.log(`Lists: ${listCount}`);
        console.log(`Products: ${productCount}`);

    } catch (error) {
        console.error('\nError during upload:', error.message);
        process.exit(1);
    }
}

main();

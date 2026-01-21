const fs = require('fs');
const path = require('path');

const DATA_INPUT = path.join(__dirname, '../data/output');
const DATA_OUTPUT = path.join(__dirname, '../ui/data');

// Ensure output directory exists
if (!fs.existsSync(DATA_OUTPUT)) {
    fs.mkdirSync(DATA_OUTPUT, { recursive: true });
}

// Parse CSV with proper quote handling
function parseCSV(text) {
    // Remove BOM if present
    text = text.replace(/^\uFEFF/, '');
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => {
            obj[h] = values[idx] || '';
        });
        data.push(obj);
    }

    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}

// Load and process storefronts
console.log('Loading storefronts.csv...');
const storefrontsCSV = fs.readFileSync(path.join(DATA_INPUT, 'storefronts.csv'), 'utf8');
const storefrontsRaw = parseCSV(storefrontsCSV);

// Load and process lists
console.log('Loading lists.csv...');
const listsCSV = fs.readFileSync(path.join(DATA_INPUT, 'lists.csv'), 'utf8');
const listsRaw = parseCSV(listsCSV);

// Calculate total list likes per storefront
const listLikesByStorefront = {};
const listCountByStorefront = {};
listsRaw.forEach(list => {
    const sid = list.storefront_id;
    listLikesByStorefront[sid] = (listLikesByStorefront[sid] || 0) + (parseInt(list.likes_count) || 0);
    listCountByStorefront[sid] = (listCountByStorefront[sid] || 0) + 1;
});

// Filter successful storefronts and transform
const storefronts = storefrontsRaw
    .filter(s => s.scrape_status === 'success')
    .map(s => ({
        id: s.storefront_id,
        url: s.storefront_url,
        username: s.username,
        name: s.creator_name || '',
        bio: s.bio || '',
        image: s.profile_image_url || '',
        isTop: s.is_top_creator === 'true',
        likes: parseInt(s.storefront_likes) || 0,
        lists: parseInt(s.total_lists) || listCountByStorefront[s.storefront_id] || 0,
        totalListLikes: listLikesByStorefront[s.storefront_id] || 0,
        marketplace: s.marketplace || 'US'
    }))
    .sort((a, b) => b.totalListLikes - a.totalListLikes);

// Calculate stats
const stats = {
    total: storefronts.length,
    topCreators: storefronts.filter(s => s.isTop).length,
    totalLists: listsRaw.length,
    totalLikes: Object.values(listLikesByStorefront).reduce((a, b) => a + b, 0),
    lastUpdated: new Date().toISOString()
};

// Transform lists
const lists = listsRaw.map(l => ({
    id: l.list_id,
    storefront: l.storefront_id,
    name: l.list_name,
    url: l.list_url,
    likes: parseInt(l.likes_count) || 0,
    products: parseInt(l.products_count) || 0
})).sort((a, b) => b.likes - a.likes);

// Write storefronts.json
const storefrontsJSON = {
    stats,
    data: storefronts
};

fs.writeFileSync(
    path.join(DATA_OUTPUT, 'storefronts.json'),
    JSON.stringify(storefrontsJSON, null, 2)
);
console.log(`✓ Created storefronts.json (${storefronts.length} storefronts)`);

// Write lists.json
const listsJSON = {
    total: lists.length,
    data: lists
};

fs.writeFileSync(
    path.join(DATA_OUTPUT, 'lists.json'),
    JSON.stringify(listsJSON, null, 2)
);
console.log(`✓ Created lists.json (${lists.length} lists)`);

// Load and process products (if exists)
const productsPath = path.join(DATA_INPUT, 'products.csv');
let products = [];
let totalProducts = 0;

if (fs.existsSync(productsPath)) {
    console.log('Loading products.csv...');
    const productsCSV = fs.readFileSync(productsPath, 'utf8');
    const productsRaw = parseCSV(productsCSV);

    // Transform products - keep only essential fields for export
    products = productsRaw.map(p => ({
        asin: p.asin,
        title: p.product_title || '',
        url: p.product_url || `https://www.amazon.com/dp/${p.asin}`,
        price: parseFloat(p.price_numeric) || null,
        currency: p.currency || 'USD',
        image: p.image_url || '',
        listId: p.list_id,
        storefront: p.storefront_id,
        position: parseInt(p.position_in_list) || 0
    })).filter(p => p.asin); // Only keep products with valid ASIN

    totalProducts = products.length;

    // Write products.json
    const productsJSON = {
        total: products.length,
        data: products
    };

    fs.writeFileSync(
        path.join(DATA_OUTPUT, 'products.json'),
        JSON.stringify(productsJSON, null, 2)
    );
    console.log(`✓ Created products.json (${products.length} products)`);
} else {
    console.log('No products.csv found - skipping products');
}

// Update stats with products count
stats.totalProducts = totalProducts;

// Rewrite storefronts.json with updated stats
fs.writeFileSync(
    path.join(DATA_OUTPUT, 'storefronts.json'),
    JSON.stringify({ stats, data: storefronts }, null, 2)
);

// Print summary
console.log('\n=== Conversion Summary ===');
console.log(`Storefronts: ${stats.total}`);
console.log(`Top Creators: ${stats.topCreators}`);
console.log(`Total Lists: ${stats.totalLists}`);
console.log(`Total Likes: ${stats.totalLikes.toLocaleString()}`);
console.log(`Total Products: ${totalProducts.toLocaleString()}`);
console.log(`\nFiles saved to: ${DATA_OUTPUT}`);

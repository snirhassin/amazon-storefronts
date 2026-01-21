const ProductExtractor = require('./product-extractor');
const RateLimiter = require('../utils/rate-limiter');

class ListScraper {
    constructor() {
        this.productExtractor = new ProductExtractor();
        this.rateLimiter = new RateLimiter();
        this.maxScrolls = 30;
    }

    async scrapeList(page, listUrl, storefrontId, listName = '', options = {}) {
        const { likesOnly = false } = options;
        console.log(`    Scraping list${likesOnly ? ' (likes only)' : ''}: ${listName || listUrl}`);

        try {
            // Navigate to list page
            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Extract list metadata (including likes)
            const listData = await this.extractListMetadata(page, listUrl, storefrontId);

            let products = [];

            // Only scrape products if not in likesOnly mode
            if (!likesOnly) {
                // Scroll to load all products
                await this.scrollToLoadAll(page);

                // Extract products
                products = await this.productExtractor.extractProductsFromPage(page, storefrontId, listData.list_id);
                listData.products_count = products.length;
            }

            console.log(`      ${listData.likes_count} likes${!likesOnly ? `, ${products.length} products` : ''}`);

            return {
                list: listData,
                products
            };

        } catch (error) {
            console.log(`      Error scraping list: ${error.message}`);
            return {
                list: {
                    list_id: this.extractListId(listUrl),
                    storefront_id: storefrontId,
                    list_name: listName,
                    list_url: listUrl,
                    likes_count: 0,
                    products_count: 0,
                    category: null,
                    position: 0,
                    scraped_at: new Date().toISOString(),
                    error: error.message
                },
                products: []
            };
        }
    }

    async extractListMetadata(page, listUrl, storefrontId) {
        const metadata = await page.evaluate(() => {
            // List name - usually in h1 or prominent header
            const nameEl = document.querySelector('h1, [class*="list-title"], [class*="ListTitle"]');
            const name = nameEl?.textContent?.trim() || '';

            // Likes count - look for heart icon with number
            let likes = 0;
            const likeSelectors = [
                '[class*="like"] span',
                '[class*="heart"] + span',
                '[class*="favorite"]',
                '[aria-label*="like"]'
            ];

            for (const selector of likeSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const match = el.textContent.match(/(\d+)/);
                    if (match) {
                        likes = parseInt(match[1]);
                        break;
                    }
                }
            }

            // Also check for likes in any visible text
            if (likes === 0) {
                const allText = document.body.innerText;
                const likesMatch = allText.match(/(\d+)\s*(?:likes?|hearts?|favorites?)/i);
                if (likesMatch) {
                    likes = parseInt(likesMatch[1]);
                }
            }

            // Category - may be in breadcrumbs or labels
            const categoryEl = document.querySelector('[class*="category"], [class*="breadcrumb"] a');
            const category = categoryEl?.textContent?.trim() || null;

            return { name, likes, category };
        });

        return {
            list_id: this.extractListId(listUrl),
            storefront_id: storefrontId,
            list_name: metadata.name,
            list_url: listUrl,
            likes_count: metadata.likes,
            products_count: 0, // Will be updated after extraction
            category: metadata.category,
            position: 0,
            scraped_at: new Date().toISOString()
        };
    }

    extractListId(url) {
        // Extract list ID from URL patterns like:
        // /shop/username/list/LISTID
        // /shop/username/list/LISTID?...
        const match = url.match(/\/list\/([^/?&]+)/i);
        return match ? match[1] : url.split('/').pop()?.split('?')[0] || 'unknown';
    }

    async scrollToLoadAll(page) {
        let previousHeight = 0;
        let noChangeCount = 0;

        for (let i = 0; i < this.maxScrolls; i++) {
            // Get current scroll height
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);

            if (currentHeight === previousHeight) {
                noChangeCount++;
                if (noChangeCount >= 3) {
                    break; // No more content to load
                }
            } else {
                noChangeCount = 0;
                previousHeight = currentHeight;
            }

            // Scroll down
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));

            // Wait for content to load
            await this.rateLimiter.wait(1500);
        }
    }
}

module.exports = ListScraper;

const BrowserManager = require('../utils/browser-manager');
const RateLimiter = require('../utils/rate-limiter');
const CSVHandler = require('../utils/csv-handler');
const ListScraper = require('./list-scraper');
const ProductExtractor = require('./product-extractor');

class StorefrontScraper {
    constructor(options = {}) {
        this.browser = options.browser || null;
        this.ownsBrowser = !options.browser;
        this.rateLimiter = new RateLimiter();
        this.csvHandler = new CSVHandler();
        this.listScraper = new ListScraper();
        this.productExtractor = new ProductExtractor();
        this.scrapeProducts = options.scrapeProducts !== false;
        this.maxListsPerStorefront = options.maxListsPerStorefront || 50;
    }

    async init() {
        if (!this.browser) {
            this.browser = new BrowserManager();
            await this.browser.init();
        }
        return this;
    }

    async close() {
        if (this.ownsBrowser && this.browser) {
            await this.browser.close();
        }
    }

    async scrapeStorefront(url, discoverySource = 'manual') {
        const page = await this.browser.newPage();

        try {
            console.log(`\nScraping storefront: ${url}`);

            // Navigate to storefront
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(2000);

            // Check if page loaded correctly
            const pageTitle = await page.title();
            if (pageTitle.includes('Page Not Found') || pageTitle.includes('404')) {
                throw new Error('Storefront not found (404)');
            }

            // Extract storefront profile data
            const storefrontData = await this.extractProfileData(page, url, discoverySource);
            console.log(`  Creator: ${storefrontData.creator_name || storefrontData.username}`);
            console.log(`  Top Creator: ${storefrontData.is_top_creator ? 'Yes' : 'No'}`);
            console.log(`  Storefront Likes: ${storefrontData.storefront_likes || 0}`);

            // Scroll to load all lists
            await this.scrollToLoadLists(page);

            // Extract list metadata
            const lists = await this.extractLists(page, storefrontData.storefront_id);
            storefrontData.total_lists = lists.length;
            console.log(`  Lists found: ${lists.length}`);

            // Scrape each list for products (only if products are requested)
            // Note: Likes are already extracted from the storefront page, no need to visit individual lists for likes
            let allProducts = [];

            if (this.scrapeProducts && lists.length > 0) {
                const maxLists = Math.min(lists.length, this.maxListsPerStorefront);
                console.log(`  Scraping products from up to ${maxLists} lists...`);

                for (let i = 0; i < maxLists; i++) {
                    const list = lists[i];
                    list.position = i + 1;

                    if (list.list_url && list.list_url !== url) {
                        const result = await this.listScraper.scrapeList(
                            page,
                            list.list_url,
                            storefrontData.storefront_id,
                            list.list_name,
                            { likesOnly: false }
                        );

                        // Preserve likes from storefront page (always use storefront likes)
                        const storefrontLikes = list.likes_count;
                        Object.assign(list, result.list);
                        // Always use storefront-extracted likes since they're more reliable
                        if (storefrontLikes > 0) {
                            list.likes_count = storefrontLikes;
                        }
                        allProducts.push(...result.products);

                        await this.rateLimiter.waitBetweenPages();
                    }
                }
            } else {
                // If not scraping products, just log that likes were captured from storefront
                const totalLikes = lists.reduce((sum, l) => sum + (l.likes_count || 0), 0);
                console.log(`  List likes captured from storefront: ${totalLikes} total likes`);
            }

            storefrontData.total_products = allProducts.length;
            storefrontData.scrape_status = 'success';

            return {
                storefront: storefrontData,
                lists,
                products: allProducts
            };

        } catch (error) {
            console.log(`  Error: ${error.message}`);

            const storefrontId = this.extractStorefrontId(url);
            return {
                storefront: {
                    storefront_id: storefrontId,
                    storefront_url: url,
                    username: storefrontId,
                    creator_name: '',
                    bio: '',
                    profile_image_url: '',
                    is_top_creator: false,
                    follower_count: null,
                    total_lists: 0,
                    total_products: 0,
                    discovery_source: discoverySource,
                    marketplace: this.extractMarketplace(url),
                    scraped_at: new Date().toISOString(),
                    scrape_status: 'failed',
                    error: error.message
                },
                lists: [],
                products: []
            };
        } finally {
            await page.close();
        }
    }

    async extractProfileData(page, url, discoverySource) {
        const data = await page.evaluate(() => {
            // Creator name - look for prominent name display
            const nameSelectors = [
                'h1',
                '[class*="creator-name"]',
                '[class*="profile-name"]',
                '[class*="shop-name"]',
                '[class*="StoreName"]'
            ];

            let creatorName = '';
            for (const selector of nameSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim()) {
                    creatorName = el.textContent.trim();
                    break;
                }
            }

            // Bio/description
            const bioSelectors = [
                '[class*="bio"]',
                '[class*="description"]',
                '[class*="about"]',
                'p[class*="text"]'
            ];

            let bio = '';
            for (const selector of bioSelectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim().length > 20) {
                    bio = el.textContent.trim();
                    break;
                }
            }

            // Profile image
            const imgSelectors = [
                '[class*="avatar"] img',
                '[class*="profile"] img',
                'img[class*="creator"]'
            ];

            let profileImage = '';
            for (const selector of imgSelectors) {
                const el = document.querySelector(selector);
                if (el && el.src && !el.src.includes('transparent')) {
                    profileImage = el.src;
                    break;
                }
            }

            // Top Creator badge - look for badge near creator name or in header
            // Common patterns: "Top Creator" text, badge icons, verified checkmarks
            const badgeSelectors = [
                '[class*="badge"]',
                '[class*="Badge"]',
                '[class*="verified"]',
                '[class*="top-creator"]',
                '[class*="TopCreator"]',
                '[aria-label*="top"]',
                '[aria-label*="Top"]',
                '[aria-label*="verified"]',
                '[data-testid*="badge"]',
                'svg[class*="badge"]',
                'span[class*="badge"]'
            ];

            let isTopCreator = false;
            // First check for explicit badge elements
            for (const selector of badgeSelectors) {
                const els = document.querySelectorAll(selector);
                for (const el of els) {
                    const text = (el.textContent || '').toLowerCase();
                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                    const className = (el.className || '').toLowerCase();

                    if (text.includes('top creator') ||
                        ariaLabel.includes('top creator') ||
                        className.includes('topcreator') ||
                        text.includes('verified') ||
                        ariaLabel.includes('verified')) {
                        isTopCreator = true;
                        break;
                    }
                }
                if (isTopCreator) break;
            }

            // Also check page text for "Top Creator" near the name
            if (!isTopCreator) {
                const headerArea = document.querySelector('header, [class*="header"], [class*="profile"]');
                if (headerArea) {
                    const headerText = headerArea.innerText.toLowerCase();
                    if (headerText.includes('top creator')) {
                        isTopCreator = true;
                    }
                }
            }

            // Storefront likes count - heart icon in top right area
            let storefrontLikes = 0;
            const likesSelectors = [
                '[class*="like-count"]',
                '[class*="likeCount"]',
                '[class*="likes"]',
                '[class*="heart"] + span',
                '[class*="Heart"] + span',
                '[aria-label*="like"]',
                '[data-testid*="like"]',
                'button[class*="like"] span',
                '[class*="follow"] span'
            ];

            for (const selector of likesSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent || el.getAttribute('aria-label') || '';
                    const match = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*[KMB]?/i);
                    if (match) {
                        let numStr = match[0].replace(/,/g, '').trim();
                        if (numStr.toUpperCase().includes('K')) {
                            storefrontLikes = parseFloat(numStr) * 1000;
                        } else if (numStr.toUpperCase().includes('M')) {
                            storefrontLikes = parseFloat(numStr) * 1000000;
                        } else {
                            storefrontLikes = parseInt(numStr) || 0;
                        }
                        if (storefrontLikes > 0) break;
                    }
                }
            }

            // Also look for likes in any heart-related elements
            if (storefrontLikes === 0) {
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                    const className = (el.className || '').toString().toLowerCase();
                    if (className.includes('heart') || className.includes('like')) {
                        const text = el.innerText || '';
                        const match = text.match(/^(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)$/i);
                        if (match) {
                            let numStr = match[1].replace(/,/g, '');
                            if (numStr.toUpperCase().includes('K')) {
                                storefrontLikes = parseFloat(numStr) * 1000;
                            } else if (numStr.toUpperCase().includes('M')) {
                                storefrontLikes = parseFloat(numStr) * 1000000;
                            } else {
                                storefrontLikes = parseInt(numStr) || 0;
                            }
                            if (storefrontLikes > 0) break;
                        }
                    }
                }
            }

            // Follower count
            let followerCount = null;
            const followerText = document.body.innerText;
            const followerMatch = followerText.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMB]?)\s*(?:followers?|following)/i);
            if (followerMatch) {
                const numStr = followerMatch[1].replace(/,/g, '');
                if (numStr.includes('K')) {
                    followerCount = parseFloat(numStr) * 1000;
                } else if (numStr.includes('M')) {
                    followerCount = parseFloat(numStr) * 1000000;
                } else if (numStr.includes('B')) {
                    followerCount = parseFloat(numStr) * 1000000000;
                } else {
                    followerCount = parseInt(numStr);
                }
            }

            return {
                creatorName,
                bio: bio.substring(0, 1000), // Limit bio length
                profileImage,
                isTopCreator,
                storefrontLikes,
                followerCount
            };
        });

        const storefrontId = this.extractStorefrontId(url);

        return {
            storefront_id: storefrontId,
            storefront_url: url,
            username: storefrontId,
            creator_name: data.creatorName,
            bio: data.bio,
            profile_image_url: data.profileImage,
            is_top_creator: data.isTopCreator,
            storefront_likes: data.storefrontLikes,
            follower_count: data.followerCount,
            total_lists: 0,
            total_products: 0,
            discovery_source: discoverySource,
            marketplace: this.extractMarketplace(url),
            scraped_at: new Date().toISOString(),
            scrape_status: 'pending'
        };
    }

    async extractLists(page, storefrontId) {
        const lists = await page.evaluate(() => {
            const items = [];
            const seenUrls = new Set();

            // Amazon storefront list cards use these container classes
            // Each list card has class "item-hero-image-container list-item-hero-image-container"
            // The heart count is in div.heart-count inside div.heart-count-container
            const listContainers = document.querySelectorAll('.list-item-hero-image-container, .item-hero-image-container');

            listContainers.forEach((container, index) => {
                // Get the list link
                const link = container.querySelector('a[href*="/list/"]');
                if (!link) return;

                const listUrl = link.href;
                // Dedupe - same list can appear multiple times in carousel
                if (seenUrls.has(listUrl)) return;
                seenUrls.add(listUrl);

                // List name - typically in first span or div with text
                const nameEl = container.querySelector('.list-link-container span, h2, h3, [class*="title"]');
                let name = '';
                if (nameEl) {
                    name = nameEl.textContent?.trim() || '';
                }
                if (!name) {
                    // Fallback: get first line of text content
                    const text = container.innerText?.split('\n')[0]?.trim() || '';
                    name = text;
                }

                // Likes count - use the specific heart-count class
                let likes = 0;
                const heartCountEl = container.querySelector('.heart-count');
                if (heartCountEl) {
                    const text = heartCountEl.textContent?.trim() || '';
                    // Handle K/M suffixes (e.g., "2.0K", "1.5M")
                    const match = text.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
                    if (match) {
                        let num = parseFloat(match[1]);
                        const suffix = (match[2] || '').toUpperCase();
                        if (suffix === 'K') num *= 1000;
                        else if (suffix === 'M') num *= 1000000;
                        else if (suffix === 'B') num *= 1000000000;
                        likes = Math.round(num);
                    } else {
                        // Plain number
                        likes = parseInt(text.replace(/,/g, '')) || 0;
                    }
                }

                // Products count - look for "See all X items" text
                let productsCount = 0;
                const containerText = container.innerText || '';
                const itemsMatch = containerText.match(/(?:See all\s*)?(\d+)\s*items?/i);
                if (itemsMatch) {
                    productsCount = parseInt(itemsMatch[1]) || 0;
                }

                items.push({
                    list_url: listUrl,
                    list_name: name.substring(0, 200),
                    likes_count: likes,
                    products_count: productsCount,
                    position: index + 1
                });
            });

            // If the above didn't find any, fall back to finding all list links
            if (items.length === 0) {
                const listLinks = document.querySelectorAll('a[href*="/list/"]');
                listLinks.forEach((link, index) => {
                    const listUrl = link.href;
                    if (seenUrls.has(listUrl)) return;
                    seenUrls.add(listUrl);

                    // Find parent card container
                    let card = link.parentElement;
                    for (let i = 0; i < 5; i++) {
                        if (card && card.parentElement) card = card.parentElement;
                    }

                    // Get likes from heart-count in the card
                    let likes = 0;
                    const heartCountEl = card?.querySelector('.heart-count');
                    if (heartCountEl) {
                        const text = heartCountEl.textContent?.trim() || '';
                        const match = text.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/i);
                        if (match) {
                            let num = parseFloat(match[1]);
                            const suffix = (match[2] || '').toUpperCase();
                            if (suffix === 'K') num *= 1000;
                            else if (suffix === 'M') num *= 1000000;
                            likes = Math.round(num);
                        } else {
                            likes = parseInt(text.replace(/,/g, '')) || 0;
                        }
                    }

                    items.push({
                        list_url: listUrl,
                        list_name: link.textContent?.trim()?.substring(0, 200) || '',
                        likes_count: likes,
                        products_count: 0,
                        position: index + 1
                    });
                });
            }

            return items;
        });

        const now = new Date().toISOString();

        return lists.map(list => ({
            list_id: this.extractListId(list.list_url),
            storefront_id: storefrontId,
            list_name: list.list_name,
            list_url: list.list_url,
            likes_count: list.likes_count,
            products_count: list.products_count,
            category: null,
            position: list.position,
            scraped_at: now
        }));
    }

    extractListId(url) {
        const match = url.match(/\/list\/([^/?&]+)/i);
        return match ? match[1] : 'unknown';
    }

    extractStorefrontId(url) {
        const match = url.match(/\/shop\/([^/?&]+)/i);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    extractMarketplace(url) {
        const match = url.match(/amazon\.([a-z.]+)/i);
        if (!match) return 'com';

        const domain = match[1];
        const marketplaceMap = {
            'com': 'US',
            'co.uk': 'UK',
            'de': 'DE',
            'fr': 'FR',
            'ca': 'CA',
            'co.jp': 'JP',
            'es': 'ES',
            'it': 'IT',
            'com.au': 'AU',
            'in': 'IN'
        };

        return marketplaceMap[domain] || domain.toUpperCase();
    }

    async scrollToLoadLists(page) {
        let previousHeight = 0;
        let noChangeCount = 0;
        const maxScrolls = 20;

        for (let i = 0; i < maxScrolls; i++) {
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);

            if (currentHeight === previousHeight) {
                noChangeCount++;
                if (noChangeCount >= 3) break;
            } else {
                noChangeCount = 0;
                previousHeight = currentHeight;
            }

            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await this.rateLimiter.wait(1500);
        }
    }
}

// Test mode when run directly
if (require.main === module) {
    const testUrl = process.argv[2] || 'https://www.amazon.com/shop/influencer-765c84f4';

    console.log('Testing StorefrontScraper');
    console.log('='.repeat(50));

    const scraper = new StorefrontScraper({ scrapeProducts: true });

    scraper.init()
        .then(() => scraper.scrapeStorefront(testUrl))
        .then(result => {
            console.log('\n' + '='.repeat(50));
            console.log('Results:');
            console.log(JSON.stringify(result.storefront, null, 2));
            console.log(`\nLists: ${result.lists.length}`);
            console.log(`Products: ${result.products.length}`);
        })
        .then(() => scraper.close())
        .catch(err => {
            console.error('Error:', err);
            scraper.close();
        });
}

module.exports = StorefrontScraper;

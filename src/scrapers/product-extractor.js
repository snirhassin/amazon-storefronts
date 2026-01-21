class ProductExtractor {
    constructor() {
        // ASIN patterns - Amazon Standard Identification Number is 10 alphanumeric characters
        this.asinPatterns = [
            /\/dp\/([A-Z0-9]{10})/i,
            /\/gp\/product\/([A-Z0-9]{10})/i,
            /\/product\/([A-Z0-9]{10})/i,
            /[?&]asin=([A-Z0-9]{10})/i,
            /\/gp\/aw\/d\/([A-Z0-9]{10})/i
        ];
    }

    extractAsinFromUrl(url) {
        if (!url) return null;

        for (const pattern of this.asinPatterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1].toUpperCase();
            }
        }
        return null;
    }

    parsePrice(priceText) {
        if (!priceText) return { price: '', price_numeric: null, currency: '' };

        // Remove extra whitespace
        const cleaned = priceText.replace(/\s+/g, ' ').trim();

        // Currency patterns
        const currencyPatterns = [
            { regex: /\$\s*([\d,]+\.?\d*)/i, currency: 'USD' },
            { regex: /£\s*([\d,]+\.?\d*)/i, currency: 'GBP' },
            { regex: /€\s*([\d,]+\.?\d*)/i, currency: 'EUR' },
            { regex: /¥\s*([\d,]+\.?\d*)/i, currency: 'JPY' },
            { regex: /([\d,]+\.?\d*)\s*€/i, currency: 'EUR' },
            { regex: /USD\s*([\d,]+\.?\d*)/i, currency: 'USD' }
        ];

        for (const { regex, currency } of currencyPatterns) {
            const match = cleaned.match(regex);
            if (match) {
                const numericStr = match[1].replace(/,/g, '');
                const numeric = parseFloat(numericStr);
                return {
                    price: cleaned,
                    price_numeric: isNaN(numeric) ? null : numeric,
                    currency
                };
            }
        }

        return { price: cleaned, price_numeric: null, currency: '' };
    }

    async extractProductsFromPage(page, storefrontId, listId = null) {
        const products = await page.evaluate(() => {
            const items = [];

            // Various possible product card selectors for Amazon storefronts
            const selectors = [
                '[data-component-type="s-search-result"]',
                '.a-carousel-card',
                '[data-asin]',
                '.product-card',
                '.item-card',
                '[class*="ProductCard"]',
                '[class*="product-item"]'
            ];

            let productElements = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    productElements = elements;
                    break;
                }
            }

            // If no specific product cards found, look for any links with ASINs
            if (productElements.length === 0) {
                const allLinks = document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
                allLinks.forEach(link => {
                    const card = link.closest('div[class]') || link.parentElement;
                    if (card && !productElements.includes(card)) {
                        productElements.push(card);
                    }
                });
            }

            productElements.forEach((el, index) => {
                // Find product link
                const link = el.querySelector('a[href*="/dp/"], a[href*="/gp/product/"]') ||
                    el.querySelector('a[href*="amazon"]');

                const productUrl = link?.href || '';

                // Extract ASIN from URL
                const asinMatch = productUrl.match(/\/dp\/([A-Z0-9]{10})|\/gp\/product\/([A-Z0-9]{10})/i);
                const asin = asinMatch ? (asinMatch[1] || asinMatch[2])?.toUpperCase() : null;

                // Find title
                const titleEl = el.querySelector('h2, h3, h4, [class*="title"], [class*="Title"], span.a-text-normal');
                const title = titleEl?.textContent?.trim() || '';

                // Find price
                const priceEl = el.querySelector('[class*="price"], .a-price, [class*="Price"]');
                const price = priceEl?.textContent?.trim() || '';

                // Find image
                const img = el.querySelector('img');
                const imageUrl = img?.src || img?.getAttribute('data-src') || '';

                if (asin || productUrl) {
                    items.push({
                        asin,
                        product_title: title.substring(0, 500), // Limit title length
                        price,
                        image_url: imageUrl,
                        product_url: productUrl,
                        position_in_list: index + 1
                    });
                }
            });

            return items;
        });

        // Post-process products
        const now = new Date().toISOString();

        return products.map(p => {
            const priceData = this.parsePrice(p.price);
            return {
                asin: p.asin || this.extractAsinFromUrl(p.product_url),
                list_id: listId,
                storefront_id: storefrontId,
                product_title: p.product_title,
                price: priceData.price,
                price_numeric: priceData.price_numeric,
                currency: priceData.currency,
                image_url: p.image_url,
                product_url: p.product_url,
                position_in_list: p.position_in_list,
                scraped_at: now
            };
        }).filter(p => p.asin); // Only keep products with valid ASINs
    }

    async extractProductCount(page) {
        return page.evaluate(() => {
            // Try to find product count indicators
            const countSelectors = [
                '[class*="count"]',
                '[class*="total"]',
                '[class*="items"]'
            ];

            for (const selector of countSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const match = el.textContent.match(/(\d+)/);
                    if (match) return parseInt(match[1]);
                }
            }

            // Count visible products
            const products = document.querySelectorAll('[data-asin], a[href*="/dp/"]');
            return products.length;
        });
    }
}

module.exports = ProductExtractor;

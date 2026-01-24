# Amazon Creator Storefronts Scraper

A comprehensive system to discover and scrape Amazon Creator Storefronts at scale. Collects creator profiles, lists with engagement metrics (likes), and product/ASIN data.

## Features

- **Multiple Discovery Sources**: Google site: search, #FoundItOnAmazon, Amazon Live
- **Complete Data Collection**: Creator profiles, lists, likes, products, ASINs
- **Resume Support**: Checkpoint system for interrupted scrapes
- **Anti-Detection**: Rate limiting, random delays, browser fingerprint protection
- **Excel-Compatible Output**: UTF-8 BOM CSV files

## Installation

```bash
cd amazon-storefronts
npm install
```

## Quick Start

### 1. Discover Storefronts

```bash
# Run all discovery sources
npm run discover

# Or run individual sources
npm run discover:google
npm run discover:amazon
```

### 2. Scrape Storefronts

```bash
# Full scrape
npm run scrape

# Test with 10 storefronts
npm run scrape:test

# Resume interrupted scrape
npm run scrape:resume
```

## CLI Options

```bash
node src/index.js [options]

Options:
  --test            Run in test mode (limited discovery)
  --resume          Resume from last checkpoint
  --limit=N         Limit to N storefronts
  --no-products     Skip product scraping (faster, lists only)
  --max-lists=N     Max lists to scrape per storefront (default: 20)
  --help, -h        Show help
```

## Output Files

All output is saved to `data/output/`:

### storefronts.csv
| Field | Description |
|-------|-------------|
| storefront_id | Unique ID from URL |
| storefront_url | Full URL |
| creator_name | Display name |
| bio | Profile description |
| is_top_creator | Has "Top Creator" badge |
| follower_count | If visible |
| total_lists | Number of lists |
| discovery_source | google/founditonamazon/amazonlive |

### lists.csv
| Field | Description |
|-------|-------------|
| list_id | Unique list ID |
| storefront_id | Parent storefront |
| list_name | List title |
| likes_count | Engagement metric |
| products_count | Products in list |

### products.csv
| Field | Description |
|-------|-------------|
| asin | Amazon ASIN (10 chars) |
| list_id | Parent list |
| storefront_id | Parent storefront |
| product_title | Full title |
| price | Price with currency |
| image_url | Product image |

## Project Structure

```
amazon-storefronts/
├── src/
│   ├── discovery/           # URL discovery modules
│   │   ├── google-discovery.js
│   │   ├── founditonamazon.js
│   │   ├── amazon-live.js
│   │   ├── deduplicator.js
│   │   └── index.js
│   ├── scrapers/            # Data extraction
│   │   ├── storefront-scraper.js
│   │   ├── list-scraper.js
│   │   └── product-extractor.js
│   ├── utils/               # Shared utilities
│   │   ├── browser-manager.js
│   │   ├── rate-limiter.js
│   │   ├── checkpoint.js
│   │   └── csv-handler.js
│   └── index.js             # Main orchestration
├── data/
│   ├── input/               # Discovered URLs
│   └── output/              # Scraped data
└── package.json
```

## Discovery Sources

### Google Site Search
- Searches `site:amazon.com/shop/`
- High volume, mixed quality
- May encounter CAPTCHAs

### #FoundItOnAmazon
- Amazon's curated creator feed
- Verified influencers
- Fashion, beauty, lifestyle focus

### Amazon Live
- Live streaming creators
- Active, engaged audience
- Direct storefront links

## Anti-Detection

The scraper includes several measures to avoid blocking:

- **Rate Limiting**: 3-5s between pages, 5-10s between storefronts
- **User Agent**: Chrome 120 on Windows 10
- **Viewport**: 1920x1080
- **Stealth Mode**: Webdriver detection bypass
- **Exponential Backoff**: On rate limiting (429)

## Resume & Checkpointing

Progress is saved every 25 storefronts to `data/input/checkpoint.json`. To resume:

```bash
npm run scrape:resume
```

## Tips

1. **Start Small**: Test with `--limit=10` first
2. **Monitor Progress**: Watch for CAPTCHA/blocking messages
3. **Use Proxies**: For large-scale scraping, consider proxy rotation
4. **Off-Peak Hours**: Run during off-peak times for better success rates

## Troubleshooting

### CAPTCHA Detected
- Stop and wait 30+ minutes
- Consider using a proxy
- Reduce rate (modify rate-limiter.js)

### 404 Errors
- Storefront may have been removed
- Check URL format

### Timeout Errors
- Increase timeout in browser-manager.js
- Check network connection

## License

ISC

<!-- test deploy -->

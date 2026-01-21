# Amazon Storefronts Manager - Project Documentation

## Overview

This project consists of two main parts:
1. **Scraper** - Discovers and scrapes Amazon Creator Storefronts (see README.md)
2. **UI Dashboard** - Web interface to browse storefronts, lists, products, and create campaigns

The dashboard is deployed on **Vercel** with data stored in **Supabase**.

---

## Live URLs

- **Production**: https://amazon-storefronts.vercel.app
- **Supabase Dashboard**: https://supabase.com/dashboard/project/vtvhxdgmwotztfqbbsgk

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Scraper       │     │   Supabase      │     │   Vercel        │
│   (Node.js)     │────▶│   (PostgreSQL)  │◀────│   (Static UI)   │
│                 │     │                 │     │                 │
│ - Discovery     │     │ - storefronts   │     │ - index.html    │
│ - Data Extract  │     │ - lists         │     │ - config.js     │
│ - CSV Output    │     │ - products      │     │ - JSON fallback │
└─────────────────┘     │ - stats         │     └─────────────────┘
                        └─────────────────┘
```

---

## Database Schema (Supabase)

### Tables

**storefronts**
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique storefront ID (username) |
| url | TEXT | Full Amazon storefront URL |
| username | TEXT | Creator username |
| name | TEXT | Display name |
| bio | TEXT | Profile description |
| image | TEXT | Profile image URL |
| is_top | BOOLEAN | Has "Top Creator" badge |
| likes | INTEGER | Profile likes |
| lists | INTEGER | Number of lists |
| total_list_likes | INTEGER | Sum of all list likes |
| marketplace | TEXT | US, UK, etc. |

**lists**
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique list ID |
| storefront_id | TEXT (FK) | Parent storefront |
| name | TEXT | List title |
| url | TEXT | Full list URL |
| likes | INTEGER | List engagement |
| products | INTEGER | Products count |

**products**
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL (PK) | Auto-increment ID |
| asin | TEXT | Amazon ASIN |
| title | TEXT | Product title |
| url | TEXT | Product URL |
| price | DECIMAL | Price |
| currency | TEXT | USD, GBP, etc. |
| image | TEXT | Product image URL |
| list_id | TEXT (FK) | Parent list |
| storefront_id | TEXT (FK) | Parent storefront |
| position | INTEGER | Position in list |

**stats**
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Always 1 |
| total_storefronts | INTEGER | Count |
| top_creators | INTEGER | Count with is_top=true |
| total_lists | INTEGER | Count |
| total_likes | INTEGER | Sum of all likes |
| total_products | INTEGER | Count |
| last_updated | TIMESTAMP | Last data update |

### Row Level Security

RLS is **disabled** on all tables for public read access:
```sql
ALTER TABLE storefronts DISABLE ROW LEVEL SECURITY;
ALTER TABLE lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE stats DISABLE ROW LEVEL SECURITY;
```

---

## Current Data (as of Jan 2026)

- **207** storefronts
- **7,118** lists
- **1,038** products
- **605K+** total likes

---

## UI Features

### Tabs

1. **Storefronts** - Browse all creators with search, filters, sorting
2. **Lists** - View all product lists with engagement metrics
3. **Products** - Browse individual products with ASIN lookup
4. **Campaigns** - Create Facebook ad campaigns from lists

### Campaigns Workflow

4-step process to create Facebook ad campaigns:
1. **List Overview** - Select list, generate titles/descriptions
2. **Campaign Setup** - Budget, targeting, scheduling
3. **Creatives** - AI image generation, ad copy (5 titles, 5 descriptions, 5 post texts)
4. **Review & Upload** - Final review and export

---

## File Structure

```
amazon-storefronts/
├── ui/
│   ├── index.html          # Main dashboard
│   ├── config.js           # Supabase credentials
│   └── data/
│       ├── storefronts.json   # JSON fallback
│       ├── lists.json         # JSON fallback
│       └── products.json      # JSON fallback
├── scripts/
│   └── upload-to-supabase.js  # Data migration script
├── data/
│   └── output/             # Scraper CSV output
├── src/                    # Scraper source code
├── .env                    # Supabase credentials (local)
├── .env.example            # Credential template
├── vercel.json             # Vercel routing config
├── supabase-schema.sql     # Database schema
├── package.json
├── README.md               # Scraper documentation
└── CLAUDE.md               # This file
```

---

## Configuration

### Environment Variables (.env)

```
SUPABASE_URL=https://vtvhxdgmwotztfqbbsgk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Vercel Config (vercel.json)

```json
{
  "public": true,
  "rewrites": [
    { "source": "/", "destination": "/ui/index.html" },
    { "source": "/import", "destination": "/ui/import.html" }
  ]
}
```

---

## How to Update Data

### After running a new scrape:

```bash
# 1. Run scraper (creates CSV files in data/output/)
npm run scrape

# 2. Convert CSV to JSON (optional, for fallback)
npm run convert

# 3. Upload to Supabase
node scripts/upload-to-supabase.js

# 4. Deploy changes (if any code changes)
vercel --prod
```

### Upload Script Features

- Deduplicates records before upload
- Handles foreign key constraints (orphaned lists skipped)
- Uploads in batches (100 for storefronts/lists, 50 for products)
- Updates stats table automatically

---

## How to Deploy

### Initial Setup

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel --prod`

### Subsequent Deployments

```bash
# Make changes, then:
git add -A
git commit -m "Description of changes"
vercel --prod

# Update alias (if needed)
vercel alias [deployment-url] amazon-storefronts.vercel.app
```

---

## Troubleshooting

### "Loading storefronts..." stuck

1. Check browser console (F12) for errors
2. Verify Supabase RLS is disabled
3. Check config.js has correct credentials
4. Test Supabase API directly:
   ```bash
   curl "https://vtvhxdgmwotztfqbbsgk.supabase.co/rest/v1/storefronts?limit=3" \
     -H "apikey: YOUR_ANON_KEY"
   ```

### Variable conflict errors

The Supabase CDN creates `window.supabase`. Internal code uses `supabaseClient` to avoid conflicts.

### Data not showing after upload

- Check upload script output for errors
- Verify foreign key constraints (lists need valid storefront_id)
- Check Supabase table editor for data

---

## Supabase Credentials

**Project**: vtvhxdgmwotztfqbbsgk

**URL**: https://vtvhxdgmwotztfqbbsgk.supabase.co

**Anon Key** (safe for client-side):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dmh4ZGdtd290enRmcWJic2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NzkxMjksImV4cCI6MjA4NDU1NTEyOX0.1oDDr6DS0bhDzQt0_52IbpOkfRA_WIQQ7ClgpnsUALA
```

---

## Next Steps / Future Improvements

- [ ] Add authentication for admin features
- [ ] Implement actual Facebook Ads API integration
- [ ] Add real AI image generation (currently mock)
- [ ] Create import.html for CSV upload via UI
- [ ] Add marketplace filtering (US, UK, DE, etc.)
- [ ] Implement product detail pages
- [ ] Add export to CSV/Excel functionality

---

## Contact

For questions about this project, refer to the Claude conversation history or contact the team.

---

*Last Updated: January 2026*

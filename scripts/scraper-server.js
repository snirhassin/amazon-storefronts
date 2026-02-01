/**
 * Scraper Control Server
 * Provides API for UI to control and monitor scraping
 *
 * Usage: node scripts/scraper-server.js
 * API:
 *   GET  /status     - Get current scraping status
 *   POST /start      - Start scraping { searches: 50, query: "site:amazon.com/shop/" }
 *   POST /stop       - Stop scraping
 */

require('dotenv').config();
const http = require('http');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');

const PORT = process.env.SCRAPER_PORT || 3001;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

/**
 * Scrape products from a single list
 */
async function scrapeListProducts(listId) {
  // Get list from database
  const { data: list, error } = await supabase
    .from('lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (error || !list) {
    return { error: 'List not found' };
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });

  const page = await context.newPage();

  try {
    await page.goto(list.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Scroll to load more
    await page.evaluate(async () => {
      for (let i = 0; i < 5; i++) {
        window.scrollBy(0, 1000);
        await new Promise(r => setTimeout(r, 500));
      }
    });
    await page.waitForTimeout(1000);

    // Extract products
    const products = await page.evaluate(() => {
      const items = [];
      const productLinks = document.querySelectorAll('a[href*="/dp/"]');
      const seenAsins = new Set();

      productLinks.forEach(link => {
        const asinMatch = link.href.match(/\/dp\/([A-Z0-9]{10})/);
        if (!asinMatch) return;

        const asin = asinMatch[1];
        if (seenAsins.has(asin)) return;
        seenAsins.add(asin);

        let title = link.title || link.getAttribute('aria-label') || '';
        if (!title) {
          let parent = link.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const h2 = parent.querySelector('h2');
            const h3 = parent.querySelector('h3');
            if (h2?.textContent?.trim()) { title = h2.textContent.trim(); break; }
            if (h3?.textContent?.trim()) { title = h3.textContent.trim(); break; }
            parent = parent.parentElement;
          }
        }

        let image = '';
        const img = link.querySelector('img') || link.parentElement?.querySelector('img');
        if (img?.src && !img.src.includes('pixel')) image = img.src;

        items.push({ asin, title: title || '', url: `https://www.amazon.com/dp/${asin}`, image });
      });

      return items;
    });

    await browser.close();

    if (products.length === 0) {
      return { error: 'No products found', listName: list.name };
    }

    // Delete old products and insert new
    await supabase.from('products').delete().eq('list_id', listId);

    const toInsert = products.map((p, i) => ({
      asin: p.asin,
      title: p.title,
      url: p.url,
      image: p.image,
      list_id: listId,
      storefront_id: list.storefront_id,
      position: i + 1,
    }));

    await supabase.from('products').insert(toInsert);

    // Update list
    await supabase
      .from('lists')
      .update({ products: products.length, last_scraped: new Date().toISOString() })
      .eq('id', listId);

    return { success: true, listName: list.name, productsScraped: products.length };

  } catch (err) {
    await browser.close();
    return { error: err.message };
  }
}

let currentProcess = null;
let logs = [];
const MAX_LOGS = 100;

/**
 * Update status in Supabase
 */
async function updateStatus(data) {
  await supabase.from('scraping_status').upsert({ id: 1, ...data, last_update: new Date().toISOString() });
}

/**
 * Add log entry
 */
function addLog(message, type = 'info') {
  const entry = { time: new Date().toISOString(), message, type };
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.pop();
  return entry;
}

/**
 * Parse scraper output and update status
 */
function parseOutput(line) {
  // Match progress line: [15/402] username (86% success, 464s)...
  const progressMatch = line.match(/\[(\d+)\/(\d+)\]\s+(\S+)\s+\((\d+)%\s+success,\s+(\d+)s\)/);
  if (progressMatch) {
    const [, current, total, storefront, successRate, elapsed] = progressMatch;
    const remaining = parseInt(total) - parseInt(current);
    const avgTime = parseInt(elapsed) / parseInt(current);
    const eta = Math.floor(avgTime * remaining);

    return {
      processed: parseInt(current),
      total_storefronts: parseInt(total),
      current_storefront: storefront,
      eta_seconds: eta,
    };
  }

  // Match success line
  if (line.includes('✅')) {
    const listsMatch = line.match(/\((\d+)\s+lists\)/);
    return { lists_scraped_delta: listsMatch ? parseInt(listsMatch[1]) : 0 };
  }

  // Match summary line
  const summaryMatch = line.match(/Success:\s+(\d+).*Failed:\s+(\d+)/);
  if (summaryMatch) {
    return { success: parseInt(summaryMatch[1]), failed: parseInt(summaryMatch[2]) };
  }

  return null;
}

/**
 * Start discovery + scraping
 */
async function startScraping(searches = 50, query = 'site:amazon.com/shop/') {
  if (currentProcess) {
    return { error: 'Scraping already in progress' };
  }

  logs = [];
  addLog(`Starting discovery with ${searches} searches...`, 'info');

  await updateStatus({
    is_active: true,
    started_at: new Date().toISOString(),
    total_storefronts: 0,
    processed: 0,
    success: 0,
    failed: 0,
    lists_scraped: 0,
    current_storefront: 'Discovering...',
    eta_seconds: null,
    logs: JSON.stringify(logs),
  });

  // Run discovery first
  const discoveryProcess = spawn('node', ['scripts/discover-storefronts.js'], {
    cwd: process.cwd(),
    env: { ...process.env, SEARCHES_PER_RUN: searches.toString() },
  });

  discoveryProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      addLog(line, 'discovery');

      // Check for new storefronts count
      const newMatch = line.match(/New storefronts.*:\s*(\d+)/);
      if (newMatch) {
        updateStatus({ total_storefronts: parseInt(newMatch[1]), logs: JSON.stringify(logs) });
      }
    });
  });

  discoveryProcess.stderr.on('data', (data) => {
    addLog(data.toString(), 'error');
  });

  discoveryProcess.on('close', async (code) => {
    if (code !== 0) {
      addLog('Discovery failed', 'error');
      await updateStatus({ is_active: false, logs: JSON.stringify(logs) });
      currentProcess = null;
      return;
    }

    addLog('Discovery complete. Starting scraper...', 'info');

    // Start scraping
    currentProcess = spawn('node', ['scripts/process-queue-playwright.js', '--all'], {
      cwd: process.cwd(),
    });

    let totalLists = 0;

    currentProcess.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());

      for (const line of lines) {
        addLog(line, line.includes('❌') ? 'error' : 'info');

        const parsed = parseOutput(line);
        if (parsed) {
          if (parsed.lists_scraped_delta) {
            totalLists += parsed.lists_scraped_delta;
            await updateStatus({ lists_scraped: totalLists, logs: JSON.stringify(logs) });
          } else {
            await updateStatus({ ...parsed, logs: JSON.stringify(logs) });
          }
        }
      }
    });

    currentProcess.stderr.on('data', (data) => {
      addLog(data.toString(), 'error');
    });

    currentProcess.on('close', async (code) => {
      addLog(`Scraping ${code === 0 ? 'complete' : 'stopped'}`, code === 0 ? 'success' : 'error');
      await updateStatus({ is_active: false, logs: JSON.stringify(logs) });
      currentProcess = null;
    });
  });

  return { success: true, message: 'Scraping started' };
}

/**
 * Stop scraping
 */
async function stopScraping() {
  if (currentProcess) {
    currentProcess.kill('SIGTERM');
    currentProcess = null;
    addLog('Scraping stopped by user', 'warning');
    await updateStatus({ is_active: false, logs: JSON.stringify(logs) });
    return { success: true, message: 'Scraping stopped' };
  }
  return { error: 'No scraping in progress' };
}

/**
 * Get current status
 */
async function getStatus() {
  const { data } = await supabase.from('scraping_status').select('*').eq('id', 1).single();
  return data || { is_active: false };
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/status') {
      const status = await getStatus();
      res.writeHead(200);
      res.end(JSON.stringify(status));
    }
    else if (req.method === 'POST' && url.pathname === '/start') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const params = body ? JSON.parse(body) : {};
        const result = await startScraping(params.searches || 50, params.query);
        res.writeHead(result.error ? 400 : 200);
        res.end(JSON.stringify(result));
      });
    }
    else if (req.method === 'POST' && url.pathname === '/stop') {
      const result = await stopScraping();
      res.writeHead(result.error ? 400 : 200);
      res.end(JSON.stringify(result));
    }
    else if (req.method === 'POST' && url.pathname === '/scrape-list') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        const params = body ? JSON.parse(body) : {};
        if (!params.listId) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'listId required' }));
          return;
        }
        const result = await scrapeListProducts(params.listId);
        res.writeHead(result.error ? 400 : 200);
        res.end(JSON.stringify(result));
      });
    }
    else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Scraper Control Server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  console.log(`  GET  http://localhost:${PORT}/status       - Get scraping status`);
  console.log(`  POST http://localhost:${PORT}/start        - Start scraping`);
  console.log(`  POST http://localhost:${PORT}/stop         - Stop scraping`);
  console.log(`  POST http://localhost:${PORT}/scrape-list  - Scrape single list { listId }`);
});

/**
 * Amazon List Creator - Local API Server
 *
 * Runs a local HTTP server that the UI can call to create lists on Amazon.
 * The browser stays open and logged in, ready to receive commands.
 *
 * Usage:
 *   node scripts/list-creator-server.js
 *
 * API Endpoints:
 *   GET  /status          - Check if logged in and ready
 *   POST /create-list     - Create a new list { name, description, asins }
 *   POST /add-products    - Add products to existing list { listUrl, asins }
 *   GET  /screenshot      - Take a screenshot of current page
 *   POST /quit            - Close the browser
 */

const http = require('http');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const url = require('url');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    port: 3847,
    storefrontId: process.env.AMAZON_STOREFRONT_ID || 'influencer-03f5875c',
    stateDir: path.join(__dirname, '..', 'browser-state'),
    screenshotsDir: path.join(__dirname, '..', 'browser-state', 'screenshots'),
};

// ============================================
// GLOBAL STATE
// ============================================
let browser = null;
let context = null;
let page = null;
let isReady = false;
let isLoggedIn = false;
let currentStatus = 'initializing';

// ============================================
// BROWSER FUNCTIONS
// ============================================

async function initBrowser() {
    console.log('🚀 Initializing browser...');

    // Create directories
    if (!fs.existsSync(CONFIG.stateDir)) {
        fs.mkdirSync(CONFIG.stateDir, { recursive: true });
    }
    if (!fs.existsSync(CONFIG.screenshotsDir)) {
        fs.mkdirSync(CONFIG.screenshotsDir, { recursive: true });
    }

    const stateFile = path.join(CONFIG.stateDir, 'amazon-state.json');
    const hasState = fs.existsSync(stateFile);

    browser = await chromium.launch({
        headless: false,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    });

    context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        storageState: hasState ? stateFile : undefined,
    });

    page = await context.newPage();

    // Check login status
    await checkLogin();

    if (!isLoggedIn) {
        currentStatus = 'awaiting_login';
        console.log('\n⚠️  Not logged in. Please log in manually in the browser window.');
        console.log('   The server will detect when login is complete.\n');

        // Navigate to login page
        await page.goto('https://www.amazon.com/ap/signin?openid.return_to=https%3A%2F%2Fwww.amazon.com%2F');

        // Start login detection loop
        detectLogin();
    } else {
        isReady = true;
        currentStatus = 'ready';
    }

    return { browser, context, page };
}

async function checkLogin() {
    try {
        await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const signInText = await page.textContent('#nav-link-accountList');
        isLoggedIn = signInText && !signInText.includes('Sign in');

        if (isLoggedIn) {
            const accountName = signInText.replace('Hello,', '').trim().split('\n')[0];
            console.log(`✅ Logged in as: ${accountName}`);
        }
    } catch (e) {
        isLoggedIn = false;
    }

    return isLoggedIn;
}

async function detectLogin() {
    const stateFile = path.join(CONFIG.stateDir, 'amazon-state.json');

    const checkInterval = setInterval(async () => {
        try {
            const signInText = await page.textContent('#nav-link-accountList').catch(() => null);
            if (signInText && !signInText.includes('Sign in')) {
                clearInterval(checkInterval);
                isLoggedIn = true;
                isReady = true;
                currentStatus = 'ready';

                // Save state
                await context.storageState({ path: stateFile });
                console.log('✅ Login detected! State saved. Server is ready.');
            }
        } catch (e) {
            // Page might be navigating, ignore
        }
    }, 3000);
}

async function saveState() {
    const stateFile = path.join(CONFIG.stateDir, 'amazon-state.json');
    await context.storageState({ path: stateFile });
}

// ============================================
// AMAZON AUTOMATION FUNCTIONS
// ============================================

async function createList(name, description, asins) {
    if (!isReady || !isLoggedIn) {
        throw new Error('Browser not ready or not logged in');
    }

    currentStatus = 'creating_list';
    console.log(`\n📋 Creating list: "${name}" with ${asins.length} products`);

    try {
        // Navigate to create list page
        const createUrl = `https://www.amazon.com/shop/${CONFIG.storefrontId}/list/create`;
        await page.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Screenshot for debugging
        const timestamp = Date.now();
        await page.screenshot({ path: path.join(CONFIG.screenshotsDir, `create-${timestamp}.png`) });

        // Try to find and fill the name input
        const nameInput = await page.$('input[name="listName"], input[placeholder*="name"], #list-name-input');
        if (nameInput) {
            await nameInput.fill(name);
            console.log('   ✓ Entered list name');
        } else {
            console.log('   ⚠️ Could not find name input');
        }

        // Try to find and fill description
        const descInput = await page.$('textarea[name="description"], textarea[placeholder*="description"]');
        if (descInput && description) {
            await descInput.fill(description);
            console.log('   ✓ Entered description');
        }

        // Add products
        let addedCount = 0;
        for (const asin of asins) {
            const added = await addProductToList(asin);
            if (added) addedCount++;
            await page.waitForTimeout(1500);
        }

        // Final screenshot
        await page.screenshot({ path: path.join(CONFIG.screenshotsDir, `created-${timestamp}.png`), fullPage: true });

        currentStatus = 'ready';
        return {
            success: true,
            name,
            productsAdded: addedCount,
            totalProducts: asins.length,
            screenshot: `created-${timestamp}.png`
        };

    } catch (error) {
        currentStatus = 'ready';
        throw error;
    }
}

async function addProductToList(asin) {
    console.log(`   Adding product: ${asin}`);

    try {
        // Look for search input
        const searchInput = await page.$('input[placeholder*="search"], input[placeholder*="ASIN"], input[type="search"]');

        if (searchInput) {
            await searchInput.fill('');
            await searchInput.fill(asin);
            await page.waitForTimeout(500);
            await searchInput.press('Enter');
            await page.waitForTimeout(2000);

            // Click Add button
            const addBtn = await page.$('button:has-text("Add")');
            if (addBtn) {
                await addBtn.click();
                await page.waitForTimeout(1000);
                console.log(`      ✓ Added ${asin}`);
                return true;
            }
        }

        console.log(`      ⚠️ Could not add ${asin}`);
        return false;
    } catch (e) {
        console.log(`      ❌ Error adding ${asin}: ${e.message}`);
        return false;
    }
}

async function takeScreenshot(filename) {
    const filepath = path.join(CONFIG.screenshotsDir, filename || `screenshot-${Date.now()}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
}

// ============================================
// HTTP SERVER
// ============================================

function sendJson(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
    });
}

async function handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    try {
        // GET /status
        if (pathname === '/status' && req.method === 'GET') {
            sendJson(res, {
                status: currentStatus,
                isReady,
                isLoggedIn,
                storefrontId: CONFIG.storefrontId,
            });
            return;
        }

        // POST /create-list
        if (pathname === '/create-list' && req.method === 'POST') {
            const body = await parseBody(req);

            if (!body.name || !body.asins || !Array.isArray(body.asins)) {
                sendJson(res, { error: 'Missing required fields: name, asins (array)' }, 400);
                return;
            }

            const result = await createList(body.name, body.description || '', body.asins);
            sendJson(res, result);
            return;
        }

        // GET /screenshot
        if (pathname === '/screenshot' && req.method === 'GET') {
            const filepath = await takeScreenshot();
            sendJson(res, { success: true, path: filepath });
            return;
        }

        // POST /navigate
        if (pathname === '/navigate' && req.method === 'POST') {
            const body = await parseBody(req);
            await page.goto(body.url, { waitUntil: 'domcontentloaded' });
            sendJson(res, { success: true, url: body.url });
            return;
        }

        // POST /quit
        if (pathname === '/quit' && req.method === 'POST') {
            sendJson(res, { success: true, message: 'Shutting down...' });
            setTimeout(async () => {
                await saveState();
                await browser.close();
                process.exit(0);
            }, 1000);
            return;
        }

        // 404
        sendJson(res, { error: 'Not found' }, 404);

    } catch (error) {
        console.error('Request error:', error);
        sendJson(res, { error: error.message }, 500);
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('='.repeat(60));
    console.log('AMAZON LIST CREATOR - LOCAL API SERVER');
    console.log('='.repeat(60) + '\n');

    // Initialize browser
    await initBrowser();

    // Start HTTP server
    const server = http.createServer(handleRequest);
    server.listen(CONFIG.port, () => {
        console.log(`\n🌐 API Server running at http://localhost:${CONFIG.port}`);
        console.log('\nEndpoints:');
        console.log(`   GET  /status       - Check server status`);
        console.log(`   POST /create-list  - Create a list { name, description, asins }`);
        console.log(`   GET  /screenshot   - Take screenshot`);
        console.log(`   POST /quit         - Shutdown server`);
        console.log('\n' + '='.repeat(60) + '\n');
    });

    // Handle shutdown
    process.on('SIGINT', async () => {
        console.log('\n\nShutting down...');
        await saveState();
        await browser.close();
        process.exit(0);
    });
}

main().catch(console.error);

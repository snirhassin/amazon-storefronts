/**
 * Amazon List Creator - Connect to Existing Chrome via CDP
 *
 * Requires Chrome to be running with: --remote-debugging-port=9222
 */

const { chromium } = require('playwright');
const http = require('http');

const CONFIG = {
    port: 3847,
    storefrontId: 'influencer-03f5875c',
    cdpEndpoint: 'http://localhost:9222',
};

let browser = null;
let page = null;
let isReady = false;

async function connectToChrome() {
    console.log('🔌 Connecting to Chrome via CDP...');
    console.log(`   Endpoint: ${CONFIG.cdpEndpoint}\n`);

    try {
        browser = await chromium.connectOverCDP(CONFIG.cdpEndpoint);
        console.log('✅ Connected to Chrome!');

        // Get existing pages or create new one
        const contexts = browser.contexts();
        if (contexts.length > 0) {
            const pages = contexts[0].pages();
            page = pages[0] || await contexts[0].newPage();
        } else {
            const context = await browser.newContext();
            page = await context.newPage();
        }

        console.log(`   Current URL: ${page.url()}`);

        // Check if logged into Amazon
        if (page.url().includes('amazon.com')) {
            const accountText = await page.textContent('#nav-link-accountList').catch(() => '');
            if (accountText && accountText.includes('Hello') && !accountText.toLowerCase().includes('sign in')) {
                console.log('✅ Already logged into Amazon!');
                isReady = true;
            } else {
                console.log('⚠️  Navigate to Amazon and log in.');
                isReady = true; // Allow operations anyway since user controls the browser
            }
        } else {
            console.log('⚠️  Not on Amazon. Navigate to Amazon in your browser.');
            isReady = true; // User controls the browser
        }

        return page;
    } catch (error) {
        console.error('❌ Failed to connect:', error.message);
        console.log('\nMake sure Chrome is running with:');
        console.log('  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222');
        process.exit(1);
    }
}

async function createList(name, description, asins) {
    if (!page) throw new Error('Not connected to browser');

    console.log(`\n📋 Creating list: "${name}" (${asins.length} products)`);

    // Navigate to create collection page
    const createUrl = `https://www.amazon.com/create/collection?affiliateId=${CONFIG.storefrontId}`;
    console.log(`   Navigating to: ${createUrl}`);

    await page.goto(createUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take screenshot
    const screenshotPath = 'browser-state/create-page.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot: ${screenshotPath}`);

    // Find and list form elements
    const elements = await page.$$eval('input, textarea, button, [contenteditable]', els =>
        els.map(e => ({
            tag: e.tagName,
            type: e.type || e.getAttribute('type'),
            placeholder: e.placeholder,
            text: e.textContent?.substring(0, 50),
            name: e.name,
            id: e.id,
            class: e.className?.substring(0, 50),
            contenteditable: e.getAttribute('contenteditable')
        })).filter(e => e.placeholder || e.name || e.id || e.text?.trim() || e.contenteditable)
    );

    console.log('\n📝 Form elements found:');
    elements.slice(0, 20).forEach((e, i) => {
        const info = e.placeholder || e.text?.trim() || e.name || e.id || e.class || 'unknown';
        console.log(`  ${i + 1}. [${e.tag}${e.type ? ':' + e.type : ''}] "${info.substring(0, 40)}"`);
    });

    return {
        success: true,
        message: 'Page loaded - check browser and screenshot',
        screenshot: screenshotPath,
        elements: elements.slice(0, 20)
    };
}

async function fillListForm(name, description) {
    if (!page) throw new Error('Not connected to browser');

    console.log(`\n✏️  Filling form: "${name}"`);

    // Try to find and fill the title field
    const titleSelectors = [
        'input[placeholder*="title" i]',
        'input[placeholder*="name" i]',
        'input[name*="title" i]',
        'input[name*="name" i]',
        '[data-testid*="title"] input',
        'input[type="text"]:first-of-type'
    ];

    for (const selector of titleSelectors) {
        try {
            const el = await page.$(selector);
            if (el) {
                await el.fill(name);
                console.log(`   ✅ Filled title using: ${selector}`);
                break;
            }
        } catch (e) {}
    }

    // Try to find and fill description
    const descSelectors = [
        'textarea[placeholder*="description" i]',
        'textarea[name*="description" i]',
        '[contenteditable="true"]',
        'textarea'
    ];

    for (const selector of descSelectors) {
        try {
            const el = await page.$(selector);
            if (el) {
                if (await el.getAttribute('contenteditable') === 'true') {
                    await el.click();
                    await page.keyboard.type(description);
                } else {
                    await el.fill(description);
                }
                console.log(`   ✅ Filled description using: ${selector}`);
                break;
            }
        } catch (e) {}
    }

    await page.screenshot({ path: 'browser-state/form-filled.png' });
    return { success: true, message: 'Form filled - check browser' };
}

async function addProduct(asin) {
    if (!page) throw new Error('Not connected to browser');

    console.log(`   Adding ASIN: ${asin}`);

    // Look for "Add product" or search input
    const addSelectors = [
        'input[placeholder*="search" i]',
        'input[placeholder*="ASIN" i]',
        'input[placeholder*="product" i]',
        'button:has-text("Add")',
        '[data-testid*="add"]'
    ];

    for (const selector of addSelectors) {
        try {
            const el = await page.$(selector);
            if (el) {
                const tagName = await el.evaluate(e => e.tagName);
                if (tagName === 'INPUT') {
                    await el.fill(asin);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(1500);
                    console.log(`     ✅ Searched for ${asin}`);
                    return { success: true };
                } else if (tagName === 'BUTTON') {
                    await el.click();
                    await page.waitForTimeout(1000);
                }
            }
        } catch (e) {}
    }

    return { success: false, message: 'Could not find add product input' };
}

// HTTP Server
function startServer() {
    const server = http.createServer(async (req, res) => {
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        try {
            if (req.url === '/status') {
                res.writeHead(200, headers);
                res.end(JSON.stringify({
                    isReady,
                    storefrontId: CONFIG.storefrontId,
                    currentUrl: page ? page.url() : null
                }));
                return;
            }

            if (req.url === '/screenshot') {
                await page.screenshot({ path: 'browser-state/current.png', fullPage: true });
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true, path: 'browser-state/current.png' }));
                return;
            }

            if (req.url === '/goto' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const { url } = JSON.parse(body);
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        res.writeHead(200, headers);
                        res.end(JSON.stringify({ success: true, url: page.url() }));
                    } catch (e) {
                        res.writeHead(500, headers);
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.url === '/create-list' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        const result = await createList(data.name, data.description, data.asins);
                        res.writeHead(200, headers);
                        res.end(JSON.stringify(result));
                    } catch (e) {
                        res.writeHead(500, headers);
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.url === '/fill-form' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const { name, description } = JSON.parse(body);
                        const result = await fillListForm(name, description);
                        res.writeHead(200, headers);
                        res.end(JSON.stringify(result));
                    } catch (e) {
                        res.writeHead(500, headers);
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            if (req.url === '/add-product' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const { asin } = JSON.parse(body);
                        const result = await addProduct(asin);
                        res.writeHead(200, headers);
                        res.end(JSON.stringify(result));
                    } catch (e) {
                        res.writeHead(500, headers);
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
                return;
            }

            res.writeHead(404, headers);
            res.end(JSON.stringify({ error: 'Not found' }));
        } catch (e) {
            res.writeHead(500, headers);
            res.end(JSON.stringify({ error: e.message }));
        }
    });

    server.listen(CONFIG.port, () => {
        console.log(`\n🌐 Server: http://localhost:${CONFIG.port}`);
        console.log('   GET  /status');
        console.log('   GET  /screenshot');
        console.log('   POST /goto { url }');
        console.log('   POST /create-list { name, description, asins }');
        console.log('   POST /fill-form { name, description }');
        console.log('   POST /add-product { asin }');
        console.log('\n✨ Ready! Control your browser via API.\n');
    });
}

async function main() {
    console.log('='.repeat(50));
    console.log('AMAZON LIST CREATOR - CDP MODE');
    console.log('='.repeat(50) + '\n');

    await connectToChrome();
    startServer();
}

main().catch(console.error);

/**
 * Amazon List Creator - Using Your Chrome Profile
 *
 * IMPORTANT: Close ALL Chrome windows before running!
 *
 * This uses your actual Chrome browser with your existing Amazon login.
 */

const { chromium } = require('playwright');
const path = require('path');
const http = require('http');

const CONFIG = {
    port: 3847,
    storefrontId: 'influencer-03f5875c',
    chromeProfilePath: 'C:\\Users\\Snir\\AppData\\Local\\Google\\Chrome\\User Data',
    chromeProfile: 'Default',
};

let browser = null;
let page = null;
let isReady = false;

async function launchChrome() {
    console.log('🚀 Launching with your Chrome profile...');
    console.log('⚠️  Make sure ALL Chrome windows are closed!\n');

    browser = await chromium.launchPersistentContext(
        path.join(CONFIG.chromeProfilePath, CONFIG.chromeProfile),
        {
            headless: false,
            channel: 'chrome',
            viewport: { width: 1920, height: 1080 },
            args: ['--start-maximized'],
        }
    );

    page = browser.pages()[0] || await browser.newPage();

    // Navigate to Amazon
    await page.goto('https://www.amazon.com');
    await page.waitForTimeout(2000);

    // Check login
    const accountText = await page.textContent('#nav-link-accountList').catch(() => '');
    if (accountText && accountText.includes('Hello') && !accountText.toLowerCase().includes('sign in')) {
        console.log('✅ Already logged in!');
        isReady = true;
    } else {
        console.log('⚠️  Please log in to Amazon in the browser window.');
        console.log('   The server will detect when you\'re logged in.\n');
        waitForLogin();
    }

    return page;
}

async function waitForLogin() {
    const check = setInterval(async () => {
        try {
            const text = await page.textContent('#nav-link-accountList').catch(() => '');
            if (text && text.includes('Hello') && !text.toLowerCase().includes('sign in')) {
                clearInterval(check);
                isReady = true;
                console.log('✅ Login detected! Server is ready.\n');
            }
        } catch (e) {}
    }, 3000);
}

async function createList(name, description, asins) {
    if (!isReady) throw new Error('Not logged in yet');

    console.log(`\n📋 Creating: "${name}" (${asins.length} products)`);

    // Go to storefront
    await page.goto(`https://www.amazon.com/shop/${CONFIG.storefrontId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Look for "Create" or "New List" button
    const createBtn = await page.$('a[href*="create"], button:has-text("Create"), button:has-text("New")');
    if (createBtn) {
        await createBtn.click();
        await page.waitForTimeout(2000);
    } else {
        // Try direct URL
        await page.goto(`https://www.amazon.com/shop/${CONFIG.storefrontId}/list/create`);
        await page.waitForTimeout(2000);
    }

    // Take screenshot
    await page.screenshot({ path: 'browser-state/create-page.png', fullPage: true });
    console.log('📸 Screenshot saved: browser-state/create-page.png');

    // List all form elements for debugging
    const elements = await page.$$eval('input, textarea, button', els =>
        els.map(e => ({
            tag: e.tagName,
            type: e.type,
            placeholder: e.placeholder,
            text: e.textContent?.substring(0, 30),
            name: e.name,
            id: e.id
        })).filter(e => e.placeholder || e.name || e.id || e.text)
    );
    console.log('\nForm elements found:');
    elements.slice(0, 15).forEach((e, i) => {
        console.log(`  ${i+1}. [${e.tag}] ${e.type || ''} "${e.placeholder || e.text || e.name || e.id}"`);
    });

    return {
        success: true,
        message: 'Page loaded - check screenshot and form elements above',
        screenshot: 'browser-state/create-page.png'
    };
}

// Simple HTTP server
function startServer() {
    const server = http.createServer(async (req, res) => {
        const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        if (req.url === '/status') {
            res.writeHead(200, headers);
            res.end(JSON.stringify({ isReady, storefrontId: CONFIG.storefrontId }));
            return;
        }

        if (req.url === '/screenshot') {
            await page.screenshot({ path: 'browser-state/current.png', fullPage: true });
            res.writeHead(200, headers);
            res.end(JSON.stringify({ success: true, path: 'browser-state/current.png' }));
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

        if (req.url === '/goto' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const { url } = JSON.parse(body);
                await page.goto(url);
                res.writeHead(200, headers);
                res.end(JSON.stringify({ success: true }));
            });
            return;
        }

        res.writeHead(404, headers);
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(CONFIG.port, () => {
        console.log(`\n🌐 Server: http://localhost:${CONFIG.port}`);
        console.log('   GET  /status');
        console.log('   GET  /screenshot');
        console.log('   POST /create-list { name, description, asins }');
        console.log('   POST /goto { url }');
        console.log('\n⚠️  DO NOT close this terminal - browser will stay open!\n');
    });
}

async function main() {
    console.log('='.repeat(50));
    console.log('AMAZON LIST CREATOR - CHROME PROFILE MODE');
    console.log('='.repeat(50) + '\n');

    await launchChrome();
    startServer();

    // Keep alive
    process.on('SIGINT', () => {
        console.log('\n\n⚠️  Keeping browser open. Press Ctrl+C again to force close.');
        process.once('SIGINT', async () => {
            console.log('Closing browser...');
            await browser.close();
            process.exit(0);
        });
    });
}

main().catch(console.error);

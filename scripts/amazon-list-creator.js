/**
 * Amazon Storefront List Creator
 *
 * Creates Idea Lists on your Amazon storefront by automating the browser.
 * Supports two modes:
 * 1. Use existing Chrome profile (pre-logged into Amazon)
 * 2. Persistent context (saves login state after first use)
 *
 * Usage:
 *   node scripts/amazon-list-creator.js --mode=profile     # Use existing Chrome
 *   node scripts/amazon-list-creator.js --mode=persistent  # Use saved state
 *   node scripts/amazon-list-creator.js --login            # Initial login only
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ============================================
// CONFIGURATION - Update these values
// ============================================
const CONFIG = {
    // Your Amazon Associates storefront ID
    storefrontId: 'influencer-03f5875c',

    // Chrome profile path (for --mode=profile)
    // Windows: Usually C:\Users\<username>\AppData\Local\Google\Chrome\User Data
    // Mac: ~/Library/Application Support/Google/Chrome
    chromeProfilePath: process.env.CHROME_PROFILE_PATH ||
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),

    // Which Chrome profile to use (Default, Profile 1, etc.)
    chromeProfile: 'Default',

    // Persistent state directory (for --mode=persistent)
    stateDir: path.join(__dirname, '..', 'browser-state'),

    // Timeouts
    navigationTimeout: 60000,
    actionTimeout: 30000,
};

// ============================================
// BROWSER SETUP FUNCTIONS
// ============================================

/**
 * Launch browser using existing Chrome profile
 * This uses your already-logged-in Chrome session
 */
async function launchWithChromeProfile() {
    console.log('🚀 Launching with existing Chrome profile...');
    console.log(`   Profile path: ${CONFIG.chromeProfilePath}`);
    console.log(`   Profile name: ${CONFIG.chromeProfile}`);

    // Check if Chrome is running - it needs to be closed
    console.log('\n⚠️  IMPORTANT: Close all Chrome windows before continuing!');
    console.log('   Playwright cannot use Chrome profile while Chrome is running.\n');

    const browser = await chromium.launchPersistentContext(
        path.join(CONFIG.chromeProfilePath, CONFIG.chromeProfile),
        {
            headless: false,
            channel: 'chrome', // Use installed Chrome
            viewport: { width: 1920, height: 1080 },
            args: [
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
            ],
        }
    );

    return { browser, page: browser.pages()[0] || await browser.newPage() };
}

/**
 * Launch browser with persistent state (saves cookies/localStorage)
 * First run requires manual login, subsequent runs use saved state
 */
async function launchWithPersistentState() {
    console.log('🚀 Launching with persistent state...');

    // Create state directory if it doesn't exist
    if (!fs.existsSync(CONFIG.stateDir)) {
        fs.mkdirSync(CONFIG.stateDir, { recursive: true });
    }

    const stateFile = path.join(CONFIG.stateDir, 'amazon-state.json');
    const hasState = fs.existsSync(stateFile);

    if (hasState) {
        console.log('   Found saved state, restoring login session...');
    } else {
        console.log('   No saved state found, will need manual login...');
    }

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        storageState: hasState ? stateFile : undefined,
    });

    const page = await context.newPage();

    return { browser, context, page, stateFile };
}

/**
 * Save browser state for future sessions
 */
async function saveState(context, stateFile) {
    console.log('💾 Saving browser state...');
    await context.storageState({ path: stateFile });
    console.log(`   State saved to: ${stateFile}`);
}

// ============================================
// AMAZON AUTOMATION FUNCTIONS
// ============================================

/**
 * Check if user is logged into Amazon
 */
async function checkLoginStatus(page) {
    try {
        await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const signInText = await page.textContent('#nav-link-accountList');
        const isLoggedIn = signInText && !signInText.includes('Sign in');

        if (isLoggedIn) {
            const accountName = signInText.replace('Hello,', '').trim().split('\n')[0];
            console.log(`✅ Logged in as: ${accountName}`);
        }

        return isLoggedIn;
    } catch (e) {
        return false;
    }
}

/**
 * Wait for user to complete manual login
 */
async function waitForManualLogin(page, timeout = 300000) {
    console.log('\n' + '='.repeat(60));
    console.log('👤 MANUAL LOGIN REQUIRED');
    console.log('='.repeat(60));
    console.log('1. Log into your Amazon Associates account in the browser');
    console.log('2. Complete any 2FA if prompted');
    console.log('3. The script will continue automatically once logged in');
    console.log('='.repeat(60) + '\n');

    await page.goto('https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.amazon.com%2F&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.assoc_handle=usflex&openid.mode=checkid_setup&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0');

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const isLoggedIn = await checkLoginStatus(page);
        if (isLoggedIn) {
            console.log('✅ Login detected!\n');
            return true;
        }
        await page.waitForTimeout(3000);
    }

    throw new Error('Login timeout - please try again');
}

/**
 * Navigate to storefront management
 */
async function goToStorefront(page) {
    const url = `https://www.amazon.com/shop/${CONFIG.storefrontId}`;
    console.log(`📍 Navigating to storefront: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
    await page.waitForTimeout(2000);
}

/**
 * Navigate to Create Idea List page
 */
async function goToCreateList(page) {
    const url = `https://www.amazon.com/shop/${CONFIG.storefrontId}/list/create`;
    console.log(`📝 Going to Create List page...`);

    // Try direct URL first
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeout });
    await page.waitForTimeout(3000);

    // Take screenshot for debugging
    await page.screenshot({ path: path.join(CONFIG.stateDir, 'create-list-page.png') });
    console.log('   Screenshot saved: create-list-page.png');

    return page;
}

/**
 * Create a new Idea List with given title and products
 */
async function createIdeaList(page, listName, listDescription, productAsins) {
    console.log(`\n📋 Creating Idea List: "${listName}"`);
    console.log(`   Products to add: ${productAsins.length}`);

    // Navigate to create page
    await goToCreateList(page);

    // Wait for form elements
    await page.waitForTimeout(2000);

    // Try to find the list name input
    const nameSelectors = [
        'input[name="listName"]',
        'input[placeholder*="name"]',
        'input[placeholder*="title"]',
        '#list-name-input',
        '[data-testid="list-name-input"]',
    ];

    let nameInput = null;
    for (const selector of nameSelectors) {
        nameInput = await page.$(selector);
        if (nameInput) {
            console.log(`   Found name input: ${selector}`);
            break;
        }
    }

    if (nameInput) {
        await nameInput.fill(listName);
        console.log('   ✓ Entered list name');
    } else {
        console.log('   ⚠️ Could not find name input - check screenshot');
        // List visible form elements for debugging
        await listFormElements(page);
    }

    // Try to find description input
    const descSelectors = [
        'textarea[name="description"]',
        'textarea[placeholder*="description"]',
        '#list-description-input',
        '[data-testid="list-description-input"]',
    ];

    for (const selector of descSelectors) {
        const descInput = await page.$(selector);
        if (descInput && listDescription) {
            await descInput.fill(listDescription);
            console.log('   ✓ Entered description');
            break;
        }
    }

    // Add products by ASIN
    console.log('\n➕ Adding products...');
    for (let i = 0; i < productAsins.length; i++) {
        const asin = productAsins[i];
        console.log(`   Adding ${i + 1}/${productAsins.length}: ${asin}`);

        await addProductByAsin(page, asin);
        await page.waitForTimeout(1500); // Wait between products
    }

    // Take final screenshot
    await page.screenshot({ path: path.join(CONFIG.stateDir, 'list-created.png'), fullPage: true });
    console.log('\n   Final screenshot saved: list-created.png');

    return { success: true, listName, productsAdded: productAsins.length };
}

/**
 * Add a product to the current list by ASIN
 */
async function addProductByAsin(page, asin) {
    // Look for product search/add input
    const searchSelectors = [
        'input[placeholder*="search"]',
        'input[placeholder*="ASIN"]',
        'input[placeholder*="product"]',
        'input[type="search"]',
        '#product-search',
        '[data-testid="product-search"]',
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
        searchInput = await page.$(selector);
        if (searchInput) break;
    }

    if (!searchInput) {
        // Try clicking an "Add Product" button first
        const addButtons = await page.$$('button');
        for (const btn of addButtons) {
            const text = await btn.textContent();
            if (text && (text.includes('Add') || text.includes('product'))) {
                await btn.click();
                await page.waitForTimeout(1000);
                break;
            }
        }

        // Try finding search input again
        for (const selector of searchSelectors) {
            searchInput = await page.$(selector);
            if (searchInput) break;
        }
    }

    if (searchInput) {
        await searchInput.fill(asin);
        await page.waitForTimeout(500);
        await searchInput.press('Enter');
        await page.waitForTimeout(2000);

        // Look for "Add" button in search results
        const addBtn = await page.$('button:has-text("Add"), button:has-text("+")');
        if (addBtn) {
            await addBtn.click();
            await page.waitForTimeout(1000);
            console.log(`      ✓ Added ${asin}`);
        }
    } else {
        console.log(`      ⚠️ Could not find search input for ${asin}`);
    }
}

/**
 * List all visible form elements (for debugging)
 */
async function listFormElements(page) {
    const elements = await page.$$eval('input, textarea, button, select', els =>
        els.filter(el => el.offsetParent !== null)
           .map(el => ({
               tag: el.tagName,
               type: el.type || '',
               placeholder: el.placeholder || '',
               text: el.textContent?.trim().substring(0, 30) || '',
               name: el.name || '',
               id: el.id || ''
           }))
           .slice(0, 20)
    );

    console.log('\n   Visible form elements:');
    elements.forEach((el, i) => {
        console.log(`   ${i + 1}. [${el.tag}] ${el.type} ${el.placeholder || el.text || el.name || el.id}`);
    });
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Login mode - just log in and save state
 */
async function runLoginMode() {
    console.log('\n' + '='.repeat(60));
    console.log('AMAZON LIST CREATOR - LOGIN MODE');
    console.log('='.repeat(60) + '\n');

    const { browser, context, page, stateFile } = await launchWithPersistentState();

    try {
        const isLoggedIn = await checkLoginStatus(page);

        if (!isLoggedIn) {
            await waitForManualLogin(page);
        }

        await saveState(context, stateFile);

        console.log('\n✅ Login complete! State saved.');
        console.log('   You can now run the script with --mode=persistent');
        console.log('\n   Keeping browser open for 30 seconds...');
        await page.waitForTimeout(30000);

    } finally {
        await browser.close();
    }
}

/**
 * Create list mode - create a list with products
 */
async function runCreateMode(mode, listData) {
    console.log('\n' + '='.repeat(60));
    console.log('AMAZON LIST CREATOR - CREATE MODE');
    console.log('='.repeat(60) + '\n');

    let browser, context, page, stateFile;

    if (mode === 'profile') {
        const result = await launchWithChromeProfile();
        browser = result.browser;
        page = result.page;
        context = result.browser; // persistent context is the browser
    } else {
        const result = await launchWithPersistentState();
        browser = result.browser;
        context = result.context;
        page = result.page;
        stateFile = result.stateFile;
    }

    try {
        // Check login
        const isLoggedIn = await checkLoginStatus(page);

        if (!isLoggedIn) {
            if (mode === 'persistent') {
                await waitForManualLogin(page);
                await saveState(context, stateFile);
            } else {
                throw new Error('Not logged in. Please log into Chrome first or use --login mode.');
            }
        }

        // Navigate to storefront
        await goToStorefront(page);

        // Create the list
        const result = await createIdeaList(
            page,
            listData.name,
            listData.description,
            listData.asins
        );

        console.log('\n' + '='.repeat(60));
        console.log('✅ LIST CREATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`   List: ${result.listName}`);
        console.log(`   Products added: ${result.productsAdded}`);
        console.log('='.repeat(60) + '\n');

        // Keep browser open for verification
        console.log('Browser will stay open for 60 seconds for verification...');
        await page.waitForTimeout(60000);

    } finally {
        await browser.close();
    }
}

/**
 * Interactive server mode - listens for commands
 */
async function runServerMode() {
    console.log('\n' + '='.repeat(60));
    console.log('AMAZON LIST CREATOR - SERVER MODE');
    console.log('='.repeat(60) + '\n');

    const { browser, context, page, stateFile } = await launchWithPersistentState();

    // Check/perform login
    let isLoggedIn = await checkLoginStatus(page);
    if (!isLoggedIn) {
        await waitForManualLogin(page);
        await saveState(context, stateFile);
    }

    // Navigate to storefront
    await goToStorefront(page);

    console.log('\n✅ Browser ready! Listening for commands...\n');
    console.log('Commands via file: scripts/list-command.json');
    console.log('Format: { "action": "create", "name": "List Name", "description": "...", "asins": ["B01...", "B02..."] }');

    const commandFile = path.join(__dirname, 'list-command.json');

    // Watch for command file
    while (true) {
        if (fs.existsSync(commandFile)) {
            try {
                const command = JSON.parse(fs.readFileSync(commandFile, 'utf8'));
                fs.unlinkSync(commandFile); // Delete after reading

                if (command.action === 'create') {
                    console.log(`\n📋 Received create command: ${command.name}`);
                    await createIdeaList(page, command.name, command.description || '', command.asins || []);
                } else if (command.action === 'quit') {
                    console.log('\n👋 Quit command received. Closing...');
                    break;
                }
            } catch (e) {
                console.error('Error processing command:', e.message);
            }
        }

        await page.waitForTimeout(2000);
    }

    await browser.close();
}

// ============================================
// CLI ENTRY POINT
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const mode = args.find(a => a.startsWith('--mode='))?.split('=')[1] || 'persistent';
    const isLogin = args.includes('--login');
    const isServer = args.includes('--server');

    // Example list data (would come from UI in production)
    const testListData = {
        name: 'My Favorite Tech Gadgets',
        description: 'A curated collection of must-have tech products for everyday use.',
        asins: [
            'B0BSHF7WHW', // Example ASIN 1
            'B0BN4GVGFZ', // Example ASIN 2
        ]
    };

    try {
        if (isLogin) {
            await runLoginMode();
        } else if (isServer) {
            await runServerMode();
        } else {
            await runCreateMode(mode, testListData);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();

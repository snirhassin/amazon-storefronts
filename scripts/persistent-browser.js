/**
 * Persistent browser session - stays open indefinitely
 * Saves login state to reuse across sessions
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const USER_DATA_DIR = path.join(__dirname, '..', 'browser-data');
const CURRENT_URL_FILE = path.join(__dirname, 'current-url.txt');
const COMMAND_FILE = path.join(__dirname, 'browser-command.txt');

async function main() {
    console.log('='.repeat(50));
    console.log('Persistent Browser Session');
    console.log('='.repeat(50));
    console.log('This browser will stay open until you close it.');
    console.log('Login state is saved for future sessions.\n');

    // Create user data directory if it doesn't exist
    if (!fs.existsSync(USER_DATA_DIR)) {
        fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    // Launch browser with persistent context (saves cookies/login)
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        viewport: { width: 1920, height: 1080 },
        args: ['--start-maximized']
    });

    const page = context.pages()[0] || await context.newPage();

    // Go to the storefront
    await page.goto('https://www.amazon.com/shop/influencer-03f5875c');
    console.log('Navigated to storefront.\n');

    // Monitor URL changes
    let lastUrl = '';
    const urlMonitor = setInterval(async () => {
        try {
            const currentUrl = page.url();
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] URL: ${currentUrl}`);
                fs.writeFileSync(CURRENT_URL_FILE, currentUrl);
            }
        } catch (e) {}
    }, 2000);

    // Check for commands from file
    const commandMonitor = setInterval(async () => {
        try {
            if (fs.existsSync(COMMAND_FILE)) {
                const command = fs.readFileSync(COMMAND_FILE, 'utf8').trim();
                fs.unlinkSync(COMMAND_FILE); // Delete after reading

                console.log(`\n📋 Command received: ${command}`);

                if (command.startsWith('goto:')) {
                    const url = command.replace('goto:', '');
                    await page.goto(url);
                    console.log(`   Navigated to: ${url}`);
                }
                else if (command.startsWith('click:')) {
                    const selector = command.replace('click:', '');
                    await page.click(selector);
                    console.log(`   Clicked: ${selector}`);
                }
                else if (command === 'screenshot') {
                    await page.screenshot({ path: 'current-state.png', fullPage: true });
                    console.log('   Screenshot saved: current-state.png');
                }
                else if (command === 'html') {
                    const html = await page.content();
                    fs.writeFileSync('page-content.html', html);
                    console.log('   HTML saved: page-content.html');
                }
                else if (command === 'buttons') {
                    const buttons = await page.$$eval('button, a, [role="button"]', els =>
                        els.filter(el => el.offsetParent !== null)
                           .map(el => `[${el.tagName}] "${el.textContent.trim().substring(0, 50)}" ${el.href || ''}`)
                           .slice(0, 30)
                    );
                    console.log('   Visible buttons/links:');
                    buttons.forEach((b, i) => console.log(`   ${i + 1}. ${b}`));
                }
            }
        } catch (e) {
            console.log(`   Command error: ${e.message}`);
        }
    }, 1000);

    // Handle page close
    page.on('close', () => {
        console.log('\nPage closed by user.');
        clearInterval(urlMonitor);
        clearInterval(commandMonitor);
        process.exit(0);
    });

    context.on('close', () => {
        console.log('\nBrowser closed.');
        process.exit(0);
    });

    console.log('Browser ready. Commands via browser-command.txt:');
    console.log('  - screenshot : Take screenshot');
    console.log('  - buttons    : List visible buttons');
    console.log('  - goto:URL   : Navigate to URL');
    console.log('  - click:SEL  : Click element by selector');
    console.log('  - html       : Save page HTML\n');

    // Keep running forever
    await new Promise(() => {});
}

main().catch(console.error);

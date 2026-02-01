/**
 * Test Excel Export to verify titles are correct
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function testExport() {
  console.log('🧪 Testing Excel Export with Fixed Titles');
  console.log('='.repeat(50));

  const downloadDir = path.join(__dirname, '../test-downloads');

  // Ensure download dir exists
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // Remove old CSV files
  fs.readdirSync(downloadDir).filter(f => f.endsWith('.csv')).forEach(f => {
    fs.unlinkSync(path.join(downloadDir, f));
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    // Login
    await page.goto('https://amazon-storefronts.vercel.app', { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('#loginUsername', 'snir');
    await page.fill('#loginPassword', 'snir');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000); // Wait for data to load

    // Go to Lists tab
    await page.locator('.nav-tab[data-tab="lists"]').click();
    await page.waitForTimeout(1000);

    // Search for abeautifulmess Home Decor (the list we fixed)
    await page.fill('#listSearch', 'abeautifulmess');
    await page.waitForTimeout(1000);

    // Find the Home Decor row specifically
    const homeDecorRow = page.locator('tr:has-text("Home Decor"):has-text("abeautifulmess")').first();

    // Screenshot before clicking
    await page.screenshot({ path: path.join(downloadDir, 'before-export.png') });

    // Set up download listener before clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });

    // Find and click Excel button in the Home Decor row
    const excelBtn = homeDecorRow.locator('button:has-text("Excel")');
    await excelBtn.click();

    // Wait for download
    const download = await downloadPromise;

    // Save file
    const filename = download.suggestedFilename();
    const filepath = path.join(downloadDir, filename);
    await download.saveAs(filepath);

    // Read and analyze CSV
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    console.log('\n📥 Downloaded:', filename);
    console.log('📊 Total products:', lines.length - 1);
    console.log('');
    console.log('First 10 products:');

    const badKeywords = ['skip to', 'product detail page link', 'product detail page'];

    lines.slice(1, 11).forEach((line, i) => {
      // Parse CSV line (handle commas in quoted strings)
      const match = line.match(/^([^,]+),(".*?"|[^,]*),(.*)$/);
      const asin = match ? match[1] : line.split(',')[0];
      let title = match ? match[2].replace(/^"|"$/g, '') : '';

      const isBad = badKeywords.some(kw => title.toLowerCase().includes(kw)) || title.length < 5;
      console.log(`  ${i+1}. ${asin}: ${(title || '(empty)').substring(0, 50)}${isBad ? ' ⚠️' : ' ✅'}`);
    });

    // Count bad titles in entire file
    let badCount = 0;
    lines.slice(1).forEach(line => {
      const lowerLine = line.toLowerCase();
      if (badKeywords.some(kw => lowerLine.includes(kw))) {
        badCount++;
      }
    });

    console.log('');
    console.log('='.repeat(50));
    console.log(`Bad titles found: ${badCount}`);

    if (badCount === 0) {
      console.log('🎉 SUCCESS - All titles are good!');
      return true;
    } else {
      console.log('⚠️ WARNING - Some bad titles remain');
      return false;
    }

  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: path.join(downloadDir, 'export-error.png') });
    return false;
  } finally {
    await browser.close();
  }
}

testExport()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

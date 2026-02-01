/**
 * Test View Lists for influencer-d200f039
 */
const { chromium } = require('playwright');

async function test() {
  console.log('🧪 Testing View Lists for influencer-d200f039');
  console.log('='.repeat(50));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://amazon-storefronts.vercel.app', { waitUntil: 'networkidle' });

  // Login
  await page.fill('#loginUsername', 'snir');
  await page.fill('#loginPassword', 'snir');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  // Get lists data from the page
  const listsData = await page.evaluate(() => {
    return {
      totalLists: lists.length,
      influencerLists: lists.filter(l => l.storefront === 'influencer-d200f039')
    };
  });

  console.log('Total lists loaded:', listsData.totalLists);
  console.log('Lists for influencer-d200f039:', listsData.influencerLists.length);

  if (listsData.influencerLists.length > 0) {
    console.log('\n✅ SUCCESS! Lists found:');
    listsData.influencerLists.slice(0, 5).forEach((l, i) => {
      console.log(`  ${i+1}. ${l.name}`);
    });
    if (listsData.influencerLists.length > 5) {
      console.log(`  ... and ${listsData.influencerLists.length - 5} more`);
    }
  } else {
    console.log('\n❌ FAILED: No lists found');
  }

  // Now test clicking View Lists
  console.log('\nTesting View Lists button...');

  // Search for the storefront
  await page.fill('#storefrontSearch', 'influencer-d200f039');
  await page.waitForTimeout(500);

  // Click View Lists button
  const viewListsBtn = await page.locator('button:has-text("View Lists")').first();
  await viewListsBtn.click();
  await page.waitForTimeout(500);

  // Check modal content
  const modalContent = await page.locator('#modalListsBody').innerHTML();
  const rowCount = (modalContent.match(/<tr>/g) || []).length - 1; // subtract header

  console.log('Modal shows', rowCount, 'list rows');

  // Take screenshot
  await page.screenshot({ path: 'test-downloads/view-lists-test.png' });
  console.log('📸 Screenshot saved to test-downloads/view-lists-test.png');

  await browser.close();

  return listsData.influencerLists.length > 0 && rowCount > 0;
}

test().then(success => {
  console.log('\n' + '='.repeat(50));
  console.log(success ? '🎉 Test PASSED!' : '❌ Test FAILED!');
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

var asins = [
"B0016HF5GK",
"B01728NLRG",
"B0764HS4SL",
"B07F4128P2",
"B07FNRXFTD",
"B07MHMBHT7",
"B07QPZYRB8",
"B08ZY8HT1G",
"B0997PYJJT",
"B09BJRSZVC",
"B09N3WPTY6",
"B0B288QLYD",
"B0B2K47S1T",
"B0BJLBF8S8",
"B0BRRPP5KH",
"B0BTCZ2RR9",
"B0C2C9NHZW",
"B0C35D7X75",
"B0C7C5NFJ3",
"B0C89B5S14",
"B0CGVSKR1G",
"B0CHHFKWPV",
"B0CHYL7R5C",
"B0D3139TW6",
"B0D313JRLG",
"B0D69JSBZ5",
"B0D8BQ4LFC",
"B0DD5S7KF9",
"B0FKBF6TYQ",
"B0FL9L2CKD",
"B0FM77N3H8",
"B0FQ2QCZXK"
];
console.log("ASINs loaded: " + asins.length);

// Find the search input in the popup - index 24
function findSearch() {
  var inputs = document.querySelectorAll('input');
  console.log('Using input #24');
  return inputs[24];
}

// Test with first ASIN
function testFirst() {
  var search = findSearch();
  if (!search) {
    console.log('No search input found. Listing all inputs:');
    document.querySelectorAll('input').forEach(function(el, i) {
      console.log(i, el.type, el.placeholder, el);
    });
    return;
  }
  search.focus();
  search.value = asins[0];
  search.dispatchEvent(new Event('input', {bubbles: true}));
  console.log('Typed: ' + asins[0]);

  // Press Enter - try multiple methods
  setTimeout(function() {
    // Method 1: Submit the form
    var form = search.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      console.log('Submitted form');
    }

    // Method 2: Keyboard events
    search.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
    search.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
    search.dispatchEvent(new KeyboardEvent('keyup', {key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true}));
    console.log('Sent keyboard events');

    // Method 3: Find and click search button
    var buttons = document.querySelectorAll('button');
    buttons.forEach(function(btn) {
      if (btn.textContent.toLowerCase().includes('search') || btn.getAttribute('aria-label')?.toLowerCase().includes('search')) {
        console.log('Found search button:', btn);
        btn.click();
      }
    });
  }, 500);
}

// Try clicking search button directly
function clickSearch() {
  var buttons = document.querySelectorAll('button, [role="button"]');
  buttons.forEach(function(btn, i) {
    var text = btn.textContent || btn.getAttribute('aria-label') || '';
    if (text.toLowerCase().includes('search')) {
      console.log(i, 'Search button:', btn);
    }
  });
}

console.log('Run testFirst() to test with first ASIN');

# Amazon List Creator - Setup Guide

Automate creating Idea Lists on your Amazon storefront using Playwright browser automation.

## Overview

Since Amazon doesn't have a public API for managing storefronts, this tool uses browser automation to:
1. Log into your Amazon Associates account
2. Navigate to your storefront
3. Create new Idea Lists
4. Add products by ASIN

## Quick Start

### 1. Install Dependencies

```bash
cd amazon-storefronts
npm install playwright
npx playwright install chromium
```

### 2. First-Time Login

Run the login mode to authenticate and save your session:

```bash
node scripts/amazon-list-creator.js --login
```

This will:
- Open a browser window
- Navigate to Amazon login
- Wait for you to log in (including 2FA)
- Save the session to `browser-state/amazon-state.json`

### 3. Create Lists

After logging in once, you can create lists:

```bash
node scripts/amazon-list-creator.js --mode=persistent
```

## Running Modes

### Mode 1: Persistent State (Recommended)

Uses saved browser state from previous login:

```bash
# First time - login and save state
node scripts/amazon-list-creator.js --login

# Create lists using saved state
node scripts/amazon-list-creator.js --mode=persistent
```

**Pros:**
- Works with any Chromium browser
- Session persists across restarts
- Works on VMs and servers

**Cons:**
- Session may expire (re-run `--login` if needed)

### Mode 2: Chrome Profile

Uses your existing Chrome browser profile (already logged in):

```bash
node scripts/amazon-list-creator.js --mode=profile
```

**Important:** Close all Chrome windows before running!

**Pros:**
- Uses existing login session
- No separate login needed

**Cons:**
- Requires Chrome to be installed
- Chrome must be closed while running
- Profile path varies by system

### Mode 3: Local API Server

Runs a browser + HTTP server that the UI can call:

```bash
node scripts/list-creator-server.js
```

Then from your app/UI:

```javascript
// Check status
fetch('http://localhost:3847/status')
  .then(r => r.json())
  .then(console.log);

// Create a list
fetch('http://localhost:3847/create-list', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Tech Picks',
    description: 'Favorite gadgets for 2024',
    asins: ['B0BSHF7WHW', 'B0BN4GVGFZ', 'B09V3KXJPB']
  })
}).then(r => r.json()).then(console.log);
```

## Configuration

Edit the CONFIG object in `scripts/amazon-list-creator.js`:

```javascript
const CONFIG = {
    // Your Amazon storefront ID (from URL: amazon.com/shop/YOUR_ID)
    storefrontId: 'influencer-03f5875c',

    // Path to Chrome profile (for --mode=profile)
    chromeProfilePath: 'C:\\Users\\YourName\\AppData\\Local\\Google\\Chrome\\User Data',

    // Which Chrome profile to use
    chromeProfile: 'Default',  // or 'Profile 1', 'Profile 2', etc.
};
```

## Setting Up on a VM (24/7 Operation)

For running continuously on a virtual machine:

### Option A: Windows VM with Desktop

1. Set up a Windows VM (Azure, AWS, GCP)
2. Enable RDP access
3. Install Node.js and Chrome
4. Run the setup:

```bash
git clone <your-repo>
cd amazon-storefronts
npm install
npx playwright install chromium

# Login once via RDP
node scripts/amazon-list-creator.js --login

# Start the server (will run in background)
node scripts/list-creator-server.js
```

### Option B: Linux VM with Virtual Display

```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y xvfb

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# Run the server
node scripts/list-creator-server.js
```

### Option C: Docker Container

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Run with virtual display
CMD ["xvfb-run", "node", "scripts/list-creator-server.js"]
```

## API Reference (Server Mode)

### GET /status

Check if server is ready:

```json
{
  "status": "ready",
  "isReady": true,
  "isLoggedIn": true,
  "storefrontId": "influencer-03f5875c"
}
```

Status values:
- `initializing` - Browser starting up
- `awaiting_login` - Waiting for manual login
- `ready` - Ready to create lists
- `creating_list` - Currently creating a list

### POST /create-list

Create a new Idea List:

```json
{
  "name": "My List Name",
  "description": "Optional description",
  "asins": ["B0BSHF7WHW", "B0BN4GVGFZ"]
}
```

Response:
```json
{
  "success": true,
  "name": "My List Name",
  "productsAdded": 2,
  "totalProducts": 2,
  "screenshot": "created-1234567890.png"
}
```

### GET /screenshot

Take a screenshot of current browser state.

### POST /quit

Shutdown the server gracefully.

## Troubleshooting

### "Not logged in" error

The saved session may have expired. Re-run login:

```bash
node scripts/amazon-list-creator.js --login
```

### Chrome profile not working

1. Make sure Chrome is completely closed (check Task Manager)
2. Verify the profile path is correct
3. Try using a specific profile: `--profile="Profile 1"`

### Products not being added

Amazon's UI may have changed. Check:
1. Screenshots in `browser-state/screenshots/`
2. Console output for error messages
3. The ASIN is valid and in stock

### Session expires quickly

Amazon may require re-authentication for certain actions. Consider:
1. Using a VM where you can RDP in to re-login
2. Setting up email alerts when login expires
3. Running `--login` periodically (e.g., weekly)

## Security Notes

- **Never commit `browser-state/` to git** - it contains your session
- The `.gitignore` should include `browser-state/`
- On shared VMs, secure the state directory
- Consider encrypting the state file for sensitive deployments

## Integration with UI

To add a "Create on Amazon" button to the UI:

1. Start the local server: `node scripts/list-creator-server.js`
2. Add UI code to call the API:

```javascript
async function createListOnAmazon(listData) {
  try {
    // Check if server is running
    const status = await fetch('http://localhost:3847/status').then(r => r.json());

    if (!status.isReady) {
      alert('Amazon List Creator is not ready. Please check the server.');
      return;
    }

    // Create the list
    const result = await fetch('http://localhost:3847/create-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: listData.name,
        description: listData.description,
        asins: listData.products.map(p => p.asin)
      })
    }).then(r => r.json());

    if (result.success) {
      alert(`Created "${result.name}" with ${result.productsAdded} products!`);
    } else {
      alert('Failed to create list: ' + result.error);
    }
  } catch (e) {
    alert('Could not connect to Amazon List Creator server. Is it running?');
  }
}
```

## Files

```
amazon-storefronts/
├── scripts/
│   ├── amazon-list-creator.js    # Main CLI tool
│   ├── list-creator-server.js    # HTTP API server
│   └── list-command.json         # Command file (for file-based control)
├── browser-state/                # Saved session (gitignored)
│   ├── amazon-state.json         # Cookies & localStorage
│   └── screenshots/              # Debug screenshots
└── AMAZON-LIST-CREATOR.md        # This file
```

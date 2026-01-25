#!/usr/bin/env node
/**
 * Injects environment variables into ui/secrets.js for Vercel deployment
 *
 * Required environment variables:
 *   - GEMINI_API_KEY: Your Gemini API key from https://aistudio.google.com/app/apikey
 *   - FB_APP_ID: Your Facebook App ID from https://developers.facebook.com
 *   - FB_AD_ACCOUNT_ID: Your Facebook Ad Account ID (format: act_XXXXXXXXXX)
 *
 * Usage:
 *   node scripts/inject-secrets.js
 *
 * Note: This script is run automatically during Vercel build via package.json
 */

const fs = require('fs');
const path = require('path');

const secretsPath = path.join(__dirname, '..', 'ui', 'secrets.js');

// Get environment variables with fallbacks
const geminiKey = process.env.GEMINI_API_KEY || '';
const fbAppId = process.env.FB_APP_ID || '';
const fbAdAccountId = process.env.FB_AD_ACCOUNT_ID || '';

// Check if any secrets are provided
const hasSecrets = geminiKey || fbAppId || fbAdAccountId;

if (!hasSecrets) {
    console.log('⚠️  No secrets found in environment variables.');
    console.log('   Set GEMINI_API_KEY, FB_APP_ID, and FB_AD_ACCOUNT_ID in Vercel.');
    console.log('   Skipping secrets.js generation.');

    // Create a placeholder file that shows error messages in the UI
    const placeholderContent = `// Secrets not configured - set environment variables in Vercel
window.GEMINI_API_KEY = '';
window.FB_APP_ID = '';
window.FB_AD_ACCOUNT_ID = '';
`;
    fs.writeFileSync(secretsPath, placeholderContent);
    process.exit(0);
}

// Generate secrets.js content
const secretsContent = `// Auto-generated from environment variables
// DO NOT EDIT - this file is generated during build

// Nano Banana (Gemini) API configuration
window.GEMINI_API_KEY = '${geminiKey}';

// Facebook Marketing API configuration
window.FB_APP_ID = '${fbAppId}';
window.FB_AD_ACCOUNT_ID = '${fbAdAccountId}';
`;

// Write the file
fs.writeFileSync(secretsPath, secretsContent);

console.log('✅ Generated ui/secrets.js from environment variables');
console.log('   GEMINI_API_KEY:', geminiKey ? '✓ configured' : '✗ not set');
console.log('   FB_APP_ID:', fbAppId ? '✓ configured' : '✗ not set');
console.log('   FB_AD_ACCOUNT_ID:', fbAdAccountId ? '✓ configured' : '✗ not set');

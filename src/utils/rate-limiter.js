class RateLimiter {
    constructor(options = {}) {
        this.minDelay = options.minDelay || 3000;
        this.maxDelay = options.maxDelay || 8000;
        this.storefrontDelay = options.storefrontDelay || 5000;
        this.batchDelay = options.batchDelay || 30000;
        this.batchSize = options.batchSize || 50;
        this.requestCount = 0;
    }

    async wait(customMs = null) {
        const ms = customMs || this.getRandomDelay();
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getRandomDelay(min = this.minDelay, max = this.maxDelay) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async waitBetweenPages() {
        const delay = this.getRandomDelay(this.minDelay, this.maxDelay);
        console.log(`  Waiting ${(delay / 1000).toFixed(1)}s...`);
        await this.wait(delay);
    }

    async waitBetweenStorefronts() {
        const delay = this.getRandomDelay(this.storefrontDelay, this.storefrontDelay * 2);
        console.log(`  Waiting ${(delay / 1000).toFixed(1)}s before next storefront...`);
        await this.wait(delay);
    }

    async waitForBatch() {
        this.requestCount++;
        if (this.requestCount % this.batchSize === 0) {
            console.log(`\n  Batch pause: waiting ${this.batchDelay / 1000}s after ${this.requestCount} requests...\n`);
            await this.wait(this.batchDelay);
        }
    }

    async exponentialBackoff(attempt, baseDelay = 60000) {
        const delay = baseDelay * Math.pow(2, attempt);
        const maxDelay = 30 * 60 * 1000; // Max 30 minutes
        const actualDelay = Math.min(delay, maxDelay);
        console.log(`  Rate limited. Backing off for ${(actualDelay / 1000 / 60).toFixed(1)} minutes (attempt ${attempt + 1})...`);
        await this.wait(actualDelay);
    }

    resetRequestCount() {
        this.requestCount = 0;
    }
}

module.exports = RateLimiter;

const fs = require('fs').promises;
const path = require('path');

class CheckpointManager {
    constructor(checkpointPath = null) {
        this.checkpointPath = checkpointPath || path.join(__dirname, '../../data/input/checkpoint.json');
        this.saveInterval = 25;
        this.lastSaved = 0;
    }

    async load() {
        try {
            const content = await fs.readFile(this.checkpointPath, 'utf8');
            const checkpoint = JSON.parse(content);
            console.log(`Loaded checkpoint: ${checkpoint.scraping?.processed || 0} storefronts processed`);
            return checkpoint;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No checkpoint found, starting fresh');
                return this.createEmptyCheckpoint();
            }
            throw error;
        }
    }

    createEmptyCheckpoint() {
        return {
            last_updated: new Date().toISOString(),
            discovery: {
                google: { completed: false, last_page: 0, urls_found: 0 },
                founditonamazon: { completed: false, scroll_position: 0 },
                amazonlive: { completed: false, pages_processed: 0 }
            },
            scraping: {
                total_storefronts: 0,
                processed: 0,
                last_processed_id: null,
                failed_urls: []
            }
        };
    }

    async save(checkpoint) {
        checkpoint.last_updated = new Date().toISOString();

        // Ensure directory exists
        const dir = path.dirname(this.checkpointPath);
        await fs.mkdir(dir, { recursive: true });

        await fs.writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2));
        this.lastSaved = checkpoint.scraping?.processed || 0;
        console.log(`Checkpoint saved: ${this.lastSaved} storefronts processed`);
    }

    shouldSave(currentIndex) {
        return currentIndex > 0 && currentIndex % this.saveInterval === 0 && currentIndex > this.lastSaved;
    }

    async updateScrapingProgress(checkpoint, index, storefrontId, total) {
        checkpoint.scraping.processed = index + 1;
        checkpoint.scraping.last_processed_id = storefrontId;
        checkpoint.scraping.total_storefronts = total;

        if (this.shouldSave(index + 1)) {
            await this.save(checkpoint);
        }
    }

    async addFailedUrl(checkpoint, url, error) {
        if (!checkpoint.scraping.failed_urls.includes(url)) {
            checkpoint.scraping.failed_urls.push(url);
        }
    }

    getResumeIndex(checkpoint, urls) {
        if (!checkpoint.scraping.last_processed_id) {
            return 0;
        }

        const lastIndex = urls.findIndex(u =>
            u.storefront_id === checkpoint.scraping.last_processed_id ||
            u.url === checkpoint.scraping.last_processed_id
        );

        return lastIndex >= 0 ? lastIndex + 1 : 0;
    }
}

module.exports = CheckpointManager;

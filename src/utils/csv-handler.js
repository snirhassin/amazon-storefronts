const fs = require('fs').promises;
const path = require('path');

class CSVHandler {
    constructor(outputDir = null) {
        this.outputDir = outputDir || path.join(__dirname, '../../data/output');
        this.BOM = '\ufeff'; // UTF-8 BOM for Excel compatibility
    }

    async ensureDir(dir) {
        await fs.mkdir(dir, { recursive: true });
    }

    escapeCSV(value) {
        if (value === null || value === undefined) {
            return '';
        }
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    formatRow(values) {
        return values.map(v => this.escapeCSV(v)).join(',');
    }

    async writeCSV(data, filename, fields) {
        await this.ensureDir(this.outputDir);
        const filepath = path.join(this.outputDir, filename);

        const header = this.formatRow(fields);
        const rows = data.map(item => this.formatRow(fields.map(f => item[f])));

        const content = this.BOM + [header, ...rows].join('\n');
        await fs.writeFile(filepath, content, 'utf8');

        console.log(`Saved ${data.length} rows to ${filename}`);
        return filepath;
    }

    async appendCSV(data, filename, fields) {
        const filepath = path.join(this.outputDir, filename);

        let fileExists = false;
        try {
            await fs.access(filepath);
            fileExists = true;
        } catch {
            fileExists = false;
        }

        if (!fileExists) {
            return this.writeCSV(data, filename, fields);
        }

        const rows = data.map(item => this.formatRow(fields.map(f => item[f])));
        const content = '\n' + rows.join('\n');

        await fs.appendFile(filepath, content, 'utf8');
        console.log(`Appended ${data.length} rows to ${filename}`);
        return filepath;
    }

    async readCSV(filepath) {
        const content = await fs.readFile(filepath, 'utf8');
        const lines = content.replace(this.BOM, '').split('\n').filter(line => line.trim());

        if (lines.length === 0) return [];

        const headers = this.parseCSVLine(lines[0]);
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }

        return data;
    }

    parseCSVLine(line) {
        const columns = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                columns.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        columns.push(current.trim());
        return columns;
    }

    // Convenience methods for specific file types
    async saveStorefronts(storefronts) {
        const fields = [
            'storefront_id', 'storefront_url', 'username', 'creator_name', 'bio',
            'profile_image_url', 'is_top_creator', 'storefront_likes', 'follower_count', 'total_lists',
            'total_products', 'discovery_source', 'marketplace', 'scraped_at', 'scrape_status'
        ];
        return this.appendCSV(storefronts, 'storefronts.csv', fields);
    }

    async saveLists(lists) {
        const fields = [
            'list_id', 'storefront_id', 'list_name', 'list_url',
            'likes_count', 'products_count', 'category', 'position', 'scraped_at'
        ];
        return this.appendCSV(lists, 'lists.csv', fields);
    }

    async saveProducts(products) {
        const fields = [
            'asin', 'list_id', 'storefront_id', 'product_title',
            'price', 'price_numeric', 'currency', 'image_url', 'product_url',
            'position_in_list', 'scraped_at'
        ];
        return this.appendCSV(products, 'products.csv', fields);
    }

    async saveDiscoveredUrls(urls) {
        const inputDir = path.join(__dirname, '../../data/input');
        await this.ensureDir(inputDir);

        const fields = ['storefront_id', 'url', 'username', 'discovery_source', 'discovered_at'];
        const filepath = path.join(inputDir, 'discovered-urls.csv');

        const header = this.formatRow(fields);
        const rows = urls.map(item => this.formatRow(fields.map(f => item[f])));

        const content = this.BOM + [header, ...rows].join('\n');
        await fs.writeFile(filepath, content, 'utf8');

        console.log(`Saved ${urls.length} discovered URLs to discovered-urls.csv`);
        return filepath;
    }

    async loadDiscoveredUrls() {
        const filepath = path.join(__dirname, '../../data/input/discovered-urls.csv');
        try {
            return await this.readCSV(filepath);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('No discovered URLs file found');
                return [];
            }
            throw error;
        }
    }
}

module.exports = CSVHandler;

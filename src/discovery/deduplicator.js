class Deduplicator {
    constructor() {
        this.seenIds = new Set();
    }

    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            // Extract just the storefront path and normalize
            const match = parsed.pathname.match(/\/shop\/([^/?]+)/i);
            if (match) {
                return match[1].toLowerCase().replace(/[\/\s]+$/, '');
            }
            return null;
        } catch {
            return null;
        }
    }

    normalizeStorefrontId(id) {
        if (!id) return null;
        return id.toLowerCase().trim().replace(/[\/\s]+$/, '');
    }

    deduplicate(urlArrays, preferredSource = 'google') {
        const urlMap = new Map();
        const sourceOrder = {
            'google': 1,
            'founditonamazon': 2,
            'amazonlive': 3,
            'manual': 4
        };

        // Process all URL arrays
        for (const urls of urlArrays) {
            for (const item of urls) {
                const normalizedId = this.normalizeStorefrontId(item.storefront_id);

                if (!normalizedId) continue;

                // If we haven't seen this ID, add it
                if (!urlMap.has(normalizedId)) {
                    urlMap.set(normalizedId, {
                        ...item,
                        storefront_id: normalizedId,
                        sources: [item.discovery_source]
                    });
                } else {
                    // Add source to existing entry
                    const existing = urlMap.get(normalizedId);
                    if (!existing.sources.includes(item.discovery_source)) {
                        existing.sources.push(item.discovery_source);
                    }

                    // Update discovery_source to preferred if available
                    const currentPriority = sourceOrder[existing.discovery_source] || 999;
                    const newPriority = sourceOrder[item.discovery_source] || 999;

                    if (newPriority < currentPriority) {
                        existing.discovery_source = item.discovery_source;
                        existing.url = item.url; // Prefer URL from higher priority source
                    }
                }
            }
        }

        // Convert to array and add source count
        const results = Array.from(urlMap.values()).map(item => ({
            storefront_id: item.storefront_id,
            url: item.url,
            username: item.username || item.storefront_id,
            discovery_source: item.discovery_source,
            discovered_at: item.discovered_at,
            source_count: item.sources.length,
            all_sources: item.sources.join(',')
        }));

        // Sort by source count (descending) then by source priority
        results.sort((a, b) => {
            if (b.source_count !== a.source_count) {
                return b.source_count - a.source_count;
            }
            return (sourceOrder[a.discovery_source] || 999) - (sourceOrder[b.discovery_source] || 999);
        });

        return results;
    }

    removeDuplicatesFromExisting(newUrls, existingUrls) {
        const existingIds = new Set(existingUrls.map(u => this.normalizeStorefrontId(u.storefront_id)));

        return newUrls.filter(url => {
            const normalizedId = this.normalizeStorefrontId(url.storefront_id);
            return normalizedId && !existingIds.has(normalizedId);
        });
    }

    getStats(deduplicatedUrls) {
        const stats = {
            total: deduplicatedUrls.length,
            bySource: {},
            multiSource: 0
        };

        for (const url of deduplicatedUrls) {
            const source = url.discovery_source;
            stats.bySource[source] = (stats.bySource[source] || 0) + 1;

            if (url.source_count > 1) {
                stats.multiSource++;
            }
        }

        return stats;
    }
}

module.exports = Deduplicator;

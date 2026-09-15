// Live, location-based restaurant discovery from Wolt's public web API.
// Unlike the static Korpa.mk list, this returns venues that actually deliver to
// wherever the user is standing — and tells us honestly when nothing does.
const axios = require('axios');

const DISCOVERY = 'https://restaurant-api.wolt.com/v1/pages/restaurants';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36';

// Wolt's served cities in North Macedonia (from their own city list) + centres,
// used to build the menu-page URL, which requires a city segment.
const MK_CITIES = [
    { slug: 'skopje', lat: 41.9981, lon: 21.4254 },
    { slug: 'bitola', lat: 41.0297, lon: 21.3292 },
    { slug: 'ohrid', lat: 41.1231, lon: 20.8016 },
    { slug: 'tetovo', lat: 42.0106, lon: 20.9714 },
];

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCity(lat, lon) {
    return [...MK_CITIES].sort(
        (a, b) => haversine(lat, lon, a.lat, a.lon) - haversine(lat, lon, b.lat, b.lon)
    )[0];
}

const menuCache = new Map();
const MENU_TTL = 30 * 60 * 1000;

/**
 * Discover venues near a point.
 * @returns {Promise<{ venues: Array, noService: boolean }>}
 */
async function discoverVenues(lat, lon) {
    try {
        const { data } = await axios.get(DISCOVERY, {
            params: { lat, lon },
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            timeout: 8000,
        });

        const sections = data.sections || [];
        const noService = sections.some(
            (s) => s.name === 'no-content' || s.template === 'no-content'
        );

        const venues = [];
        for (const section of sections) {
            for (const item of section.items || []) {
                const v = item.venue;
                if (!v || !v.online || !v.delivers) continue;
                const [vlon, vlat] = v.location || [];
                venues.push({
                    id: v.id,
                    slug: v.slug,
                    name: v.name,
                    address: v.address || null,
                    latitude: vlat ?? null,
                    longitude: vlon ?? null,
                    rating: v.rating?.score ?? null,
                    deliveryEstimateMin: v.estimate ?? null,
                    priceRange: v.price_range ?? null,
                    tags: v.tags || [],
                    shortDescription: v.short_description || '',
                    source: 'wolt',
                });
            }
        }
        // Dedupe by slug (Wolt repeats venues across sections).
        const seen = new Set();
        const unique = venues.filter((v) => (seen.has(v.slug) ? false : seen.add(v.slug)));
        return { venues: unique, noService: noService && unique.length === 0 };
    } catch (err) {
        console.error('[wolt] discovery failed:', err.response?.status || err.message);
        return { venues: [], noService: false, error: true };
    }
}

/**
 * Scrape a venue's menu from its Wolt web page (the menu JSON is embedded in the
 * server-rendered HTML — no headless browser needed).
 */
async function fetchVenueMenu(venue) {
    const cached = menuCache.get(venue.slug);
    if (cached && Date.now() - cached.t < MENU_TTL) return cached.items;

    const city =
        venue.latitude && venue.longitude
            ? nearestCity(venue.latitude, venue.longitude).slug
            : 'skopje';
    const url = `https://wolt.com/en/mkd/${city}/restaurant/${venue.slug}`;

    try {
        const { data: html } = await axios.get(url, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
            timeout: 10000,
        });

        const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        let state = null;
        for (const s of scripts) {
            if (!s.includes('venue-assortment')) continue;
            try {
                state = JSON.parse(s);
                break;
            } catch {
                /* not this one */
            }
        }
        if (!state) return [];

        const cat = (state.queries || []).find(
            (q) =>
                Array.isArray(q.queryKey) &&
                q.queryKey[0] === 'venue-assortment' &&
                q.queryKey[1] === 'category-listing'
        );
        const rawItems = cat?.state?.data?.items || [];
        const items = rawItems
            .filter((i) => i.name && !i.disabled_info)
            .slice(0, 40)
            .map((i) => ({
                name: i.name,
                description: i.description || '',
                price: i.price != null ? `${Math.round(i.price / 100)} MKD` : null,
            }));

        menuCache.set(venue.slug, { t: Date.now(), items });
        return items;
    } catch (err) {
        console.error(`[wolt] menu scrape failed for ${venue.slug}:`, err.response?.status || err.message);
        return [];
    }
}

function venueOrderUrl(venue) {
    const city =
        venue.latitude && venue.longitude
            ? nearestCity(venue.latitude, venue.longitude).slug
            : 'skopje';
    return `https://wolt.com/en/mkd/${city}/restaurant/${venue.slug}`;
}

module.exports = { discoverVenues, fetchVenueMenu, venueOrderUrl, haversine, MK_CITIES };

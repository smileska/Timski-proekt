// One place that answers "what can this person actually order from, right now?"
// Combines live Wolt discovery (any served city) with the local Korpa.mk list
// (Skopje area only) and — crucially — refuses to show restaurants that don't
// deliver anywhere near the user.
const fs = require('fs');
const path = require('path');
const { discoverVenues, fetchVenueMenu, venueOrderUrl, haversine, MK_CITIES } = require('./wolt');

const KORPA_JSON = path.join(__dirname, '..', 'korpa-data.json');

// Korpa.mk delivery footprint (Skopje, Tetovo, Ohrid, Kumanovo). A Korpa
// restaurant is only offered if the user is within this radius of one.
const KORPA_CITIES = [
    { name: 'Skopje', lat: 41.9981, lon: 21.4254 },
    { name: 'Tetovo', lat: 42.0106, lon: 20.9714 },
    { name: 'Ohrid', lat: 41.1231, lon: 20.8016 },
    { name: 'Kumanovo', lat: 42.1322, lon: 21.7144 },
];
const KORPA_RADIUS_KM = 20;

// Everything Wolt + Korpa cover between them, for honest "not available" copy.
const SERVED_CITIES = ['Skopje', 'Bitola', 'Ohrid', 'Tetovo', 'Kumanovo'];

function readKorpa() {
    try {
        const raw = JSON.parse(fs.readFileSync(KORPA_JSON, 'utf8')) || [];
        const seen = new Set();
        return raw.filter((r) => {
            const key = r.id || r.slug || r.name;
            return seen.has(key) ? false : seen.add(key);
        });
    } catch {
        return [];
    }
}

function nearestKorpaCityKm(lat, lon) {
    return Math.min(...KORPA_CITIES.map((c) => haversine(lat, lon, c.lat, c.lon)));
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {object} opts { withMenus, woltLimit, menuLimit }
 * @returns {Promise<{
 *   restaurants: Array, noService: boolean, servedCities: string[],
 *   sources: string[]
 * }>}
 */
async function getNearby(lat, lon, opts = {}) {
    const { withMenus = false, woltLimit = 12, menuLimit = 6 } = opts;
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lon);

    // ── Wolt (live, wherever the user is) ──────────────────────────────────
    let woltVenues = [];
    let woltNoService = false;
    if (hasLoc) {
        const disc = await discoverVenues(lat, lon);
        woltNoService = disc.noService;
        woltVenues = disc.venues
            .map((v) => ({
                ...v,
                distanceKm:
                    v.latitude && v.longitude ? haversine(lat, lon, v.latitude, v.longitude) : null,
                url: venueOrderUrl(v),
            }))
            .sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9))
            .slice(0, woltLimit);

        if (withMenus) {
            await Promise.all(
                woltVenues.slice(0, menuLimit).map(async (v) => {
                    v.menu = await fetchVenueMenu(v);
                })
            );
        }
    }

    // ── Korpa.mk (only if the user is actually in its footprint) ───────────
    let korpaRestaurants = [];
    const korpaInRange = hasLoc && nearestKorpaCityKm(lat, lon) <= KORPA_RADIUS_KM;
    if (!hasLoc || korpaInRange) {
        korpaRestaurants = readKorpa()
            .filter((r) => r.menu && r.menu.length > 0)
            .map((r) => ({
                id: r.id || r.slug,
                slug: r.slug || r.id,
                name: r.name,
                address: r.address || null,
                latitude: r.latitude ?? null,
                longitude: r.longitude ?? null,
                url: r.url,
                menu: r.menu,
                source: 'korpa',
                distanceKm:
                    hasLoc && r.latitude && r.longitude
                        ? haversine(lat, lon, r.latitude, r.longitude)
                        : null,
            }))
            .filter((r) => !hasLoc || r.distanceKm == null || r.distanceKm <= KORPA_RADIUS_KM);
    }

    const restaurants = [...woltVenues, ...korpaRestaurants].sort(
        (a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9)
    );

    const sources = [...new Set(restaurants.map((r) => r.source))];
    return {
        restaurants,
        noService: restaurants.length === 0 && (woltNoService || (hasLoc && !korpaInRange)),
        servedCities: SERVED_CITIES,
        sources,
    };
}

module.exports = { getNearby, SERVED_CITIES };

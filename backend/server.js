const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`\n${req.method} ${req.url}`);
    console.log(`   Path: ${req.path}`);
    console.log(`   Headers: ${JSON.stringify(req.headers.host)}`);
    next();
});

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

let cachedRestaurants = null;
let cacheTimestamp = null;
const CACHE_DURATION = 60 * 60 * 1000;

const { getKorpaData, getMenusForRestaurants } = require('./korpaScraper');
const fs = require('fs');
const path = require('path');

// Skopje restaurant coordinates (fallback when Google geocoding not available)
const SKOPJE_RESTAURANT_COORDS = {
    'amigos zeleznicka': [41.9977, 21.4305],
    'amigos ljubljanska': [41.9965, 21.4201],
    'gostilnica dukat': [41.9962, 21.4316],
    'royal burger novo lisice': [41.9821, 21.4687],
    'royal burger debar maalo': [41.9934, 21.4198],
    'star ocean - centar': [41.9957, 21.4312],
    'star ocean - east gate mall': [41.9875, 21.5012],
    'star ocean - city mall': [41.9701, 21.4401],
    'star ocean - ramstore mall': [42.0012, 21.4089],
    'fat kitchen bistro': [41.9971, 21.4289],
    'sushico debar maalo': [41.9934, 21.4198],
    'sushico zen': [42.0045, 21.4102],
    'teteks - karposh': [42.0021, 21.3987],
    'teteks - gjorce petrov': [41.9912, 21.3845],
    'teteks - centar': [41.9957, 21.4312],
    'enriko': [41.9989, 21.4267],
    'toto daily bistro': [41.9978, 21.4334],
    'burgerslut centar': [41.9945, 21.4289],
    'burgerslut kisela voda': [41.9756, 21.4423],
    'celik': [41.9923, 21.4178],
};

async function addCoordinates(restaurants, apiKey) {
    const results = [];
    let savedAny = false;

    for (const r of restaurants) {
        if (r.latitude && r.longitude) { results.push(r); continue; }

        // Try hardcoded coords first (instant, no API needed)
        const key = r.name.toLowerCase();
        let found = false;
        for (const [k, coords] of Object.entries(SKOPJE_RESTAURANT_COORDS)) {
            if (key.includes(k) || k.includes(key)) {
                results.push({ ...r, latitude: coords[0], longitude: coords[1] });
                found = true;
                savedAny = true;
                break;
            }
        }
        if (found) continue;

        // Try Google geocoding as fallback
        if (apiKey) {
            try {
                const query = encodeURIComponent(r.name + ' Skopje Macedonia');
                const response = await axios.get(
                    `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${apiKey}`,
                    { timeout: 5000 }
                );
                if (response.data.results && response.data.results[0]) {
                    const loc = response.data.results[0].geometry.location;
                    results.push({ ...r, latitude: loc.lat, longitude: loc.lng });
                    savedAny = true;
                    continue;
                }
            } catch (e) {}
            await new Promise(res => setTimeout(res, 100));
        }
        results.push(r);
    }

    // Save coords back to korpa-data.json so we don't re-geocode next time
    if (savedAny) {
        try {
            const jsonPath = path.join(__dirname, 'korpa-data.json');
            if (fs.existsSync(jsonPath)) {
                fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
                console.log('Saved coordinates to korpa-data.json');
            }
        } catch (e) { console.error('Could not save coords:', e.message); }
    }

    return results;
}

console.log('\nRegistering routes...');

app.get('/api/health', (req, res) => {
    console.log('Health endpoint hit');
    res.json({ status: 'ok', message: 'InstaMeal backend is running' });
});
console.log('   ✓ GET /api/health');

app.post('/api/strava/token', async (req, res) => {
    console.log('Strava token endpoint hit');
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code is required' });
    }

    try {
        const response = await axios.post('https://www.strava.com/oauth/token', {
            client_id: STRAVA_CLIENT_ID,
            client_secret: STRAVA_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code'
        });

        res.json({
            access_token: response.data.access_token,
            refresh_token: response.data.refresh_token,
            expires_at: response.data.expires_at,
            athlete: response.data.athlete
        });

    } catch (error) {
        console.error('Error exchanging token:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to exchange authorization code',
            details: error.response?.data || error.message
        });
    }
});
console.log('   ✓ POST /api/strava/token');

app.get('/api/korpa/restaurants', async (req, res) => {
    console.log('Korpa restaurants endpoint hit!');

    try {
        if (cachedRestaurants &&
            cacheTimestamp &&
            Date.now() - cacheTimestamp < CACHE_DURATION) {
            console.log('Returning cached Korpa data');
            return res.json({
                success: true,
                cached: true,
                count: cachedRestaurants.length,
                restaurants: cachedRestaurants
            });
        }

        // Try to use korpa-data.json first (fast, no scraping needed)
        const jsonPath = path.join(__dirname, 'korpa-data.json');
        if (fs.existsSync(jsonPath)) {
            console.log('Loading from korpa-data.json...');
            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            if (jsonData && jsonData.length > 0) {
                cachedRestaurants = jsonData;
                cacheTimestamp = Date.now();
                console.log(`Loaded ${jsonData.length} restaurants from JSON`);
                // Add approximate Skopje coordinates if missing (for distance sorting)
                const withCoords = await addCoordinates(jsonData, GOOGLE_PLACES_API_KEY);
                cachedRestaurants = withCoords;
                cacheTimestamp = Date.now();
                return res.json({
                    success: true,
                    cached: false,
                    source: 'json',
                    count: withCoords.length,
                    restaurants: withCoords
                });
            }
        }

        console.log('Fetching fresh Korpa data (this takes ~30 seconds)...');

        const restaurants = await getKorpaData();

        if (!restaurants || restaurants.length === 0) {
            console.log('No restaurants found');
            return res.json({ success: false, error: 'No restaurants found', restaurants: [] });
        }

        cachedRestaurants = restaurants;
        cacheTimestamp = Date.now();

        res.json({
            success: true,
            cached: false,
            count: restaurants.length,
            restaurants: restaurants
        });

    } catch (error) {
        console.error('Korpa scraping error:', error.message);
        // Last resort: try the JSON file even on error
        try {
            const jsonPath = path.join(__dirname, 'korpa-data.json');
            if (fs.existsSync(jsonPath)) {
                const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                return res.json({ success: true, cached: false, source: 'json-fallback', count: jsonData.length, restaurants: jsonData });
            }
        } catch (e) {}
        res.status(500).json({ success: false, error: 'Failed to fetch restaurant data', details: error.message });
    }
});
console.log('   ✓ GET /api/korpa/restaurants');

app.post('/api/korpa/refresh', async (req, res) => {
    console.log('Cache refresh endpoint hit');

    try {
        console.log('Manually refreshing Korpa data...');

        cachedRestaurants = null;
        cacheTimestamp = null;

        const restaurants = await getKorpaData();

        if (restaurants && restaurants.length > 0) {
            cachedRestaurants = restaurants;
            cacheTimestamp = Date.now();
        }

        res.json({
            success: true,
            count: restaurants.length,
            restaurants: restaurants
        });

    } catch (error) {
        console.error('Error refreshing:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
console.log('   ✓ POST /api/korpa/refresh');

app.post('/api/places/nearby-restaurants', async (req, res) => {
    console.log('Google Places nearby restaurants endpoint hit');
    const { latitude, longitude, radius = 1000 } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and longitude are required' });
    }

    try {
        const response = await axios.get(
            'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
            {
                params: {
                    location: `${latitude},${longitude}`,
                    radius: radius,
                    type: 'restaurant',
                    key: GOOGLE_PLACES_API_KEY
                }
            }
        );

        const restaurants = response.data.results
            .slice(0, 5)  //Tuka se menuva kolku restorani da zema
            .map(place => ({
                name: place.name,
                address: place.vicinity,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                rating: place.rating,
                placeId: place.place_id,
                openNow: place.opening_hours?.open_now
            }));

        res.json({
            success: true,
            count: restaurants.length,
            restaurants: restaurants
        });

    } catch (error) {
        console.error('Google Places error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch restaurants',
            details: error.message
        });
    }
});
console.log('   ✓ POST /api/places/nearby-restaurants');

// ── LOCATION-SORTED KORPA (reads JSON, sorts by distance) ────────────────────
app.post('/api/korpa/restaurants-near', async (req, res) => {
    console.log('restaurants-near endpoint hit');
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
        return res.status(400).json({ success: false, error: 'lat/lon required', restaurants: [] });
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    try {
        const jsonPath = path.join(__dirname, 'korpa-data.json');
        if (!fs.existsSync(jsonPath)) {
            return res.status(404).json({ success: false, error: 'korpa-data.json not found', restaurants: [] });
        }
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Deduplicate by id/slug
        const seen = new Set();
        const unique = raw.filter(r => {
            const key = r.id || r.slug || r.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Only keep restaurants that have menus
        const withMenus = unique.filter(r => r.menu && r.menu.length > 0);
        const pool = withMenus.length > 0 ? withMenus : unique;

        const withCoords = await addCoordinates(pool, GOOGLE_PLACES_API_KEY);
        const sorted = withCoords
            .map(r => ({
                ...r,
                distanceKm: (r.latitude && r.longitude)
                    ? haversine(latitude, longitude, r.latitude, r.longitude)
                    : 999
            }))
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 10); // Top 10 closest only

        console.log(`Returning ${sorted.length} closest restaurants`);
        res.json({ success: true, count: sorted.length, restaurants: sorted });
    } catch (err) {
        console.error('restaurants-near error:', err.message);
        res.status(500).json({ success: false, error: err.message, restaurants: [] });
    }
});
console.log('   ✓ POST /api/korpa/restaurants-near');

// ── RESCRAPE: rebuild korpa-data.json cleanly ─────────────────────────────────
app.post('/api/korpa/rescrape', async (req, res) => {
    console.log('Rescrape endpoint hit - rebuilding korpa-data.json');
    try {
        const { scrapeKorpaRestaurants, scrapeRestaurantMenu } = require('./korpaScraper');
        const sleep = ms => new Promise(r => setTimeout(r, ms));

        const allRestaurants = await scrapeKorpaRestaurants();
        console.log(`Found ${allRestaurants.length} restaurants on Korpa`);

        const withMenus = [];
        const max = Math.min(20, allRestaurants.length);
        for (let i = 0; i < max; i++) {
            const r = allRestaurants[i];
            console.log(`[${i+1}/${max}] Scraping menu for ${r.name}`);
            const menuData = await scrapeRestaurantMenu(r.url);
            withMenus.push({
                id: r.slug,
                name: r.name,
                url: r.url,
                logo: r.logo || '',
                banner: r.banner || '',
                menu: menuData.allItems || [],
                menuCount: (menuData.allItems || []).length
            });
            if (i < max - 1) await sleep(3000);
        }

        const withCoords = await addCoordinates(withMenus, GOOGLE_PLACES_API_KEY);
        const jsonPath = path.join(__dirname, 'korpa-data.json');
        fs.writeFileSync(jsonPath, JSON.stringify(withCoords, null, 2));
        cachedRestaurants = null; // Clear cache
        console.log(`Rescrape done. Saved ${withCoords.length} restaurants.`);
        res.json({ success: true, count: withCoords.length, restaurants: withCoords });
    } catch (err) {
        console.error('Rescrape error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});
console.log('   ✓ POST /api/korpa/rescrape');

app.post('/api/recommend-meals', async (req, res) => {
    console.log('Meal recommendation endpoint hit');
    const { userContext, meals } = req.body;

    if (!userContext || !meals || meals.length === 0) {
        return res.status(400).json({ error: 'userContext and meals are required' });
    }

    const mealList = meals.map((m, i) =>
        `${i + 1}. ${m.name}${m.restaurant ? ' (at ' + m.restaurant + ')' : ''}`
    ).join('\n');

    const prompt = `
You are a smart food recommendation assistant.
${userContext}

Available meals:
${mealList}

Return ONLY valid JSON in this format:
{
  "recommendations": [
    { "meal": "meal name", "reason": "short explanation" }
  ]
}
Return top 3 meals only.
`;

    try {
        const ollamaResponse = await axios.post('http://localhost:11434/api/generate', {
            model: 'llama3:8b',
            prompt: prompt,
            stream: false,
            format: 'json'
        }, { timeout: 60000 });

        const raw = ollamaResponse.data.response;
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            const start = raw.indexOf('{');
            const end = raw.lastIndexOf('}');
            parsed = JSON.parse(raw.slice(start, end + 1));
        }

        res.json({ success: true, recommendations: parsed.recommendations });
    } catch (error) {
        console.error('Ollama error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get recommendations' });
    }
});
console.log('   ✓ POST /api/recommend-meals');

console.log('\nAll routes registered!\n');

app.listen(PORT, () => {
    console.log(`${'='.repeat(50)}`);
    console.log(`InstaMeal Backend Server`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log(`Restaurants: http://localhost:${PORT}/api/korpa/restaurants`);
    console.log(`Refresh: POST http://localhost:${PORT}/api/korpa/refresh`);
    console.log(`${'='.repeat(50)}\n`);

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
        console.warn('Strava credentials not found in .env\n');
    }

    console.log('Server ready! Watching for requests...\n');
});
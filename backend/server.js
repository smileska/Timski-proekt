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

        console.log('Fetching fresh Korpa data (this takes ~30 seconds)...');

        const restaurants = await getKorpaData();

        if (!restaurants || restaurants.length === 0) {
            console.log('⚠No restaurants found');
            return res.json({
                success: false,
                error: 'No restaurants found',
                restaurants: []
            });
        }

        cachedRestaurants = restaurants;
        cacheTimestamp = Date.now();

        console.log(`Cached ${restaurants.length} restaurants`);

        res.json({
            success: true,
            cached: false,
            count: restaurants.length,
            restaurants: restaurants
        });

    } catch (error) {
        console.error('Korpa scraping error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch restaurant data',
            details: error.message
        });
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
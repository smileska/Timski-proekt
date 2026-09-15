const express = require('express');
const axios = require('axios');

const router = express.Router();

// Small in-memory cache — Nominatim asks for <= 1 req/s and no hammering.
const cache = new Map();
const TTL = 60 * 60 * 1000;

router.get('/reverse', async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ error: 'lat and lon are required' });
    }

    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < TTL) return res.json(hit.v);

    try {
        const { data } = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat, lon, format: 'jsonv2', zoom: 16, addressdetails: 1 },
            headers: { 'User-Agent': 'FitFuel/1.0 (nutrition app; local dev)' },
            timeout: 6000,
        });
        const a = data.address || {};
        const suburb =
            a.neighbourhood || a.suburb || a.quarter || a.city_district || a.village || null;
        const city = a.city || a.town || a.municipality || a.state || null;
        const label = [suburb, city].filter(Boolean).join(', ') || data.display_name || null;
        const value = { label, suburb, city, raw: data.display_name || null };
        cache.set(key, { t: Date.now(), v: value });
        res.json(value);
    } catch (err) {
        console.error('[geo] reverse geocode failed:', err.message);
        res.status(502).json({ error: 'Reverse geocoding unavailable', label: null });
    }
});

module.exports = router;

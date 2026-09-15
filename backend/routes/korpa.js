// Restaurant discovery endpoints. "korpa" is kept in the path for backwards
// compatibility, but results now come from Wolt (live, location-aware) + the
// local Korpa.mk list, via lib/restaurants.
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const { getKorpaData } = require('../korpaScraper');
const { getNearby, SERVED_CITIES } = require('../lib/restaurants');

const JSON_PATH = path.join(__dirname, '..', 'korpa-data.json');

// ── Nearest restaurants to a point (Wolt + in-range Korpa) ──────────────────
router.post('/restaurants-near', async (req, res) => {
    const { latitude, longitude, withMenus = false } = req.body || {};
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return res
            .status(400)
            .json({ success: false, error: 'latitude/longitude required', restaurants: [] });
    }
    try {
        const result = await getNearby(latitude, longitude, { withMenus: Boolean(withMenus) });
        res.json({
            success: true,
            count: result.restaurants.length,
            noService: result.noService,
            servedCities: result.servedCities,
            sources: result.sources,
            restaurants: result.restaurants,
        });
    } catch (err) {
        console.error('[restaurants] near error:', err.message);
        res.status(500).json({ success: false, error: err.message, restaurants: [] });
    }
});

// ── Full Korpa list (no location filter — used only as an explicit browse) ───
router.get('/restaurants', (_req, res) => {
    try {
        const raw = fs.existsSync(JSON_PATH) ? JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')) : [];
        res.json({ success: raw.length > 0, restaurants: raw, servedCities: SERVED_CITIES });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, restaurants: [] });
    }
});

// ── Re-scrape the Korpa list ───────────────────────────────────────────────
router.post('/refresh', async (_req, res) => {
    try {
        const restaurants = await getKorpaData();
        res.json({ success: true, count: restaurants.length, restaurants });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

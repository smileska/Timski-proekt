// Run ONCE from your project folder: node reset-and-rescrape.js
// Scrapes menus for 20 known restaurants, preserving existing logos/banners.

const fs = require('fs');
const path = require('path');

const KNOWN_RESTAURANTS = [
    { id: 'burgerslut-kisela-voda', name: 'Burgerslut Kisela Voda', url: 'https://korpa.mk/partner/burgerslut-kisela-voda', latitude: 41.9756, longitude: 21.4423 },
    { id: 'burgerslut-centar', name: 'Burgerslut Centar', url: 'https://korpa.mk/partner/burgerslut-centar', latitude: 41.9945, longitude: 21.4289 },
    { id: 'star-ocean-centar', name: 'Star Ocean - Centar', url: 'https://korpa.mk/partner/star-ocean-centar', latitude: 41.9957, longitude: 21.4312 },
    { id: 'star-ocean-city-mall', name: 'Star Ocean - City Mall', url: 'https://korpa.mk/partner/star-ocean-city-mall', latitude: 41.9701, longitude: 21.4401 },
    { id: 'star-ocean-east-gate-mall', name: 'Star Ocean - East Gate Mall', url: 'https://korpa.mk/partner/star-ocean-east-gate-mall', latitude: 41.9875, longitude: 21.5012 },
    { id: 'star-ocean-ramstore-mall', name: 'Star Ocean - Ramstore Mall', url: 'https://korpa.mk/partner/star-ocean-ramstore-mall', latitude: 42.0012, longitude: 21.4089 },
    { id: 'gostilnica-dukat', name: 'Gostilnica Dukat', url: 'https://korpa.mk/partner/gostilnica-dukat', latitude: 41.9962, longitude: 21.4316 },
    { id: 'fat-kitchen-bistro', name: 'Fat Kitchen Bistro', url: 'https://korpa.mk/partner/fat-kitchen-bistro', latitude: 41.9971, longitude: 21.4289 },
    { id: 'sushico-debar-maalo', name: 'SushiCo Debar Maalo', url: 'https://korpa.mk/partner/sushico-debar-maalo', latitude: 41.9934, longitude: 21.4198 },
    { id: 'sushico-zen', name: 'SushiCo Zen', url: 'https://korpa.mk/partner/sushico-zen', latitude: 42.0045, longitude: 21.4102 },
    { id: 'teteks-karposh', name: 'Teteks - Karposh', url: 'https://korpa.mk/partner/teteks-karposh', latitude: 42.0021, longitude: 21.3987 },
    { id: 'teteks-centar', name: 'Teteks - Centar', url: 'https://korpa.mk/partner/teteks-centar', latitude: 41.9957, longitude: 21.4312 },
    { id: 'teteks-gjorce-petrov', name: 'Teteks - Gjorce Petrov', url: 'https://korpa.mk/partner/teteks-gjorce-petrov', latitude: 41.9912, longitude: 21.3845 },
    { id: 'amigos-zeleznicka', name: 'Amigos Zeleznicka', url: 'https://korpa.mk/partner/amigos-zeleznicka', latitude: 41.9977, longitude: 21.4305 },
    { id: 'amigos-ljubljanska', name: 'Amigos Ljubljanska', url: 'https://korpa.mk/partner/amigos-ljubljanska', latitude: 41.9965, longitude: 21.4201 },
    { id: 'royal-burger-novo-lisice', name: 'Royal Burger Novo Lisice', url: 'https://korpa.mk/partner/royal-burger-novo-lisice', latitude: 41.9821, longitude: 21.4687 },
    { id: 'royal-burger-debar-maalo', name: 'Royal Burger Debar Maalo', url: 'https://korpa.mk/partner/royal-burger-debar-maalo', latitude: 41.9934, longitude: 21.4198 },
    { id: 'enriko', name: 'Enriko', url: 'https://korpa.mk/partner/enriko', latitude: 41.9989, longitude: 21.4267 },
    { id: 'toto-daily-bistro', name: 'Toto Daily Bistro', url: 'https://korpa.mk/partner/toto-daily-bistro', latitude: 41.9978, longitude: 21.4334 },
    { id: 'celik', name: 'Celik', url: 'https://korpa.mk/partner/celik', latitude: 41.9923, longitude: 21.4178 },
];

async function main() {
    const { scrapeRestaurantMenu } = require('./korpaScraper');
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Load existing data to preserve logos/banners
    const jsonPath = path.join(__dirname, 'korpa-data.json');
    let existingData = [];
    if (fs.existsSync(jsonPath)) {
        existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    }
    const existingBySlug = {};
    for (const r of existingData) {
        const key = r.slug || r.id || '';
        if (key) existingBySlug[key] = r;
    }

    console.log('Rescraping menus for', KNOWN_RESTAURANTS.length, 'restaurants...\n');
    const results = [];

    for (let i = 0; i < KNOWN_RESTAURANTS.length; i++) {
        const r = KNOWN_RESTAURANTS[i];
        const existing = existingBySlug[r.slug] || {};
        console.log(`[${i+1}/${KNOWN_RESTAURANTS.length}] ${r.name}`);
        try {
            const menuData = await scrapeRestaurantMenu(r.url);
            const items = menuData.allItems || [];
            results.push({
                id: r.slug, slug: r.slug, name: r.name, url: r.url,
                logo: existing.logo || '',     // preserved from existing
                banner: existing.banner || '', // preserved from existing
                menu: items, menuCount: items.length,
                latitude: r.latitude, longitude: r.longitude,
            });
            console.log(`  → ${items.length} menu items`);
        } catch(e) {
            console.log(`  → FAILED: ${e.message}`);
            results.push({
                id: r.slug, slug: r.slug, name: r.name, url: r.url,
                logo: existing.logo || '', banner: existing.banner || '',
                menu: [], menuCount: 0,
                latitude: r.latitude, longitude: r.longitude,
            });
        }
        if (i < KNOWN_RESTAURANTS.length - 1) await sleep(3000);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nDone! Saved ${results.length} restaurants to korpa-data.json`);
    console.log('With menus:', results.filter(r => r.menu.length > 0).length);
    console.log('With logos:', results.filter(r => r.logo).length);
}

main().catch(console.error);
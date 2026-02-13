const puppeteer = require('puppeteer');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeKorpaRestaurants(city = 'skopje') {
    console.log('Starting InstaMeal Korpa.mk scraper...');
    console.log('Using rate limiting to be respectful');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        await page.setUserAgent(
            'InstaMeal/1.0 (Educational Project; Contact: )'
        );

        console.log('Loading Korpa.mk...');
        await page.goto('https://korpa.mk/', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await sleep(2000);

        const restaurants = await page.evaluate(() => {
            const results = [];

            const restaurantItems = document.querySelectorAll('.item');

            restaurantItems.forEach(item => {
                try {
                    const linkElement = item.querySelector('a[href^="/partner/"]');
                    if (!linkElement) return;

                    const link = linkElement.getAttribute('href');

                    const nameElement = item.querySelector('.list-card-body h6.mb-1 a');
                    const name = nameElement ? nameElement.textContent.trim() : '';

                    if (!name || !link) return;

                    const logoDiv = item.querySelector('.logores');
                    let logoUrl = '';
                    if (logoDiv) {
                        const bgImage = logoDiv.style.backgroundImage;
                        const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (match) logoUrl = match[1];
                    }

                    const bannerDiv = item.querySelector('.slikares');
                    let bannerUrl = '';
                    if (bannerDiv) {
                        const bgImage = bannerDiv.style.backgroundImage;
                        const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (match) bannerUrl = match[1];
                    }

                    results.push({
                        name: name,
                        slug: link.replace('/partner/', ''),
                        url: `https://korpa.mk${link}`,
                        logo: logoUrl,
                        banner: bannerUrl
                    });

                } catch (err) {
                    console.error('Error parsing restaurant:', err.message);
                }
            });

            return results;
        });

        console.log(`Found ${restaurants.length} restaurants`);

        await browser.close();
        return restaurants;

    } catch (error) {
        console.error('Error scraping Korpa homepage:', error.message);
        await browser.close();
        return [];
    }
}

async function scrapeRestaurantMenu(restaurantUrl) {
    console.log(`Scraping menu from: ${restaurantUrl}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        await page.setUserAgent(
            'InstaMeal/1.0 (Educational Project; Contact: your-email@example.com)'
        );

        await sleep(3000);

        await page.goto(restaurantUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        await sleep(2000);

        const menuData = await page.evaluate(() => {
            const data = {
                restaurantName: '',
                categories: [],
                allItems: []
            };

            const nameElement = document.querySelector('h1, .restaurant-name, .vendor-name');
            if (nameElement) {
                data.restaurantName = nameElement.textContent.trim();
            }

            const possibleItemSelectors = [
                '.menu-item',
                '.product-item',
                '.gold-members',
                '[class*="item-"]',
                '.list-card'
            ];

            let foundItems = false;

            for (const selector of possibleItemSelectors) {
                const items = document.querySelectorAll(selector);

                if (items.length > 5) {
                    console.log(`Found ${items.length} items with selector: ${selector}`);
                    foundItems = true;

                    items.forEach(item => {
                        try {
                            let name = '';
                            const nameSelectors = ['h6', 'h5', '.item-name', '.product-name', '.title'];
                            for (const ns of nameSelectors) {
                                const el = item.querySelector(ns);
                                if (el && el.textContent.trim()) {
                                    name = el.textContent.trim();
                                    break;
                                }
                            }

                            let price = '';
                            const priceSelectors = ['.price', '[class*="price"]', '.amount'];
                            for (const ps of priceSelectors) {
                                const el = item.querySelector(ps);
                                if (el && el.textContent.trim()) {
                                    price = el.textContent.trim();
                                    break;
                                }
                            }

                            let description = '';
                            const descEl = item.querySelector('p, .description, .item-description');
                            if (descEl) {
                                description = descEl.textContent.trim();
                            }

                            if (name) {
                                data.allItems.push({
                                    name: name,
                                    price: price || '0',
                                    description: description
                                });
                            }
                        } catch (err) {
                        }
                    });

                    break;
                }
            }

            if (!foundItems) {
                console.log('No menu items found with standard selectors');
            }

            return data;
        });

        await browser.close();

        console.log(`Scraped ${menuData.allItems.length} menu items`);
        return menuData;

    } catch (error) {
        console.error('Error scraping menu:', error.message);
        await browser.close();
        return { restaurantName: '', allItems: [] };
    }
}


async function getKorpaData() {
    try {
        console.log('\nStarting InstaMeal Korpa.mk data collection...\n');

        const restaurants = await scrapeKorpaRestaurants();

        if (restaurants.length === 0) {
            console.log('No restaurants found. Selectors may need updating.');
            return [];
        }

        console.log(`\nFound ${restaurants.length} restaurants`);
        console.log('Fetching menus (limited to 3 to be respectful)...\n');

        const restaurantsWithMenus = [];
        const maxRestaurants = Math.min(3, restaurants.length);

        for (let i = 0; i < maxRestaurants; i++) {
            const restaurant = restaurants[i];
            console.log(`[${i + 1}/${maxRestaurants}] Processing: ${restaurant.name}`);

            const menuData = await scrapeRestaurantMenu(restaurant.url);

            restaurantsWithMenus.push({
                id: restaurant.slug,
                name: restaurant.name,
                url: restaurant.url,
                logo: restaurant.logo,
                banner: restaurant.banner,
                menu: menuData.allItems,
                menuCount: menuData.allItems.length
            });

            if (i < maxRestaurants - 1) {
                console.log('Waiting 5 seconds before next request...\n');
                await sleep(5000);
            }
        }

        console.log('\nData collection complete!');
        return restaurantsWithMenus;

    } catch (error) {
        console.error('Fatal error:', error.message);
        return [];
    }
}

async function getMenusForRestaurants(restaurantNames) {
    try {
        console.log(`\nSearching for ${restaurantNames.length} restaurants on Korpa...\n`);

        const restaurantsWithMenus = [];

        for (let i = 0; i < restaurantNames.length; i++) {
            const restaurantName = restaurantNames[i];
            console.log(`[${i + 1}/${restaurantNames.length}] Searching for: ${restaurantName}`);

            try {

                const searchUrl = `https://korpa.mk/search?q=${encodeURIComponent(restaurantName)}`;
                const menuData = await scrapeRestaurantMenu(searchUrl);

                if (menuData.allItems.length > 0) {
                    restaurantsWithMenus.push({
                        name: restaurantName,
                        url: searchUrl,
                        menu: menuData.allItems,
                        menuCount: menuData.allItems.length
                    });

                    console.log(`Found ${menuData.allItems.length} menu items\n`);
                }

                if (i < restaurantNames.length - 1) {
                    await sleep(3000); //
                }

            } catch (error) {
                console.error(`Failed to scrape ${restaurantName}:`, error.message);
            }
        }

        console.log('Search complete!');
        return restaurantsWithMenus;

    } catch (error) {
        console.error('Error searching restaurants:', error.message);
        return [];
    }
}

module.exports = {
    scrapeKorpaRestaurants,
    scrapeRestaurantMenu,
    getKorpaData,
    getMenusForRestaurants
};

if (require.main === module) {
    console.log('Testing InstaMeal Korpa scraper...\n');

    getKorpaData().then(data => {
        console.log('\n' + '='.repeat(50));
        console.log('RESULTS SUMMARY');
        console.log('='.repeat(50));

        data.forEach((restaurant, index) => {
            console.log(`\n${index + 1}. ${restaurant.name}`);
            console.log(`   URL: ${restaurant.url}`);
            console.log(`   Menu Items: ${restaurant.menuCount}`);
            console.log(`   Has Logo: ${restaurant.logo ? '✅' : '❌'}`);
            console.log(`   Has Banner: ${restaurant.banner ? '✅' : '❌'}`);

            if (restaurant.menu.length > 0) {
                console.log(`   Sample Items:`);
                restaurant.menu.slice(0, 3).forEach(item => {
                    console.log(`      - ${item.name} (${item.price})`);
                });
            }
        });

        console.log('\n' + '='.repeat(50));
        console.log(`Total restaurants: ${data.length}`);
        console.log('='.repeat(50) + '\n');

        const fs = require('fs');
        fs.writeFileSync(
            'korpa-data.json',
            JSON.stringify(data, null, 2)
        );
        console.log('Data saved to: korpa-data.json\n');
    });
}
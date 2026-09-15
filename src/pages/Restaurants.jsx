import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useLocation as useGeo } from '../context/LocationContext';
import RestaurantCard from '../components/RestaurantCard';

const FAV_KEY = 'fitfuel_favourites';

export default function Restaurants() {
    const { coords, label, status } = useGeo();
    const [data, setData] = useState(null);
    const [restrictions, setRestrictions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [favourites, setFavourites] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
        } catch {
            return [];
        }
    });

    const toggleFavourite = (id) => {
        setFavourites((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            localStorage.setItem(FAV_KEY, JSON.stringify(next));
            return next;
        });
    };

    const load = useCallback(async () => {
        if (!coords) return;
        setLoading(true);
        setError(null);
        try {
            const prof = await api.get('/api/profile').catch(() => ({ dietary: [] }));
            setRestrictions(prof.dietary || []);
            const near = await api.post('/api/korpa/restaurants-near', {
                latitude: coords.lat,
                longitude: coords.lon,
                withMenus: true,
            });
            setData(near);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [coords]);

    useEffect(() => {
        load();
    }, [load]);

    const restaurants = data?.restaurants || [];
    const favs = restaurants.filter((r) => favourites.includes(r.id || r.slug || r.name));
    const rest = restaurants.filter((r) => !favourites.includes(r.id || r.slug || r.name));

    return (
        <main className="container stack">
            <div>
                <div className="page-title">Restaurants near you</div>
                <div className="page-sub">
                    {status === 'ready' && label
                        ? `Around ${label}`
                        : status === 'denied'
                          ? 'Turn on location to see what delivers to you'
                          : 'Finding your location…'}
                </div>
            </div>

            {status === 'denied' && (
                <div className="banner amber">
                    Location is blocked. Click the 🔒 icon next to the address bar → Location → Allow → reload.
                </div>
            )}
            {error && <div className="banner red">{error}</div>}
            {loading && <div className="center" style={{ padding: 30 }}><div className="spin" /></div>}

            {!loading && data?.noService && (
                <div className="banner amber">
                    No delivery service reaches your area yet. Wolt and Korpa.mk currently cover{' '}
                    <strong>{(data.servedCities || []).join(', ')}</strong>. Everything else in the app
                    (targets, workouts, AI guidance) still works — you just won't get one-tap ordering here.
                </div>
            )}

            {!loading && !data?.noService && restaurants.length === 0 && (
                <div className="banner">No open restaurants found right now. Try again shortly.</div>
            )}

            {!loading && favs.length > 0 && (
                <section className="stack">
                    <h3 style={{ fontSize: 14, color: 'var(--brand-700)' }}>❤️ Favourites</h3>
                    {favs.map((r) => (
                        <RestaurantCard
                            key={r.id || r.slug || r.name}
                            restaurant={r}
                            restrictions={restrictions}
                            isFavourite
                            onToggleFavourite={toggleFavourite}
                        />
                    ))}
                </section>
            )}

            {!loading && rest.map((r) => (
                <RestaurantCard
                    key={r.id || r.slug || r.name}
                    restaurant={r}
                    restrictions={restrictions}
                    isFavourite={false}
                    onToggleFavourite={toggleFavourite}
                />
            ))}
        </main>
    );
}

import { useState } from 'react';
import { itemIsBlocked } from '../data/constants';

export default function RestaurantCard({ restaurant, restrictions, isFavourite, onToggleFavourite }) {
    const [expanded, setExpanded] = useState(false);
    const menu = restaurant.menu || [];
    const visible = menu.filter((item) => !itemIsBlocked(item, restrictions));
    const hidden = menu.length - visible.length;
    const shown = expanded ? visible : visible.slice(0, 4);
    const restId = restaurant.id || restaurant.slug || restaurant.name;

    const distance =
        restaurant.distanceKm != null
            ? restaurant.distanceKm < 1
                ? `${Math.round(restaurant.distanceKm * 1000)} m`
                : `${restaurant.distanceKm.toFixed(1)} km`
            : null;

    return (
        <div className="card" style={{ padding: 14, borderColor: isFavourite ? 'var(--brand-400)' : undefined }}>
            <div className="row spread" style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                    <div className="row wrap" style={{ gap: 6 }}>
                        <strong style={{ fontSize: 15 }}>{restaurant.name}</strong>
                        <span className={`chip ${restaurant.source === 'wolt' ? '' : 'gray'}`} style={{ fontSize: 10 }}>
                            {restaurant.source === 'wolt' ? 'Wolt' : 'Korpa'}
                        </span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                        {distance && <>📍 {distance}</>}
                        {restaurant.deliveryEstimateMin ? ` · ~${restaurant.deliveryEstimateMin} min` : ''}
                        {restaurant.rating ? ` · ⭐ ${restaurant.rating}` : ''}
                        {menu.length > 0 && ` · ${visible.length} item${visible.length === 1 ? '' : 's'}`}
                        {hidden > 0 && <span style={{ color: 'var(--accent-red)' }}> · {hidden} hidden</span>}
                    </div>
                    {restaurant.address && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{restaurant.address}</div>
                    )}
                </div>
                <button
                    className="btn sm subtle"
                    title={isFavourite ? 'Remove favourite' : 'Save favourite'}
                    onClick={() => onToggleFavourite(restId)}
                >
                    {isFavourite ? '❤️' : '🤍'}
                </button>
            </div>

            {menu.length > 0 && visible.length === 0 && (
                <div className="banner red" style={{ marginTop: 10 }}>All items clash with your dietary settings.</div>
            )}

            {visible.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    {shown.map((item, i) => (
                        <div key={i} className="row spread" style={{ padding: '5px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 13 }}>{item.name}</span>
                            {item.price && item.price !== '0' && (
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand-600)', flexShrink: 0 }}>{item.price}</span>
                            )}
                        </div>
                    ))}
                    {visible.length > 4 && (
                        <button className="btn sm subtle" style={{ width: '100%', marginTop: 8 }} onClick={() => setExpanded((v) => !v)}>
                            {expanded ? 'Show less' : `Show all ${visible.length}`}
                        </button>
                    )}
                </div>
            )}

            {restaurant.url && (
                <a className="btn gradient block sm" style={{ marginTop: 10 }} href={restaurant.url} target="_blank" rel="noreferrer">
                    Order on {restaurant.source === 'wolt' ? 'Wolt' : 'Korpa.mk'} →
                </a>
            )}
        </div>
    );
}

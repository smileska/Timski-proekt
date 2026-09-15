import { useState } from 'react';
import { api } from '../api/client';

function Macros({ m }) {
    if (!m) return null;
    return (
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
            {m.calories != null && <span className="chip gray">{m.calories} kcal</span>}
            {m.protein_g != null && <span className="chip">P {m.protein_g}g</span>}
            {m.carb_g != null && <span className="chip gray">C {m.carb_g}g</span>}
            {m.fat_g != null && <span className="chip gray">F {m.fat_g}g</span>}
        </div>
    );
}

function Personalization({ p }) {
    if (!p) return null;
    const bits = [];
    if (p.goal) bits.push(`goal: ${p.goal}`);
    if (p.dietaryRestrictions?.length) {
        bits.push(`${p.dietaryRestrictions.length} dietary restriction${p.dietaryRestrictions.length === 1 ? '' : 's'}`);
    }
    if (p.healthMarkers?.length) bits.push(`${p.healthMarkers.length} lab report${p.healthMarkers.length === 1 ? '' : 's'}`);

    return (
        <div className="banner" style={{ fontSize: 12 }}>
            <strong>Personalized using:</strong> {bits.length ? bits.join(' · ') : 'no profile signals yet'}
            {p.foodPreferences && (
                <div style={{ marginTop: 4 }}>
                    🍽️ Your stated preference: <em>“{p.foodPreferences}”</em>
                </div>
            )}
            {p.healthMarkers?.map((h, i) => (
                <div key={i} style={{ marginTop: 4 }}>
                    🩸 From your {h.type} report: <em>“{h.summary}”</em>
                </div>
            ))}
        </div>
    );
}

export default function RecommendationList({ result, onLogged }) {
    const [logged, setLogged] = useState({});

    if (!result) return null;
    const { dailySummary, recommendations = [], meta, personalization } = result;

    async function logMeal(rec, idx) {
        try {
            await api.post('/api/recommend-meals/log-meal', {
                name: rec.meal,
                restaurant: rec.restaurant,
                calories: rec.macros?.calories,
                protein_g: rec.macros?.protein_g,
                carb_g: rec.macros?.carb_g,
                fat_g: rec.macros?.fat_g,
            });
            setLogged((l) => ({ ...l, [idx]: true }));
            onLogged?.();
        } catch {
            /* ignore */
        }
    }

    return (
        <div className="stack">
            <Personalization p={personalization} />
            {dailySummary && <div className="banner">{dailySummary}</div>}

            {recommendations.length === 0 && (
                <p className="muted center">No matching meals right now — try adjusting your dietary filters.</p>
            )}

            {meta?.model && (
                <p className="muted" style={{ fontSize: 11 }}>
                    Ranked by {meta.provider === 'ollama' ? 'local model' : 'Claude'} · {meta.model} · {meta.candidates} nearby items
                </p>
            )}

            {recommendations.map((rec, idx) => (
                <div key={idx} className={`rec${idx === 0 ? ' top' : ''}`}>
                    <div className="rank">{idx + 1}</div>
                    <div className="grow">
                        <div className="row spread wrap" style={{ gap: 6 }}>
                            <strong style={{ fontSize: 14 }}>{rec.meal}</strong>
                            {idx === 0 && <span className="chip">Top pick</span>}
                        </div>
                        {rec.restaurant && (
                            <div style={{ fontSize: 12, marginTop: 2 }}>
                                <span className="muted">🏪 {rec.restaurant}</span>
                                {rec.distance && <span className="muted"> · {rec.distance}</span>}
                                {rec.price && <span className="muted"> · {rec.price}</span>}
                            </div>
                        )}
                        <p className="card-hint" style={{ marginTop: 5 }}>{rec.why}</p>
                        <Macros m={rec.macros} />
                        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
                            {rec.restaurantUrl && (
                                <a className="btn sm gradient" href={rec.restaurantUrl} target="_blank" rel="noreferrer">
                                    Order on {rec.via === 'wolt' ? 'Wolt' : rec.via === 'korpa' ? 'Korpa.mk' : 'delivery'} →
                                </a>
                            )}
                            <button
                                className="btn sm subtle"
                                disabled={logged[idx]}
                                onClick={() => logMeal(rec, idx)}
                            >
                                {logged[idx] ? '✓ Logged' : 'I ate this'}
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

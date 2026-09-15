import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
}

export default function MealHistory() {
    const [meals, setMeals] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api
            .get(`/api/recommend-meals/meal-log?from=${isoDaysAgo(30)}`)
            .then((res) => setMeals(res.meals || []))
            .catch((err) => setError(err.message));
    }, []);

    const byDate = useMemo(() => {
        if (!meals) return [];
        const groups = new Map();
        for (const m of meals) {
            if (!groups.has(m.date)) groups.set(m.date, []);
            groups.get(m.date).push(m);
        }
        return [...groups.entries()].map(([date, items]) => ({
            date,
            items,
            totals: items.reduce(
                (acc, m) => ({
                    calories: acc.calories + (m.calories || 0),
                    protein_g: acc.protein_g + (m.protein_g || 0),
                    carb_g: acc.carb_g + (m.carb_g || 0),
                    fat_g: acc.fat_g + (m.fat_g || 0),
                }),
                { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 }
            ),
        }));
    }, [meals]);

    return (
        <main className="container stack">
            <div>
                <div className="page-title">Meal history</div>
                <div className="page-sub">Everything you've logged over the last 30 days.</div>
            </div>

            {error && <div className="banner red">{error}</div>}
            {!meals && !error && <div className="center" style={{ padding: 30 }}><div className="spin" /></div>}

            {meals && byDate.length === 0 && (
                <div className="banner">
                    Nothing logged yet. Head to <Link to="/dashboard">your dashboard</Link> and try "I ate this" on a pick.
                </div>
            )}

            {byDate.map(({ date, items, totals }) => (
                <section key={date} className="card">
                    <div className="card-head">
                        <h3>{new Date(date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
                        <span className="chip">{Math.round(totals.calories)} kcal</span>
                    </div>
                    <div className="stat-grid" style={{ marginBottom: 12 }}>
                        <div className="stat">
                            <div className="s-label">Protein</div>
                            <div className="s-value">{Math.round(totals.protein_g)}g</div>
                        </div>
                        <div className="stat">
                            <div className="s-label">Carbs</div>
                            <div className="s-value">{Math.round(totals.carb_g)}g</div>
                        </div>
                        <div className="stat">
                            <div className="s-label">Fat</div>
                            <div className="s-value">{Math.round(totals.fat_g)}g</div>
                        </div>
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                        {items.map((m) => (
                            <div key={m.id} className="row spread" style={{ fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                                <span>
                                    {m.name}
                                    {m.restaurant && <span className="muted"> · {m.restaurant}</span>}
                                </span>
                                <span className="muted">{m.calories ? `${Math.round(m.calories)} kcal` : ''}</span>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </main>
    );
}

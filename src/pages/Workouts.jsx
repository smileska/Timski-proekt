import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const TYPES = ['Run', 'Ride', 'Swim', 'Gym', 'Strength', 'HIIT', 'Yoga', 'Walk', 'Football', 'Other'];

function toLocalInput(d) {
    const t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 16);
}

export default function Workouts() {
    const { connections } = useAuth();
    const [workouts, setWorkouts] = useState([]);
    const [msg, setMsg] = useState(null);
    const [importing, setImporting] = useState(null);

    const [form, setForm] = useState({
        type: 'Run',
        start_time: toLocalInput(new Date()),
        duration_min: '',
        distance_km: '',
        intensity: 'moderate',
        calories: '',
    });
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const load = useCallback(async () => {
        const w = await api.get('/api/workouts');
        setWorkouts(w.workouts || []);
    }, []);

    useEffect(() => {
        load().catch(() => {});
    }, [load]);

    async function add(e) {
        e.preventDefault();
        setMsg(null);
        try {
            await api.post('/api/workouts', {
                ...form,
                start_time: new Date(form.start_time).toISOString(),
            });
            setForm((f) => ({ ...f, duration_min: '', distance_km: '', calories: '' }));
            load();
        } catch (err) {
            setMsg(err.message);
        }
    }

    async function remove(id) {
        await api.del(`/api/workouts/${id}`);
        load();
    }

    async function importFrom(provider) {
        setImporting(provider);
        setMsg(null);
        try {
            const res = await api.get(`/api/workouts/import/${provider}`);
            setMsg(`Imported ${res.imported} workout${res.imported === 1 ? '' : 's'} from ${provider}.`);
            setWorkouts(res.workouts || []);
        } catch (err) {
            const detail = err.data?.googleError ? ` (${err.data.googleError})` : '';
            setMsg((err.message || `Could not import from ${provider}.`) + detail);
        } finally {
            setImporting(null);
        }
    }

    const hasGoogle = connections.includes('google');

    const weekTotals = useMemo(() => {
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        const recent = workouts.filter((w) => new Date(w.start_time).getTime() >= cutoff && new Date(w.start_time).getTime() <= Date.now());
        return recent.reduce(
            (acc, w) => ({
                count: acc.count + 1,
                duration: acc.duration + (w.duration_min || 0),
                calories: acc.calories + (w.calories || 0),
            }),
            { count: 0, duration: 0, calories: 0 }
        );
    }, [workouts]);

    return (
        <main className="container stack">
            <div>
                <div className="page-title">Workouts</div>
                <div className="page-sub">Log training manually, or pull it in automatically.</div>
            </div>

            {msg && <div className="banner">{msg}</div>}

            <section className="card">
                <div className="card-head"><h3>This week</h3></div>
                <div className="stat-grid">
                    <div className="stat">
                        <div className="s-label">Workouts</div>
                        <div className="s-value">{weekTotals.count}</div>
                    </div>
                    <div className="stat">
                        <div className="s-label">Duration</div>
                        <div className="s-value">{weekTotals.duration}<span style={{ fontSize: 12 }}> min</span></div>
                    </div>
                    <div className="stat">
                        <div className="s-label">Calories burned</div>
                        <div className="s-value">{weekTotals.calories}</div>
                    </div>
                </div>
            </section>

            <section className="card">
                <div className="card-head"><h3>Import</h3></div>
                <div className="row wrap">
                    <button className="btn subtle" disabled={importing === 'google'} onClick={() => importFrom('google')}>
                        {importing === 'google' ? 'Importing…' : `📅 Google Calendar${hasGoogle ? '' : ' (connect)'}`}
                    </button>
                </div>
                <p className="card-hint" style={{ marginTop: 8 }}>
                    Google Calendar reads workout-like events in the next 48h, or log training manually below.
                </p>
            </section>

            <section className="card">
                <div className="card-head"><h3>Log a workout</h3></div>
                <form className="stack" onSubmit={add}>
                    <div className="grid-2">
                        <div className="field">
                            <label>Type</label>
                            <select value={form.type} onChange={set('type')}>
                                {TYPES.map((t) => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label>When</label>
                            <input type="datetime-local" value={form.start_time} onChange={set('start_time')} />
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="field">
                            <label>Duration (min)</label>
                            <input type="number" inputMode="numeric" value={form.duration_min} onChange={set('duration_min')} />
                        </div>
                        <div className="field">
                            <label>Distance (km)</label>
                            <input type="number" inputMode="decimal" value={form.distance_km} onChange={set('distance_km')} />
                        </div>
                    </div>
                    <div className="grid-2">
                        <div className="field">
                            <label>Intensity</label>
                            <select value={form.intensity} onChange={set('intensity')}>
                                <option value="low">Low</option>
                                <option value="moderate">Moderate</option>
                                <option value="high">High</option>
                                <option value="max">Max</option>
                            </select>
                        </div>
                        <div className="field">
                            <label>Calories <span className="hint">(optional — estimated if blank)</span></label>
                            <input type="number" inputMode="numeric" value={form.calories} onChange={set('calories')} />
                        </div>
                    </div>
                    <button className="btn gradient">Add workout</button>
                </form>
            </section>

            <section className="card">
                <div className="card-head"><h3>History</h3></div>
                {workouts.length === 0 ? (
                    <p className="card-hint">Nothing logged yet.</p>
                ) : (
                    <div className="stack" style={{ gap: 8 }}>
                        {workouts.map((w) => (
                            <div key={w.id} className="row spread" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                                <div>
                                    <strong style={{ fontSize: 14 }}>{w.type}</strong>
                                    {w.planned ? <span className="chip amber" style={{ marginLeft: 6 }}>planned</span> : null}
                                    <div className="muted" style={{ fontSize: 12 }}>
                                        {new Date(w.start_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        {w.duration_min ? ` · ${w.duration_min} min` : ''}
                                        {w.distance_km ? ` · ${w.distance_km.toFixed(1)} km` : ''}
                                        {w.calories ? ` · ${w.calories} kcal` : ''}
                                        {w.source !== 'manual' ? ` · ${w.source}` : ''}
                                    </div>
                                </div>
                                <button className="btn sm danger-ghost" onClick={() => remove(w.id)}>Delete</button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}

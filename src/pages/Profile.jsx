import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { previewTargets } from '../lib/nutrition';
import { GOALS, ACTIVITY_LEVELS, SEXES, ALLERGEN_OPTIONS } from '../data/constants';
import DietaryPicker from '../components/DietaryPicker';
import GoogleButton from '../components/GoogleButton';

export default function Profile() {
    const { user, connections, logout, refresh } = useAuth();
    const [form, setForm] = useState(null);
    const [dietary, setDietary] = useState([]);
    const [targets, setTargets] = useState(null);
    const [savedMsg, setSavedMsg] = useState(null);
    const [editDiet, setEditDiet] = useState(false);
    const [bwFiles, setBwFiles] = useState([]);
    const [bwMsg, setBwMsg] = useState(null);
    const [bwReportType, setBwReportType] = useState('blood');
    const fileRef = useRef(null);

    const load = useCallback(async () => {
        const [p, bw] = await Promise.all([
            api.get('/api/profile'),
            api.get('/api/bloodwork').catch(() => ({ files: [] })),
        ]);
        setForm({
            sex: p.profile?.sex || 'male',
            age: p.profile?.age ?? '',
            height_cm: p.profile?.height_cm ?? '',
            weight_kg: p.profile?.weight_kg ?? '',
            activity_level: p.profile?.activity_level || 'moderate',
            goal: p.profile?.goal || 'maintain',
            food_preferences: p.profile?.food_preferences || '',
        });
        setDietary(p.dietary || []);
        setTargets(p.targets);
        setBwFiles(bw.files || []);
    }, []);

    useEffect(() => {
        load().catch(() => {});
    }, [load]);

    // Blood-work analysis runs async on the server (can take a couple of minutes
    // on a local AI model) — poll while anything is still unparsed so "Analyzing…"
    // flips to "View analysis" on its own instead of requiring a manual reload.
    useEffect(() => {
        if (!bwFiles.some((f) => !f.parsed)) return undefined;
        const id = setInterval(() => {
            api.get('/api/bloodwork').then((bw) => setBwFiles(bw.files || [])).catch(() => {});
        }, 5000);
        return () => clearInterval(id);
    }, [bwFiles]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const preview = useMemo(() => (form ? previewTargets(form) : null), [form]);

    async function save() {
        setSavedMsg(null);
        try {
            const res = await api.put('/api/profile', { ...form, dietary });
            setTargets(res.targets);
            setSavedMsg('Saved.');
            refresh();
        } catch (err) {
            setSavedMsg(err.message);
        }
    }

    async function uploadBloodWork(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setBwMsg(null);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('report_type', bwReportType);
        try {
            const res = await api.upload('/api/bloodwork', fd);
            setBwMsg(res.message || 'Uploaded.');
            load();
        } catch (err) {
            setBwMsg(err.message);
        } finally {
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    async function deleteBloodWork(id) {
        await api.del(`/api/bloodwork/${id}`);
        load();
    }

    if (!form) return <main className="container"><div className="spin" /></main>;

    const hasGoogle = connections.includes('google');

    return (
        <main className="container stack">
            <div>
                <div className="page-title">Profile</div>
                <div className="page-sub">{user?.email}</div>
            </div>

            {/* Body + goal */}
            <section className="card">
                <div className="card-head"><h3>Body & goal</h3>{savedMsg && <span className="chip">{savedMsg}</span>}</div>
                <div className="stack">
                    <div className="grid-2">
                        <div className="field">
                            <label>Sex</label>
                            <select value={form.sex} onChange={set('sex')}>
                                {SEXES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>
                        </div>
                        <div className="field">
                            <label>Age</label>
                            <input type="number" value={form.age} onChange={set('age')} />
                        </div>
                        <div className="field">
                            <label>Height (cm)</label>
                            <input type="number" value={form.height_cm} onChange={set('height_cm')} />
                        </div>
                        <div className="field">
                            <label>Weight (kg)</label>
                            <input type="number" value={form.weight_kg} onChange={set('weight_kg')} />
                        </div>
                    </div>
                    <div className="field">
                        <label>Activity level</label>
                        <select value={form.activity_level} onChange={set('activity_level')}>
                            {ACTIVITY_LEVELS.map((a) => <option key={a.id} value={a.id}>{a.title} — {a.desc}</option>)}
                        </select>
                    </div>
                    <div className="field">
                        <label>Goal</label>
                        <div className="choice-grid">
                            {GOALS.map((g) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    className={`choice${form.goal === g.id ? ' selected' : ''}`}
                                    onClick={() => setForm((f) => ({ ...f, goal: g.id }))}
                                >
                                    <div className="c-icon">{g.icon}</div>
                                    <div className="c-title">{g.title}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="field">
                        <label>Food preferences (optional)</label>
                        <span className="hint" style={{ display: 'block', marginBottom: 4 }}>
                            Sent to the AI every time it picks meals for you — shown back to you with your results.
                        </span>
                        <textarea
                            rows={3}
                            value={form.food_preferences}
                            onChange={set('food_preferences')}
                            placeholder="e.g. I like spicy food, avoid processed meat, prefer Mediterranean flavors…"
                        />
                    </div>

                    {(preview?.bmi != null || targets?.bmi != null) && (
                        <div className="banner">
                            BMI <strong>{preview?.bmi ?? targets?.bmi}</strong> ({preview?.bmiCategory ?? targets?.bmiCategory})
                            {preview?.calorieTarget && (
                                <> · target <strong>{preview.calorieTarget}</strong> kcal ·
                                    {' '}P {preview.protein_g} / C {preview.carb_g} / F {preview.fat_g} g</>
                            )}
                        </div>
                    )}

                    <button className="btn gradient" onClick={save}>Save changes</button>
                </div>
            </section>

            {/* Dietary */}
            <section className="card">
                <div className="card-head">
                    <h3>Dietary preferences</h3>
                    <button className="btn sm subtle" onClick={() => setEditDiet((v) => !v)}>{editDiet ? 'Done' : 'Edit'}</button>
                </div>
                {editDiet ? (
                    <>
                        <DietaryPicker selected={dietary} onChange={setDietary} />
                        <button className="btn gradient" style={{ marginTop: 12 }} onClick={save}>Save preferences</button>
                    </>
                ) : dietary.length === 0 ? (
                    <p className="card-hint">No restrictions — you’ll see every menu item.</p>
                ) : (
                    <div className="row wrap">
                        {dietary.map((d) => {
                            const a = ALLERGEN_OPTIONS.find((x) => x.id === d.id);
                            const cls = d.severity === 'severe' ? 'red' : d.severity === 'moderate' ? 'amber' : 'gray';
                            return (
                                <span key={d.id} className={`chip ${cls}`}>
                                    {a ? `${a.icon} ${a.name}` : (d.label || d.id)}
                                </span>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* Connections */}
            <section className="card">
                <div className="card-head"><h3>Connected accounts</h3></div>
                <div className="stack" style={{ gap: 10 }}>
                    <div className="row spread">
                        <div><strong style={{ fontSize: 14 }}>📅 Google Calendar</strong>
                            <div className="muted" style={{ fontSize: 12 }}>Auto-import scheduled workouts</div>
                        </div>
                        {hasGoogle
                            ? <span className="chip">Connected</span>
                            : <GoogleButton label="Connect" onError={setSavedMsg} api={api} />}
                    </div>
                </div>
            </section>

            {/* Blood work */}
            <section className="card">
                <div className="card-head"><h3>🩸 Blood &amp; urine work</h3></div>
                <p className="card-hint">
                    Upload a lab report (PDF). We extract the markers with AI and softly factor anything flagged
                    into your meal picks — this is informational only, not medical advice.
                </p>
                {bwMsg && <div className="banner" style={{ marginTop: 10 }}>{bwMsg}</div>}
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                    <select value={bwReportType} onChange={(e) => setBwReportType(e.target.value)} style={{ maxWidth: 140 }}>
                        <option value="blood">Blood work</option>
                        <option value="urine">Urinalysis</option>
                    </select>
                    <input ref={fileRef} type="file" accept="application/pdf" onChange={uploadBloodWork} className="grow" />
                </div>
                {bwFiles.length > 0 && (
                    <div className="stack" style={{ gap: 6, marginTop: 12 }}>
                        {bwFiles.map((f) => (
                            <div key={f.id} className="row spread" style={{ fontSize: 13 }}>
                                <span>
                                    {f.report_type === 'urine' ? '🧪' : '📄'} {f.original_name}{' '}
                                    <span className="muted">({Math.round(f.size / 1024)} KB)</span>
                                </span>
                                <div className="row" style={{ gap: 6 }}>
                                    {f.parsed ? (
                                        <Link className="btn sm subtle" to={`/bloodwork/${f.id}`}>View analysis</Link>
                                    ) : (
                                        <span className="chip amber" title="Can take a couple of minutes on a local AI model — this updates on its own, no need to reload.">
                                            Analyzing…
                                        </span>
                                    )}
                                    <button className="btn sm danger-ghost" onClick={() => deleteBloodWork(f.id)}>Remove</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <button className="btn danger-ghost" onClick={logout}>Sign out</button>
        </main>
    );
}

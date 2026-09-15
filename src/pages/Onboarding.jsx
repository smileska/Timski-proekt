import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { previewTargets } from '../lib/nutrition';
import { GOALS, ACTIVITY_LEVELS, SEXES } from '../data/constants';
import DietaryPicker from '../components/DietaryPicker';

const STEPS = 3;

export default function Onboarding() {
    const { user, setHasProfile, refresh } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const [form, setForm] = useState({
        sex: 'male',
        age: '',
        height_cm: '',
        weight_kg: '',
        activity_level: 'moderate',
        goal: 'build_muscle',
        food_preferences: '',
    });
    const [dietary, setDietary] = useState([]);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const preview = useMemo(() => previewTargets(form), [form]);

    const step1Valid = form.age && form.height_cm && form.weight_kg;

    function next() {
        setError(null);
        if (step === 0 && !step1Valid) {
            setError('Fill in age, height and weight to continue.');
            return;
        }
        setStep((s) => Math.min(STEPS - 1, s + 1));
    }

    async function finish() {
        setBusy(true);
        setError(null);
        try {
            await api.put('/api/profile', { ...form, dietary });
            setHasProfile(true);
            await refresh();
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setError(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="auth-wrap" style={{ alignItems: 'flex-start' }}>
            <div className="auth-card card pad-lg" style={{ maxWidth: 480 }}>
                <div className="stepper">
                    {Array.from({ length: STEPS }).map((_, i) => (
                        <div key={i} className={`dot${i <= step ? ' done' : ''}`} />
                    ))}
                </div>

                <h2 className="page-title" style={{ marginBottom: 4 }}>
                    {step === 0 && `Hi${user?.name ? ' ' + user.name : ''}, let's set your baseline`}
                    {step === 1 && 'What are you training for?'}
                    {step === 2 && 'Allergies & food preferences'}
                </h2>
                <p className="page-sub" style={{ marginBottom: 18 }}>
                    {step === 0 && 'We use this for BMI and your daily calorie + macro targets.'}
                    {step === 1 && 'This shapes every meal suggestion you get.'}
                    {step === 2 && 'We’ll hide anything severe and weigh the rest. You can change this later.'}
                </p>

                {step === 0 && (
                    <div className="stack">
                        <div className="field">
                            <label>Sex</label>
                            <select value={form.sex} onChange={set('sex')}>
                                {SEXES.map((s) => (
                                    <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid-2">
                            <div className="field">
                                <label>Age</label>
                                <input type="number" inputMode="numeric" value={form.age} onChange={set('age')} />
                            </div>
                            <div className="field">
                                <label>Height (cm)</label>
                                <input type="number" inputMode="numeric" value={form.height_cm} onChange={set('height_cm')} />
                            </div>
                        </div>
                        <div className="field">
                            <label>Weight (kg)</label>
                            <input type="number" inputMode="decimal" value={form.weight_kg} onChange={set('weight_kg')} />
                        </div>

                        {preview.bmi != null && (
                            <div className="banner">
                                BMI <strong>{preview.bmi}</strong> · {preview.bmiCategory}
                                {preview.calorieTarget && (
                                    <> — roughly <strong>{preview.calorieTarget}</strong> kcal/day at this goal</>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {step === 1 && (
                    <div className="stack">
                        <div>
                            <div className="field-label" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>Goal</div>
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
                                        <div className="c-desc">{g.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="field">
                            <label>Activity level</label>
                            <select value={form.activity_level} onChange={set('activity_level')}>
                                {ACTIVITY_LEVELS.map((a) => (
                                    <option key={a.id} value={a.id}>{a.title} — {a.desc}</option>
                                ))}
                            </select>
                        </div>
                        {preview.calorieTarget && (
                            <div className="banner">
                                Target: <strong>{preview.calorieTarget}</strong> kcal ·
                                {' '}P <strong>{preview.protein_g}g</strong> ·
                                {' '}C <strong>{preview.carb_g}g</strong> ·
                                {' '}F <strong>{preview.fat_g}g</strong>
                            </div>
                        )}
                    </div>
                )}

                {step === 2 && (
                    <div className="stack">
                        <DietaryPicker selected={dietary} onChange={setDietary} />
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
                    </div>
                )}

                {error && <div className="field-error" style={{ marginTop: 12 }}>{error}</div>}

                <div className="row" style={{ marginTop: 20 }}>
                    {step > 0 && (
                        <button className="btn subtle" onClick={() => setStep((s) => s - 1)}>Back</button>
                    )}
                    <div className="grow" />
                    {step < STEPS - 1 ? (
                        <button className="btn gradient" onClick={next}>Continue</button>
                    ) : (
                        <button className="btn gradient" onClick={finish} disabled={busy}>
                            {busy ? 'Saving…' : 'Finish setup'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

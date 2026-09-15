import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLocation as useGeo } from '../context/LocationContext';
import { GOALS } from '../data/constants';
import RecommendationList from '../components/RecommendationList';

function MacroBar({ label, used, target, cls }) {
    const pct = target ? Math.min(100, Math.round((used / target) * 100)) : 0;
    return (
        <div className={`macro ${cls}`}>
            <div className="m-top">
                <span>{label}</span>
                <span>{Math.round(used)} / {target ?? '—'} g</span>
            </div>
            <div className="m-track"><div className="m-fill" style={{ width: `${pct}%` }} /></div>
        </div>
    );
}

export default function Dashboard() {
    const { user } = useAuth();
    const { coords, label } = useGeo();

    const [profile, setProfile] = useState(null);
    const [targets, setTargets] = useState(null);
    const [eaten, setEaten] = useState({ calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 });
    const [workouts, setWorkouts] = useState([]);
    const [rec, setRec] = useState(null);
    const [recBusy, setRecBusy] = useState(false);
    const [recError, setRecError] = useState(null);

    const loadCore = useCallback(async () => {
        const [p, ml, w] = await Promise.all([
            api.get('/api/profile'),
            api.get('/api/recommend-meals/meal-log'),
            api.get('/api/workouts'),
        ]);
        setProfile(p.profile);
        setTargets(p.targets);
        const totals = (ml.meals || []).reduce(
            (acc, m) => ({
                calories: acc.calories + (m.calories || 0),
                protein_g: acc.protein_g + (m.protein_g || 0),
                carb_g: acc.carb_g + (m.carb_g || 0),
                fat_g: acc.fat_g + (m.fat_g || 0),
            }),
            { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 }
        );
        setEaten(totals);
        setWorkouts(w.workouts || []);
    }, []);

    useEffect(() => {
        loadCore().catch(() => {});
    }, [loadCore]);

    const now = Date.now();
    const nextWorkout = useMemo(
        () => [...workouts].filter((w) => new Date(w.start_time).getTime() > now).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0],
        [workouts, now]
    );
    const lastWorkout = useMemo(
        () => [...workouts].filter((w) => new Date(w.start_time).getTime() <= now).sort((a, b) => new Date(b.start_time) - new Date(a.start_time))[0],
        [workouts, now]
    );

    const goal = GOALS.find((g) => g.id === profile?.goal);
    const calTarget = targets?.calorieTarget;
    const calRemaining = calTarget != null ? Math.round(calTarget - eaten.calories) : null;

    async function getRecommendations() {
        setRecBusy(true);
        setRecError(null);
        try {
            const res = await api.post('/api/recommend-meals', {
                latitude: coords?.lat,
                longitude: coords?.lon,
                locationLabel: label,
            });
            setRec(res);
        } catch (err) {
            setRecError(err.message);
        } finally {
            setRecBusy(false);
        }
    }

    return (
        <main className="container stack">
            <div>
                <div className="page-title">Hey{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋</div>
                <div className="page-sub">
                    {goal ? `${goal.icon} ${goal.title}` : 'Set a goal in your profile'}
                    {targets?.bmi != null && ` · BMI ${targets.bmi} (${targets.bmiCategory})`}
                </div>
            </div>

            {/* Targets */}
            <section className="card">
                <div className="card-head">
                    <h3>Today’s fuel</h3>
                    <div className="row" style={{ gap: 6 }}>
                        {targets?.workoutCaloriesToday > 0 && (
                            <span className="chip">+{targets.workoutCaloriesToday} kcal from training</span>
                        )}
                        <Link className="btn sm subtle" to="/meals/history">History →</Link>
                    </div>
                </div>

                {calTarget == null ? (
                    <p className="card-hint">
                        Add your height, weight and age in <Link to="/profile">your profile</Link> to see targets.
                    </p>
                ) : (
                    <>
                        <div className="stat-grid">
                            <div className="stat">
                                <div className="s-label">Calorie target</div>
                                <div className="s-value">{calTarget}</div>
                                <div className="s-sub">TDEE {targets.tdee}</div>
                            </div>
                            <div className="stat">
                                <div className="s-label">Eaten</div>
                                <div className="s-value">{Math.round(eaten.calories)}</div>
                                <div className="s-sub">logged meals</div>
                            </div>
                            <div className="stat">
                                <div className="s-label">Remaining</div>
                                <div className="s-value" style={{ color: calRemaining < 0 ? 'var(--accent-red)' : 'var(--brand-600)' }}>
                                    {calRemaining}
                                </div>
                                <div className="s-sub">kcal left today</div>
                            </div>
                        </div>
                        <MacroBar label="Protein" used={eaten.protein_g} target={targets.protein_g} cls="protein" />
                        <MacroBar label="Carbs" used={eaten.carb_g} target={targets.carb_g} cls="carb" />
                        <MacroBar label="Fat" used={eaten.fat_g} target={targets.fat_g} cls="fat" />
                    </>
                )}
            </section>

            {/* Workout timing */}
            <section className="card">
                <div className="card-head"><h3>Training</h3><Link className="btn sm subtle" to="/workouts">Manage</Link></div>
                {nextWorkout ? (
                    <p className="card-hint">
                        Next: <strong>{nextWorkout.type}</strong> ·{' '}
                        {new Date(nextWorkout.start_time).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                        {nextWorkout.duration_min ? ` · ${nextWorkout.duration_min} min` : ''}
                        {' '}— eat easy carbs + moderate protein beforehand.
                    </p>
                ) : lastWorkout ? (
                    <p className="card-hint">
                        Last: <strong>{lastWorkout.type}</strong> ·{' '}
                        {new Date(lastWorkout.start_time).toLocaleDateString()} ·{' '}
                        {lastWorkout.calories ? `${lastWorkout.calories} kcal` : '—'} — prioritise protein to recover.
                    </p>
                ) : (
                    <p className="card-hint">No workouts yet. <Link to="/workouts">Log one</Link> or import from Google Calendar.</p>
                )}
            </section>

            {/* AI meal picks */}
            <section className="card">
                <div className="card-head">
                    <h3>🤖 AI meal picks</h3>
                    <button className="btn sm gradient" onClick={getRecommendations} disabled={recBusy}>
                        {recBusy ? 'Thinking…' : rec ? 'Refresh' : 'Get picks'}
                    </button>
                </div>

                {recError && <div className="banner red">{recError}</div>}
                {recBusy && (
                    <div className="center" style={{ padding: 16 }}>
                        <div className="spin" />
                        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                            Asking the model… a local model can take up to a minute.
                        </p>
                    </div>
                )}
                {!recBusy && !rec && !recError && (
                    <p className="card-hint">
                        Personalised to your goal, macros left today, meal timing and the restaurants closest to you.
                    </p>
                )}
                {!recBusy && rec && <RecommendationList result={rec} onLogged={loadCore} />}
            </section>
        </main>
    );
}

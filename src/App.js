import { useState, useEffect } from 'react';

const STRAVA_CLIENT_ID = '181133';
const REDIRECT_URI = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:3001';

const ALLERGEN_OPTIONS = [
    { id: 'gluten', name: 'Gluten', icon: '🌾' },
    { id: 'dairy', name: 'Dairy', icon: '🥛' },
    { id: 'eggs', name: 'Eggs', icon: '🥚' },
    { id: 'nuts', name: 'Nuts', icon: '🥜' },
    { id: 'soy', name: 'Soy', icon: '🫘' },
    { id: 'fish', name: 'Fish', icon: '🐟' },
    { id: 'shellfish', name: 'Shellfish', icon: '🦐' },
    { id: 'sesame', name: 'Sesame', icon: '🌰' },
    { id: 'mustard', name: 'Mustard', icon: '🌭' },
    { id: 'celery', name: 'Celery', icon: '🥬' },
    { id: 'pork', name: 'Pork', icon: '🐷' },
    { id: 'beef', name: 'Beef', icon: '🐄' },
    { id: 'chicken', name: 'Chicken', icon: '🐔' }
];

const ALLERGEN_KEYWORDS = {
    gluten: ['gluten', 'wheat', 'bread', 'pasta', 'flour', 'пшеница', 'леб', 'тестенини', 'пица', 'бурек', 'нудлси'],
    dairy: ['dairy', 'milk', 'cheese', 'cream', 'butter', 'млеко', 'сирење', 'павлака', 'путер', 'кашкавал', 'пармезан'],
    eggs: ['egg', 'јајце', 'јајца', 'омлет'],
    nuts: ['nut', 'almond', 'cashew', 'walnut', 'ореви', 'бадем', 'индиски ореви'],
    soy: ['soy', 'соја', 'тофу'],
    fish: ['fish', 'salmon', 'tuna', 'риба', 'лосос', 'туна', 'лаврак'],
    shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'ракчиња', 'ракови', 'јастог', 'лигњи'],
    sesame: ['sesame', 'сусам'],
    mustard: ['mustard', 'сенф'],
    celery: ['celery', 'целер'],
    pork: ['pork', 'bacon', 'ham', 'свинско', 'шунка', 'сланина', 'пршут'],
    beef: ['beef', 'говедско', 'телешко'],
    chicken: ['chicken', 'пилешко', 'пиле']
};

const mockWorkout = {
    type: 'Run', distance: '8.2 km', duration: '42 min',
    intensity: 'High', calories: 520, date: 'Today'
};

function itemContainsRestriction(item, restrictionId) {
    const keywords = ALLERGEN_KEYWORDS[restrictionId] || [restrictionId];
    const text = (item.name + ' ' + (item.description || '')).toLowerCase();
    return keywords.some(kw => text.includes(kw.toLowerCase()));
}

function itemIsBlocked(item, allergens, tempRestrictions) {
    return [...allergens, ...tempRestrictions].some(r => itemContainsRestriction(item, r));
}

function handleStravaLogin() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=${scope}`;
    window.location.href = authUrl;
}

async function exchangeToken(code) {
    const response = await fetch(`${BACKEND_URL}/api/strava/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });
    return await response.json();
}

async function fetchStravaActivities(accessToken) {
    try {
        const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error('Failed');
        return await response.json();
    } catch (e) { return []; }
}

async function fetchKorpaRestaurants() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/korpa/restaurants`);
        const data = await response.json();
        return data.success ? data.restaurants : [];
    } catch (e) { return []; }
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function sortByDistance(restaurants, userLat, userLon) {
    const SKOPJE_LAT = 41.9981;
    const SKOPJE_LON = 21.4254;
    return [...restaurants].map(r => {
        const lat = r.latitude || SKOPJE_LAT;
        const lon = r.longitude || SKOPJE_LON;
        const dist = getDistanceKm(userLat, userLon, lat, lon);
        return { ...r, distanceKm: dist };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
}

async function getMealRecommendations(workout, restaurants, userAllergens, tempRestrictions) {
    const allMeals = [];
    const hasDistance = restaurants[0]?.distanceKm !== undefined;
    const sortedRestaurants = hasDistance
        ? [...restaurants].sort((a, b) => (a.distanceKm || 99) - (b.distanceKm || 99))
        : restaurants;
    const restaurantsToUse = hasDistance ? sortedRestaurants.slice(0, 5) : sortedRestaurants;

    restaurantsToUse.forEach(r => {
        if (r.menu) {
            const distLabel = r.distanceKm !== undefined
                ? ` [${r.distanceKm < 1 ? (r.distanceKm * 1000).toFixed(0) + 'm away' : r.distanceKm.toFixed(1) + 'km away'}]`
                : '';
            r.menu.slice(0, 15).forEach(item => {
                if (!itemIsBlocked(item, userAllergens, tempRestrictions)) {
                    allMeals.push({
                        name: item.name,
                        description: item.description || '',
                        restaurant: r.name + distLabel,
                        restaurantUrl: r.url,
                        restaurantName: r.name
                    });
                }
            });
        }
    });
    if (allMeals.length === 0) return [];

    const allRestrictions = [...userAllergens, ...tempRestrictions];
    const allergenText = allRestrictions.length > 0 ? `User cannot eat: ${allRestrictions.join(', ')}.` : 'No dietary restrictions.';
    const hour = new Date().getHours();
    const mealTiming = hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'pre-workout snack' : hour < 20 ? 'post-workout dinner' : 'late dinner';
    const distanceNote = hasDistance
        ? `IMPORTANT: The meals are listed from the NEAREST restaurant first. You MUST prioritize meals from restaurants that are closest to the user. Only suggest a farther restaurant if it has a significantly better nutritional fit.`
        : '';
    const userContext = `
Time: ${hour}:00 (${mealTiming})
Workout: ${workout.type}, ${workout.distance}, ${workout.duration}, intensity: ${workout.intensity}, calories burned: ${workout.calories}
Goal: improve endurance, maintain weight
Meal timing: ${mealTiming} after a ${workout.intensity.toLowerCase()} ${workout.type}
${allergenText}
${distanceNote}
`;

    try {
        const response = await fetch(`${BACKEND_URL}/api/recommend-meals`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userContext, meals: allMeals })
        });
        const data = await response.json();
        if (!data.success) return [];
        return data.recommendations.map(rec => {
            const match = allMeals.find(m => m.name === rec.meal || rec.meal.includes(m.name) || m.name.includes(rec.meal));
            return { ...rec, restaurantUrl: match?.restaurantUrl || null, restaurant: match?.restaurantName || rec.restaurant || null };
        });
    } catch (e) { return []; }
}

function formatActivity(activity) {
    return {
        type: activity.type,
        distance: `${(activity.distance / 1000).toFixed(1)} km`,
        duration: `${Math.round(activity.moving_time / 60)} min`,
        intensity: activity.average_heartrate ? 'High' : 'Moderate',
        calories: Math.round(activity.kilojoules * 0.239) || 'N/A',
        date: new Date(activity.start_date).toLocaleDateString()
    };
}

// ── ICONS ─────────────────────────────────────────────────────────────────────
function DashboardIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="6.5" height="6.5" rx="1.5" fill="white"/>
            <rect x="9.5" y="1" width="6.5" height="6.5" rx="1.5" fill="white"/>
            <rect x="1" y="9.5" width="6.5" height="6.5" rx="1.5" fill="white"/>
            <rect x="9.5" y="9.5" width="6.5" height="6.5" rx="1.5" fill="white"/>
        </svg>
    );
}

function ProfileIcon() {
    return (
        <svg width="19" height="19" viewBox="0 0 19 19" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="9.5" cy="6.5" r="3.8" fill="white"/>
            <path d="M2 18c0-4.142 3.358-7.5 7.5-7.5S17 13.858 17 18" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
        </svg>
    );
}

// ── HEADER ───────────────────────────────────────────────────────────────────
function Header({ athleteName, onSettingsClick, onNavigate }) {
    return (
        <header style={{
            background: 'linear-gradient(135deg, #1a6b3a 0%, #2a9d5c 55%, #0ea59a 100%)',
            padding: '14px 20px', color: 'white',
            boxShadow: '0 3px 14px rgba(0,0,0,0.15)'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1
                    style={{ margin: 0, fontSize: '24px', fontWeight: '800', letterSpacing: '-0.3px', cursor: 'pointer' }}
                    onClick={() => onNavigate('home')}
                >🥗 InstaMeal</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    {athleteName && <span style={{ fontSize: '13px', opacity: 0.85 }}>Hey, {athleteName}!</span>}
                    <nav style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            title="Dashboard"
                            onClick={() => onNavigate('dashboard')}
                            style={{
                                background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
                                width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                        >
                            <DashboardIcon />
                        </button>
                        <button
                            title="Profile"
                            onClick={() => onNavigate('profile')}
                            style={{
                                background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
                                width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                        >
                            <ProfileIcon />
                        </button>
                        <button
                            onClick={onSettingsClick}
                            title="Settings"
                            style={{
                                background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
                                width: '34px', height: '34px', borderRadius: '8px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="white"/>
                                <path fillRule="evenodd" clipRule="evenodd" d="M9.394 2.276a1.5 1.5 0 0 1 5.212 0l.39 1.302a7.5 7.5 0 0 1 1.486.858l1.332-.332a1.5 1.5 0 0 1 1.736.868l1.5 2.598a1.5 1.5 0 0 1-.432 1.934l-1.104.803a7.5 7.5 0 0 1 0 1.786l1.104.803a1.5 1.5 0 0 1 .432 1.934l-1.5 2.598a1.5 1.5 0 0 1-1.736.868l-1.332-.332a7.5 7.5 0 0 1-1.486.858l-.39 1.302a1.5 1.5 0 0 1-5.212 0l-.39-1.302a7.5 7.5 0 0 1-1.486-.858l-1.332.332a1.5 1.5 0 0 1-1.736-.868l-1.5-2.598a1.5 1.5 0 0 1 .432-1.934l1.104-.803a7.5 7.5 0 0 1 0-1.786l-1.104-.803a1.5 1.5 0 0 1-.432-1.934l1.5-2.598a1.5 1.5 0 0 1 1.736-.868l1.332.332a7.5 7.5 0 0 1 1.486-.858l.39-1.302Z" fill="rgba(255,255,255,0.7)"/>
                            </svg>
                        </button>
                    </nav>
                </div>
            </div>
        </header>
    );
}

// ── DIETARY MODAL ────────────────────────────────────────────────────────────
function DietaryModal({ isOpen, onClose, selectedAllergens, tempRestrictions, onSave, onSaveTemp }) {
    const [localAllergens, setLocalAllergens] = useState(selectedAllergens);
    const [localTemp, setLocalTemp] = useState(tempRestrictions);
    const [tab, setTab] = useState('permanent');

    useEffect(() => setLocalAllergens(selectedAllergens), [selectedAllergens]);
    useEffect(() => setLocalTemp(tempRestrictions), [tempRestrictions]);

    if (!isOpen) return null;

    const toggle = (id, list, setList) =>
        setList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    const list = tab === 'permanent' ? localAllergens : localTemp;
    const setList = tab === 'permanent' ? setLocalAllergens : setLocalTemp;
    const accentColor = tab === 'permanent' ? '#ef4444' : '#f59e0b';
    const accentBg = tab === 'permanent' ? '#fee2e2' : '#fffbeb';

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: '16px', padding: '28px', maxWidth: '620px', width: '90%', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, color: '#1a3d2b' }}>🥗 Dietary Preferences</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#999' }}>×</button>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {[['permanent', '🚫 Always Exclude'], ['temp', '⏱️ Skip Today Only']].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key)} style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            fontWeight: '600', fontSize: '13px',
                            background: tab === key ? (key === 'permanent' ? '#ef4444' : '#f59e0b') : '#f3f4f6',
                            color: tab === key ? 'white' : '#666'
                        }}>{label}</button>
                    ))}
                </div>

                <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>
                    {tab === 'permanent' ? 'Saved permanently — allergies, dietary choices.' : 'Only for this session — resets when you close the browser.'}
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                    {ALLERGEN_OPTIONS.map(a => {
                        const selected = list.includes(a.id);
                        return (
                            <button key={a.id} onClick={() => toggle(a.id, list, setList)} style={{
                                padding: '12px 8px', border: `2px solid ${selected ? accentColor : '#e5e7eb'}`,
                                background: selected ? accentBg : 'white', borderRadius: '10px',
                                cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                            }}>
                                <div style={{ fontSize: '26px', marginBottom: '4px' }}>{a.icon}</div>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>{a.name}</div>
                                {selected && <div style={{ fontSize: '11px', color: accentColor, marginTop: '2px' }}>✓ {tab === 'permanent' ? 'Excluded' : 'Skip today'}</div>}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '10px 20px', border: '2px solid #e5e7eb', background: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#666' }}>Cancel</button>
                    <button onClick={() => { onSave(localAllergens); onSaveTemp(localTemp); onClose(); }}
                        style={{ padding: '10px 20px', border: 'none', background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>
                        Save ({localAllergens.length} permanent · {localTemp.length} today)
                    </button>
                </div>
            </div>
        </div>
    );
}

function RestrictionsBanner({ allergens, tempRestrictions, onEdit }) {
    const all = [...allergens, ...tempRestrictions];
    if (all.length === 0) return null;
    return (
        <div style={{ background: '#fff7ed', border: '2px solid #f59e0b', borderRadius: '12px', padding: '12px 16px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: '0 0 7px 0', color: '#92400e', fontSize: '13px' }}>🥗 Active Food Preferences</h3>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {allergens.map(id => {
                            const a = ALLERGEN_OPTIONS.find(x => x.id === id);
                            return a ? <span key={id} style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>{a.icon} {a.name}</span> : null;
                        })}
                        {tempRestrictions.map(id => {
                            const a = ALLERGEN_OPTIONS.find(x => x.id === id);
                            return a ? <span key={`t-${id}`} style={{ background: '#fffbeb', color: '#92400e', padding: '3px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '600', border: '1px solid #f59e0b' }}>⏱️ {a.icon} {a.name}</span> : null;
                        })}
                    </div>
                </div>
                <button onClick={onEdit} style={{ background: 'white', border: '2px solid #f59e0b', color: '#92400e', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}>Edit</button>
            </div>
        </div>
    );
}

// ── WORKOUT CARD ──────────────────────────────────────────────────────────────
function WorkoutCard({ workout, isReal }) {
    const stats = [
        { label: 'Type',      value: workout.type,      icon: '🏃', accent: '#16a34a', bg: '#dcfce7' },
        { label: 'Distance',  value: workout.distance,  icon: '📏', accent: '#0891b2', bg: '#e0f2fe' },
        { label: 'Duration',  value: workout.duration,  icon: '⏱️', accent: '#7c3aed', bg: '#ede9fe' },
        { label: 'Intensity', value: workout.intensity, icon: '🔥', accent: '#dc2626', bg: '#fee2e2' },
        { label: 'Calories',  value: workout.calories,  icon: '⚡', accent: '#d97706', bg: '#fef3c7' },
        { label: 'Date',      value: workout.date,      icon: '📅', accent: '#0ea59a', bg: '#ccfbf1' },
    ];
    return (
        <div style={{
            background: 'white', borderRadius: '14px', padding: '18px 20px',
            boxShadow: '0 3px 12px rgba(0,0,0,0.08)', marginBottom: '18px',
            border: '1px solid #d1fae5'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h2 style={{ margin: 0, color: '#1a3d2b', fontSize: '16px', fontWeight: '700' }}>
                    {isReal ? 'Latest Workout' : "Today's Workout (Demo)"}
                </h2>
                <span style={{
                    background: isReal ? '#10b981' : '#f59e0b', color: 'white',
                    padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold'
                }}>
                    {isReal ? 'LIVE DATA' : 'DEMO'}
                </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                {stats.map(s => (
                    <div key={s.label} style={{
                        textAlign: 'center', padding: '10px 6px',
                        background: s.bg, borderRadius: '10px',
                        border: `1px solid ${s.accent}22`
                    }}>
                        <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                        <div style={{ fontSize: '10px', color: s.accent, fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                        <div style={{ fontSize: '14px', fontWeight: '800', color: '#1a1a1a' }}>{s.value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── AI RECOMMENDATIONS ────────────────────────────────────────────────────────
function RecommendationsSection({ recommendations, loading, done, workout, onRefresh }) {
    if (loading) return (
        <div style={{
            background: 'white', borderRadius: '16px', padding: '32px',
            textAlign: 'center', marginBottom: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #d1fae5'
        }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>🧠</div>
            <p style={{ color: '#2a9d5c', fontSize: '16px', margin: '0 0 5px', fontWeight: '600' }}>Finding your perfect fuel...</p>
            <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>Analyzing workout · checking nearby restaurants · applying preferences</p>
        </div>
    );
    if (!done) return null;
    if (recommendations.length === 0) return (
        <div style={{ background: '#fee2e2', borderRadius: '12px', padding: '16px', marginBottom: '20px', textAlign: 'center' }}>
            <p style={{ margin: 0, color: '#991b1b' }}>⚠️ No recommendations found. Make sure Ollama is running and restaurants are loaded.</p>
        </div>
    );
    const hour = new Date().getHours();
    const timing = hour < 17 ? 'Pre-workout' : 'Post-workout';
    return (
        <div style={{
            background: 'white', borderRadius: '16px', padding: '20px',
            marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            border: '2px solid #a7f3d0'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)',
                        borderRadius: '10px', padding: '5px 9px', fontSize: '18px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                    }}>🤖</span>
                    <div>
                        <h2 style={{ margin: 0, color: '#1a3d2b', fontSize: '17px', fontWeight: '800' }}>AI Meal Picks ✨</h2>
                        <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>
                            {workout.type} · {workout.calories} cal burned · {timing} · Preferences applied
                        </p>
                    </div>
                </div>
                <button onClick={onRefresh} style={{
                    background: 'none', border: '1.5px solid #a7f3d0', color: '#2a9d5c',
                    padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
                    fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px'
                }}>
                    ↻ Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                {recommendations.map((rec, idx) => (
                    <div key={idx} style={{
                        background: idx === 0 ? '#f0fdf4' : '#f9fafb',
                        border: `1.5px solid ${idx === 0 ? '#6ee7b7' : '#e5e7eb'}`,
                        borderRadius: '11px', padding: '14px',
                        display: 'flex', gap: '12px', alignItems: 'flex-start'
                    }}>
                        <div style={{
                            background: idx === 0 ? 'linear-gradient(135deg, #2a9d5c, #0ea59a)' : '#e5e7eb',
                            color: 'white', width: '28px', height: '28px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: '800', fontSize: '13px', flexShrink: 0
                        }}>{idx + 1}</div>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                <strong style={{ color: '#1a3d2b', fontSize: '14px' }}>{rec.meal}</strong>
                                {idx === 0 && <span style={{ background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700' }}>TOP PICK</span>}
                            </div>
                            {rec.restaurant && (
                                <div style={{ marginBottom: '4px' }}>
                                    {rec.restaurantUrl
                                        ? <a href={rec.restaurantUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2a9d5c', fontSize: '12px', textDecoration: 'none', fontWeight: '600' }}>🏪 {rec.restaurant} → Order on Korpa.mk</a>
                                        : <span style={{ color: '#2a9d5c', fontSize: '12px', fontWeight: '600' }}>🏪 {rec.restaurant}</span>
                                    }
                                </div>
                            )}
                            <p style={{ margin: 0, color: '#6b7280', fontSize: '12px', lineHeight: '1.5' }}>{rec.reason}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── RESTAURANT CARD ───────────────────────────────────────────────────────────
function RealRestaurantCard({ restaurant, userAllergens, tempRestrictions }) {
    const [expanded, setExpanded] = useState(false);
    const visibleItems = restaurant.menu.filter(item => !itemIsBlocked(item, userAllergens, tempRestrictions));
    const blockedCount = restaurant.menu.length - visibleItems.length;
    const displayItems = expanded ? visibleItems : visibleItems.slice(0, 4);

    return (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', border: '1px solid #e5e7eb' }}
            onClick={() => setExpanded(!expanded)}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                {restaurant.logo && <div style={{ width: '48px', height: '48px', borderRadius: '9px', backgroundImage: `url(${restaurant.logo})`, backgroundSize: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 2px', color: '#1a3d2b', fontSize: '15px' }}>{restaurant.name}</h3>
                    <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>
                        {visibleItems.length} items available
                        {blockedCount > 0 && <span style={{ color: '#ef4444', marginLeft: '5px' }}>· {blockedCount} hidden</span>}
                    </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                    <span style={{ background: '#10b981', color: 'white', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: 'bold' }}>LIVE</span>
                    {restaurant.distanceKm !== undefined && (
                        <span style={{ background: '#f0fdf4', color: '#2a9d5c', padding: '2px 7px', borderRadius: '5px', fontSize: '10px', fontWeight: '600' }}>
                            📍 {restaurant.distanceKm < 1 ? (restaurant.distanceKm * 1000).toFixed(0) + 'm' : restaurant.distanceKm.toFixed(1) + 'km'}
                        </span>
                    )}
                </div>
            </div>

            {restaurant.banner && <div style={{ width: '100%', height: '120px', borderRadius: '8px', backgroundImage: `url(${restaurant.banner})`, backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: '10px' }} />}

            {visibleItems.length === 0 ? (
                <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', textAlign: 'center', marginBottom: '10px' }}>
                    <p style={{ margin: 0, color: '#991b1b', fontSize: '13px' }}>🚫 All items blocked by your dietary restrictions</p>
                </div>
            ) : (
                <div style={{ marginBottom: '10px' }}>
                    {displayItems.map((item, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f3f4f6', gap: '8px' }}>
                            <div>
                                <span style={{ fontSize: '13px', color: '#333' }}>{item.name}</span>
                                {item.description && <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#aaa' }}>{item.description.slice(0, 60)}{item.description.length > 60 ? '…' : ''}</p>}
                            </div>
                            {item.price && item.price !== '0' && <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2a9d5c', flexShrink: 0 }}>{item.price}</span>}
                        </div>
                    ))}
                    {visibleItems.length > 4 && (
                        <button style={{ width: '100%', padding: '6px', background: '#f0fdf4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#2a9d5c', fontWeight: '600', marginTop: '5px' }}>
                            {expanded ? 'Show Less ▲' : `Show All ${visibleItems.length} Items ▼`}
                        </button>
                    )}
                </div>
            )}

            <a href={restaurant.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', padding: '9px', background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', textAlign: 'center', borderRadius: '8px', textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}
                onClick={e => e.stopPropagation()}>
                Order on Korpa.mk →
            </a>
        </div>
    );
}

// ── NEARBY SECTION ───────────────────────────────────────────────────────────
function NearbySection({ nearby, loading }) {
    if (!loading && nearby.length === 0) return null;
    return (
        <div style={{ marginBottom: '24px' }}>
            <h2 style={{ margin: '0 0 12px', color: '#1a3d2b', fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📍 Restaurants Near You
                {loading && <span style={{ fontSize: '13px', color: '#9ca3af', fontWeight: 'normal' }}>Loading...</span>}
            </h2>
            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Finding nearby restaurants...</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                    {nearby.map((r, idx) => (
                        <div key={idx} style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #d1fae5' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                                <h3 style={{ margin: 0, color: '#1a3d2b', fontSize: '14px' }}>{r.name}</h3>
                                <span style={{ background: r.openNow ? '#dcfce7' : '#fee2e2', color: r.openNow ? '#166534' : '#991b1b', padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', flexShrink: 0, marginLeft: '6px' }}>
                                    {r.openNow ? '✓ Open' : '✗ Closed'}
                                </span>
                            </div>
                            <p style={{ margin: '0 0 5px', color: '#6b7280', fontSize: '12px' }}>{r.address}</p>
                            {r.rating && <p style={{ margin: 0, fontSize: '12px', color: '#f59e0b', fontWeight: '600' }}>⭐ {r.rating}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── RESTAURANT LIST ───────────────────────────────────────────────────────────
function RestaurantList({ restaurants, loading, userAllergens, tempRestrictions, onOpenSettings }) {
    if (loading) return (
        <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🍽️</div>
            <p style={{ color: '#6b7280', fontSize: '16px', margin: '0 0 6px' }}>Loading restaurants from Korpa.mk...</p>
            <p style={{ color: '#9ca3af', fontSize: '13px', margin: 0 }}>First load takes ~30 seconds</p>
        </div>
    );
    if (!restaurants || restaurants.length === 0) return (
        <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #d1fae5' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏪</div>
            <p style={{ color: '#6b7280', margin: 0 }}>Click "Load Restaurants" or "Find Nearby" to get started.</p>
        </div>
    );

    const allRestrictions = [...userAllergens, ...tempRestrictions];
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <h2 style={{ margin: 0, color: '#1a3d2b', fontSize: '17px' }}>Available Restaurants ({restaurants.length})</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {allRestrictions.length > 0 && (
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold' }}>
                            🚫 {allRestrictions.length} Restrictions
                        </span>
                    )}
                    <button onClick={onOpenSettings} style={{ background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', border: 'none', padding: '6px 13px', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                        ⚙️ Manage Preferences
                    </button>
                    <span style={{ background: '#10b981', color: 'white', padding: '4px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>✓ LIVE FROM KORPA.MK</span>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {restaurants.map((r, idx) => {
                    if (!r.menu) return (
                        <div key={idx} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #d1fae5' }}>
                            <h3 style={{ margin: '0 0 5px', color: '#1a3d2b' }}>{r.name}</h3>
                            <p style={{ margin: '0 0 4px', color: '#6b7280', fontSize: '13px' }}>{r.address}</p>
                            <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 'bold', color: '#2a9d5c' }}>⭐ {r.rating}</p>
                            <p style={{ margin: 0, color: r.openNow ? '#10b981' : '#ef4444', fontSize: '12px' }}>{r.openNow ? '✓ Open Now' : '✗ Closed'}</p>
                        </div>
                    );
                    return <RealRestaurantCard key={r.id || idx} restaurant={r} userAllergens={userAllergens} tempRestrictions={tempRestrictions} />;
                })}
            </div>
        </div>
    );
}

// ── DASHBOARD PAGE ────────────────────────────────────────────────────────────
function DashboardPage({ workout, isRealData, recommendations, restaurants, nearbyRestaurants, userAllergens, tempRestrictions, recsLoading, restaurantsLoading, nearbyLoading, onGetRecommendations, onNavigate }) {
    const totalMenuItems = restaurants.reduce((sum, r) => sum + (r.menu ? r.menu.length : 0), 0);
    const allRestrictions = [...userAllergens, ...tempRestrictions];
    const hour = new Date().getHours();
    const mealTiming = hour < 10 ? 'Breakfast time' : hour < 14 ? 'Lunch time' : hour < 17 ? 'Afternoon snack' : hour < 20 ? 'Dinner time' : 'Late evening';

    const statCards = [
        { icon: '🏃', label: 'Last Workout', value: workout.type, sub: `${workout.distance} · ${workout.duration}`, color: '#16a34a', bg: '#dcfce7' },
        { icon: '⚡', label: 'Calories Burned', value: `${workout.calories}`, sub: isRealData ? 'From Strava' : 'Demo data', color: '#d97706', bg: '#fef3c7' },
        { icon: '🍽️', label: 'Restaurants', value: restaurantsLoading ? '…' : `${restaurants.length}`, sub: `${totalMenuItems} menu items`, color: '#2a9d5c', bg: '#f0fdf4' },
        { icon: '📍', label: 'Nearby Places', value: nearbyLoading ? '…' : `${nearbyRestaurants.length}`, sub: 'Within 1km radius', color: '#0891b2', bg: '#e0f2fe' },
        { icon: '🤖', label: 'AI Suggestions', value: recsLoading ? '…' : `${recommendations.length}`, sub: recommendations.length > 0 ? 'Ready to view' : 'Not generated yet', color: '#dc2626', bg: '#fee2e2' },
        { icon: '🥗', label: 'Restrictions', value: `${allRestrictions.length}`, sub: allRestrictions.length > 0 ? allRestrictions.slice(0, 2).join(', ') + (allRestrictions.length > 2 ? '…' : '') : 'No restrictions', color: '#0ea59a', bg: '#ccfbf1' },
    ];

    return (
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: '0 0 4px', color: '#1a3d2b', fontSize: '22px', fontWeight: '800' }}>📊 Dashboard</h2>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>{mealTiming} — your InstaMeal overview</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '18px' }}>
                {statCards.map((s, i) => (
                    <div key={i} style={{
                        background: 'white', borderRadius: '12px', padding: '14px 16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                        borderLeft: `4px solid ${s.color}`,
                        border: `1px solid ${s.bg}`,
                        borderLeftWidth: '4px', borderLeftStyle: 'solid', borderLeftColor: s.color
                    }}>
                        <div style={{ fontSize: '22px', marginBottom: '6px' }}>{s.icon}</div>
                        <div style={{ fontSize: '10px', color: s.color, marginBottom: '3px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
                        <div style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a1a', marginBottom: '2px' }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '18px', border: '1px solid #d1fae5' }}>
                <h3 style={{ margin: '0 0 12px', color: '#1a3d2b', fontSize: '14px', fontWeight: '700' }}>⚡ Quick Actions</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => onNavigate('home')} style={{ background: 'linear-gradient(135deg, #1a6b3a, #2a9d5c)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                        🏠 Go to Home
                    </button>
                    <button onClick={onGetRecommendations} disabled={recsLoading || restaurantsLoading} style={{
                        background: (recsLoading || restaurantsLoading) ? '#d1fae5' : 'linear-gradient(135deg, #f59e0b, #f97316)',
                        color: (recsLoading || restaurantsLoading) ? '#6b7280' : 'white',
                        border: 'none', padding: '8px 16px', borderRadius: '8px',
                        cursor: (recsLoading || restaurantsLoading) ? 'not-allowed' : 'pointer', fontWeight: '700', fontSize: '13px'
                    }}>
                        {recsLoading ? '🤖 Thinking…' : '🤖 AI Suggestions'}
                    </button>
                    <button onClick={() => onNavigate('profile')} style={{ background: 'white', color: '#2a9d5c', border: '1.5px solid #6ee7b7', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                        👤 View Profile
                    </button>
                </div>
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '18px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ margin: 0, color: '#1a3d2b', fontSize: '14px', fontWeight: '700' }}>🏃 Latest Workout</h3>
                    <span style={{ background: isRealData ? '#10b981' : '#f59e0b', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 'bold' }}>
                        {isRealData ? 'LIVE · STRAVA' : 'DEMO'}
                    </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                    {[
                        { icon: '🏃', label: 'Type', value: workout.type, accent: '#16a34a', bg: '#dcfce7' },
                        { icon: '📏', label: 'Distance', value: workout.distance, accent: '#0891b2', bg: '#e0f2fe' },
                        { icon: '⏱️', label: 'Duration', value: workout.duration, accent: '#7c3aed', bg: '#ede9fe' },
                        { icon: '🔥', label: 'Intensity', value: workout.intensity, accent: '#dc2626', bg: '#fee2e2' },
                        { icon: '⚡', label: 'Calories', value: workout.calories, accent: '#d97706', bg: '#fef3c7' },
                        { icon: '📅', label: 'Date', value: workout.date, accent: '#0ea59a', bg: '#ccfbf1' },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center', padding: '10px 6px', background: s.bg, borderRadius: '10px', border: `1px solid ${s.accent}22` }}>
                            <div style={{ fontSize: '18px', marginBottom: '3px' }}>{s.icon}</div>
                            <div style={{ fontSize: '10px', color: s.accent, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>{s.label}</div>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: '#1a1a1a' }}>{s.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {recommendations.length > 0 && (
                <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '2px solid #a7f3d0' }}>
                    <h3 style={{ margin: '0 0 12px', color: '#1a3d2b', fontSize: '14px', fontWeight: '700' }}>🤖 Latest AI Recommendations</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recommendations.slice(0, 3).map((rec, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 12px', background: idx === 0 ? '#f0fdf4' : '#f9fafb', borderRadius: '10px', border: `1.5px solid ${idx === 0 ? '#6ee7b7' : '#e5e7eb'}` }}>
                                <div style={{ background: idx === 0 ? 'linear-gradient(135deg, #2a9d5c, #0ea59a)' : '#e5e7eb', color: 'white', width: '26px', height: '26px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '12px', flexShrink: 0 }}>{idx + 1}</div>
                                <div>
                                    <div style={{ fontWeight: '700', color: '#1a3d2b', fontSize: '13px', marginBottom: '2px' }}>{rec.meal}</div>
                                    {rec.restaurant && <div style={{ fontSize: '12px', color: '#2a9d5c', marginBottom: '2px' }}>🏪 {rec.restaurant}</div>}
                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{rec.reason}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => onNavigate('home')} style={{ marginTop: '12px', background: 'none', border: '1.5px solid #a7f3d0', color: '#2a9d5c', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        View full recommendations →
                    </button>
                </div>
            )}
        </main>
    );
}

// ── PROFILE PAGE ──────────────────────────────────────────────────────────────
function ProfilePage({ athleteName, accessToken, userAllergens, tempRestrictions, workout, isRealData, onEditPreferences, onStravaLogin, onNavigate }) {
    const allRestrictions = [...userAllergens, ...tempRestrictions];
    const joinedDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

    return (
        <main style={{ maxWidth: '860px', margin: '0 auto', padding: '24px 20px' }}>
            <div style={{ marginBottom: '20px' }}>
                <h2 style={{ margin: '0 0 4px', color: '#1a3d2b', fontSize: '22px', fontWeight: '800' }}>👤 Profile</h2>
                <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>Manage your account, connections, and dietary preferences</p>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #1a6b3a 0%, #2a9d5c 55%, #0ea59a 100%)', borderRadius: '14px', padding: '22px', color: 'white', marginBottom: '16px', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', flexShrink: 0 }}>
                        {athleteName ? athleteName[0].toUpperCase() : '👤'}
                    </div>
                    <div>
                        <h3 style={{ margin: '0 0 4px', fontSize: '19px', fontWeight: '800' }}>{athleteName || 'InstaMeal User'}</h3>
                        <p style={{ margin: '0 0 6px', opacity: 0.85, fontSize: '12px' }}>Member since {joinedDate}</p>
                        <span style={{ background: 'rgba(255,255,255,0.25)', padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                            {accessToken ? '✓ Strava Connected' : '⚠ Strava Not Connected'}
                        </span>
                    </div>
                </div>
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '14px', border: '1px solid #d1fae5' }}>
                <h3 style={{ margin: '0 0 12px', color: '#1a3d2b', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🚴 Strava Integration
                    <span style={{ background: accessToken ? '#dcfce7' : '#fee2e2', color: accessToken ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: '600' }}>
                        {accessToken ? 'Connected' : 'Disconnected'}
                    </span>
                </h3>
                {accessToken ? (
                    <div>
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '11px', marginBottom: '10px' }}>
                            <p style={{ margin: '0 0 3px', color: '#166534', fontWeight: '600', fontSize: '13px' }}>✓ Your Strava account is linked</p>
                            <p style={{ margin: 0, color: '#15803d', fontSize: '12px' }}>Workout data is being used for personalized meal recommendations.</p>
                        </div>
                        <div style={{ padding: '11px', background: '#f9fafb', borderRadius: '10px' }}>
                            <p style={{ margin: '0 0 3px', fontWeight: '600', color: '#1a3d2b', fontSize: '13px' }}>Latest: {workout.type}</p>
                            <p style={{ margin: 0, color: '#6b7280', fontSize: '12px' }}>{workout.distance} · {workout.duration} · {workout.calories} cal · {isRealData ? 'Live data' : 'Demo'}</p>
                        </div>
                    </div>
                ) : (
                    <div>
                        <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: '13px' }}>Connect your Strava account to get meal recommendations based on your real workout data.</p>
                        <button onClick={onStravaLogin} style={{ background: '#fc5200', color: 'white', border: 'none', padding: '9px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                            🚴 Connect Strava
                        </button>
                    </div>
                )}
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '14px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, color: '#1a3d2b', fontSize: '14px', fontWeight: '700' }}>🥗 Dietary Preferences</h3>
                    <button onClick={onEditPreferences} style={{ background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '7px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                        ✏️ Edit
                    </button>
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <p style={{ margin: '0 0 7px', fontWeight: '700', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>🚫 Always Excluded ({userAllergens.length})</p>
                    {userAllergens.length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {userAllergens.map(id => {
                                const a = ALLERGEN_OPTIONS.find(x => x.id === id);
                                return a ? <span key={id} style={{ background: '#fee2e2', color: '#991b1b', padding: '3px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>{a.icon} {a.name}</span> : null;
                            })}
                        </div>
                    ) : <p style={{ margin: 0, color: '#aaa', fontSize: '12px', fontStyle: 'italic' }}>No permanent restrictions set</p>}
                </div>

                <div>
                    <p style={{ margin: '0 0 7px', fontWeight: '700', color: '#6b7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>⏱️ Skip Today ({tempRestrictions.length})</p>
                    {tempRestrictions.length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {tempRestrictions.map(id => {
                                const a = ALLERGEN_OPTIONS.find(x => x.id === id);
                                return a ? <span key={id} style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #f59e0b', padding: '3px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: '600' }}>{a.icon} {a.name}</span> : null;
                            })}
                        </div>
                    ) : <p style={{ margin: 0, color: '#aaa', fontSize: '12px', fontStyle: 'italic' }}>No temporary restrictions for today</p>}
                </div>

                {allRestrictions.length === 0 && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px', marginTop: '10px' }}>
                        <p style={{ margin: 0, color: '#166534', fontSize: '12px' }}>✓ No dietary restrictions — you'll see all available menu items</p>
                    </div>
                )}
            </div>

            <div style={{ background: 'white', borderRadius: '14px', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: '14px', border: '1px solid #d1fae5' }}>
                <h3 style={{ margin: '0 0 12px', color: '#1a3d2b', fontSize: '14px', fontWeight: '700' }}>ℹ️ About InstaMeal</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[['🍽️', 'Data Source', 'Korpa.mk (live scraping)'], ['🤖', 'AI Engine', 'Ollama llama3:8b (local)'], ['📍', 'Location', 'Skopje, Macedonia'], ['🔒', 'Privacy', 'All data stays local']].map(([icon, label, val]) => (
                        <div key={label} style={{ padding: '10px 12px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #d1fae5' }}>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>{icon} {label}</div>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a3d2b' }}>{val}</div>
                        </div>
                    ))}
                </div>
            </div>

            <button onClick={() => onNavigate('home')} style={{ background: 'none', border: '1.5px solid #6ee7b7', color: '#2a9d5c', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                ← Back to Home
            </button>
        </main>
    );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function Dashboard() {
    const [currentPage, setCurrentPage] = useState('home');
    const [accessToken, setAccessToken] = useState(null);
    const [athleteName, setAthleteName] = useState(null);
    const [workout, setWorkout] = useState(mockWorkout);
    const [isRealData, setIsRealData] = useState(false);
    const [loading, setLoading] = useState(false);
    const [restaurants, setRestaurants] = useState([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(false);
    const [userAllergens, setUserAllergens] = useState([]);
    const [tempRestrictions, setTempRestrictions] = useState([]);
    const [allergenModalOpen, setAllergenModalOpen] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [recsLoading, setRecsLoading] = useState(false);
    const [recsDone, setRecsDone] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [nearbyRestaurants, setNearbyRestaurants] = useState([]);
    const [nearbyLoading, setNearbyLoading] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code && !accessToken) handleOAuthCallback(code);
        const saved = localStorage.getItem('instameal_allergens');
        if (saved) setUserAllergens(JSON.parse(saved));
        const savedTemp = sessionStorage.getItem('instameal_temp');
        if (savedTemp) setTempRestrictions(JSON.parse(savedTemp));
        autoLoad();
    }, []);

    useEffect(() => { if (accessToken) loadStravaActivities(); }, [accessToken]);

    async function handleOAuthCallback(code) {
        setLoading(true);
        try {
            const d = await exchangeToken(code);
            setAccessToken(d.access_token);
            setAthleteName(d.athlete?.firstname);
            window.history.replaceState({}, document.title, '/');
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }

    async function loadStravaActivities() {
        setLoading(true);
        try {
            const acts = await fetchStravaActivities(accessToken);
            if (acts.length > 0) { setWorkout(formatActivity(acts[0])); setIsRealData(true); }
        } catch (e) { } finally { setLoading(false); }
    }

    async function autoLoad() {
        setNearbyLoading(true);
        setRestaurantsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async pos => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setUserLocation({ lat, lon });

                const [nearbyResult, korpaResult] = await Promise.allSettled([
                    fetch(`${BACKEND_URL}/api/places/nearby-restaurants`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: lat, longitude: lon, radius: 1000 })
                    }).then(r => r.json()).catch(() => ({ success: false })),
                    fetch(`${BACKEND_URL}/api/korpa/restaurants-near`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: lat, longitude: lon })
                    }).then(r => r.json()).catch(() => ({ success: false }))
                ]);

                if (nearbyResult.status === 'fulfilled' && nearbyResult.value.success) {
                    setNearbyRestaurants(nearbyResult.value.restaurants);
                }
                setNearbyLoading(false);

                if (korpaResult.status === 'fulfilled' && korpaResult.value.success && korpaResult.value.restaurants.length > 0) {
                    setRestaurants(korpaResult.value.restaurants);
                } else {
                    try {
                        const data = await fetchKorpaRestaurants();
                        const seen = new Set();
                        const unique = data.filter(r => {
                            const key = r.id || r.name;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        setRestaurants(unique.length > 0 ? sortByDistance(unique, lat, lon).slice(0, 10) : []);
                    } catch (e) {}
                }
                setRestaurantsLoading(false);
            },
            async () => {
                try {
                    const data = await fetchKorpaRestaurants();
                    const seen = new Set();
                    const unique = data.filter(r => {
                        const key = r.id || r.name;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                    setRestaurants(unique.slice(0, 10));
                } catch (e) {}
                setRestaurantsLoading(false);
                setNearbyLoading(false);
            }
        );
    }

    async function loadKorpa() {
        setRestaurantsLoading(true);
        try {
            const data = await fetchKorpaRestaurants();
            const seen = new Set();
            const unique = data.filter(r => {
                const key = r.id || r.name;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            if (userLocation && unique.length > 0) {
                setRestaurants(sortByDistance(unique, userLocation.lat, userLocation.lon));
            } else {
                setRestaurants(unique);
            }
        } catch (e) { } finally { setRestaurantsLoading(false); }
    }

    async function findNearby() {
        setNearbyLoading(true);
        setRestaurantsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async pos => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setUserLocation({ lat, lon });

                const [nearbyResult, korpaResult] = await Promise.allSettled([
                    fetch(`${BACKEND_URL}/api/places/nearby-restaurants`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: lat, longitude: lon, radius: 1000 })
                    }).then(r => r.json()).catch(() => ({ success: false })),
                    fetch(`${BACKEND_URL}/api/korpa/restaurants-near`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude: lat, longitude: lon })
                    }).then(r => r.json()).catch(() => ({ success: false }))
                ]);

                if (nearbyResult.status === 'fulfilled' && nearbyResult.value.success) {
                    setNearbyRestaurants(nearbyResult.value.restaurants);
                }
                setNearbyLoading(false);

                if (korpaResult.status === 'fulfilled' && korpaResult.value.success && korpaResult.value.restaurants.length > 0) {
                    setRestaurants(korpaResult.value.restaurants);
                } else {
                    try {
                        const data = await fetchKorpaRestaurants();
                        const seen = new Set();
                        const unique = data.filter(r => {
                            const key = r.id || r.name;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });
                        setRestaurants(unique.length > 0 ? sortByDistance(unique, lat, lon).slice(0, 10) : []);
                    } catch (e) {}
                }
                setRestaurantsLoading(false);
            },
            async () => {
                alert('Enable location access');
                try {
                    const data = await fetchKorpaRestaurants();
                    const seen = new Set();
                    const unique = data.filter(r => {
                        const key = r.id || r.name;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                    setRestaurants(unique.slice(0, 10));
                } catch (e) {}
                setRestaurantsLoading(false);
                setNearbyLoading(false);
            }
        );
    }

    function saveAllergens(a) { setUserAllergens(a); localStorage.setItem('instameal_allergens', JSON.stringify(a)); }
    function saveTemp(t) { setTempRestrictions(t); sessionStorage.setItem('instameal_temp', JSON.stringify(t)); }

    async function getRecommendations() {
        if (!restaurants.length) { alert('Load restaurants first!'); return; }
        setRecsLoading(true); setRecsDone(false);
        try {
            const recs = await getMealRecommendations(workout, restaurants, userAllergens, tempRestrictions);
            setRecommendations(recs); setRecsDone(true);
        } catch (e) { } finally { setRecsLoading(false); }
    }

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #c6f2d8 0%, #e6f8ee 180px, #f0faf4 400px, #f2f8f4 100%)' }}>
            <Header athleteName={athleteName} onSettingsClick={() => setAllergenModalOpen(true)} onNavigate={setCurrentPage} />
            <DietaryModal isOpen={allergenModalOpen} onClose={() => setAllergenModalOpen(false)}
                selectedAllergens={userAllergens} tempRestrictions={tempRestrictions}
                onSave={saveAllergens} onSaveTemp={saveTemp} />

            {currentPage === 'dashboard' && (
                <DashboardPage
                    workout={workout} isRealData={isRealData}
                    recommendations={recommendations} restaurants={restaurants}
                    nearbyRestaurants={nearbyRestaurants} userAllergens={userAllergens}
                    tempRestrictions={tempRestrictions} recsLoading={recsLoading}
                    restaurantsLoading={restaurantsLoading} nearbyLoading={nearbyLoading}
                    onGetRecommendations={getRecommendations} onNavigate={setCurrentPage}
                />
            )}

            {currentPage === 'profile' && (
                <ProfilePage
                    athleteName={athleteName} accessToken={accessToken}
                    userAllergens={userAllergens} tempRestrictions={tempRestrictions}
                    workout={workout} isRealData={isRealData}
                    onEditPreferences={() => setAllergenModalOpen(true)}
                    onStravaLogin={handleStravaLogin} onNavigate={setCurrentPage}
                />
            )}

            {currentPage === 'home' && (
                <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

                    {!accessToken && (
                        <div style={{ background: 'white', borderRadius: '14px', padding: '26px', textAlign: 'center', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #d1fae5' }}>
                            <h2 style={{ margin: '0 0 16px', color: '#1a3d2b' }}>Connect Your Strava Account</h2>
                            <button onClick={handleStravaLogin} style={{
                                background: '#fc5200', color: 'white', border: 'none',
                                padding: '14px 32px', borderRadius: '6px',
                                cursor: 'pointer', fontWeight: 'bold', fontSize: '15px',
                                letterSpacing: '0.3px', boxShadow: '0 4px 12px rgba(252,82,0,0.35)'
                            }}>
                                🚴 Connect Strava
                            </button>
                        </div>
                    )}

                    {loading && <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>Loading workout data...</div>}
                    {!loading && <WorkoutCard workout={workout} isReal={isRealData} />}

                    <RestrictionsBanner allergens={userAllergens} tempRestrictions={tempRestrictions} onEdit={() => setAllergenModalOpen(true)} />

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px', alignItems: 'center' }}>
                        <button onClick={loadKorpa} style={{
                            background: '#10b981', color: 'white', border: 'none',
                            padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                        }}>
                            🍽️ Load Restaurants
                        </button>
                        <button onClick={findNearby} style={{
                            background: 'linear-gradient(135deg, #2a9d5c, #0ea59a)', color: 'white', border: 'none',
                            padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                        }}>
                            📍 Find Nearby
                        </button>
                        <button onClick={getRecommendations} disabled={recsLoading} style={{
                            background: recsLoading ? '#d1fae5' : 'linear-gradient(135deg, #f59e0b, #f97316)',
                            color: recsLoading ? '#6b7280' : 'white', border: 'none',
                            padding: '8px 15px', borderRadius: '8px',
                            cursor: recsLoading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '700'
                        }}>
                            {recsLoading ? '🤖 Thinking...' : '🤖 AI Suggestions'}
                        </button>
                        <button onClick={() => setAllergenModalOpen(true)} style={{
                            background: 'white', color: '#2a9d5c',
                            border: '1.5px solid #6ee7b7',
                            padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                        }}>
                            🥗 Food Preferences
                        </button>
                    </div>

                    <RecommendationsSection recommendations={recommendations} loading={recsLoading} done={recsDone} workout={workout} onRefresh={getRecommendations} />
                    <NearbySection nearby={nearbyRestaurants} loading={nearbyLoading} />
                    <RestaurantList restaurants={restaurants} loading={restaurantsLoading} userAllergens={userAllergens} tempRestrictions={tempRestrictions} onOpenSettings={() => setAllergenModalOpen(true)} />
                </main>
            )}
        </div>
    );
}

function App() { return <Dashboard />; }
export default App;
import { useState, useEffect } from 'react';

const STRAVA_CLIENT_ID = '181133';
const REDIRECT_URI = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:3001';

const mockWorkout = {
    type: 'Run',
    distance: '8.2 km',
    duration: '42 min',
    intensity: 'High',
    calories: 520,
    date: 'Today'
};

function handleStravaLogin() {
    const scope = 'read,activity:read_all';
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&approval_prompt=force&scope=${scope}`;
    window.location.href = authUrl;
}

async function exchangeToken(code) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/strava/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error exchanging token:', error);
        throw error;
    }
}

async function fetchStravaActivities(accessToken) {
    try {
        const response = await fetch('https://www.strava.com/api/v3/athlete/activities?per_page=10', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch activities');
        }

        const activities = await response.json();
        return activities;
    } catch (error) {
        console.error('Error fetching Strava activities:', error);
        return [];
    }
}

async function fetchKorpaRestaurants() {
    try {
        console.log('Fetching restaurants from Korpa...');
        const response = await fetch(`${BACKEND_URL}/api/korpa/restaurants`);
        const data = await response.json();

        if (data.success) {
            console.log(`Loaded ${data.count} restaurants (cached: ${data.cached})`);
            return data.restaurants;
        } else {
            console.error('Failed to load restaurants:', data.error);
            return [];
        }
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        return [];
    }
}

function formatActivity(activity) {
    const distanceKm = (activity.distance / 1000).toFixed(1);
    const durationMin = Math.round(activity.moving_time / 60);

    return {
        type: activity.type,
        distance: `${distanceKm} km`,
        duration: `${durationMin} min`,
        intensity: activity.average_heartrate ? 'High' : 'Moderate',
        calories: Math.round(activity.kilojoules * 0.239) || 'N/A',
        date: new Date(activity.start_date).toLocaleDateString()
    };
}

function Header({ athleteName }) {
    return (
        <header style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            padding: '20px',
            color: 'white',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '28px' }}>🍽️ InstaMeal</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {athleteName && (
                        <span style={{ fontSize: '14px', opacity: 0.9 }}>
                            Welcome, {athleteName}!
                        </span>
                    )}
                    <nav style={{ display: 'flex', gap: '12px' }}>
                        <button style={navButtonStyle}>Dashboard</button>
                        <button style={navButtonStyle}>Profile</button>
                        <button style={navButtonStyle}>Settings</button>
                    </nav>
                </div>
            </div>
        </header>
    );
}

function WorkoutCard({ workout, isReal }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            marginBottom: '24px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, color: '#333' }}>
                    {isReal ? 'Latest Workout' : "Today's Workout (Demo)"}
                </h2>
                <span style={{
                    background: isReal ? '#10b981' : '#f59e0b',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    {isReal ? 'LIVE DATA' : 'DEMO'}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
                <WorkoutStat label="Type" value={workout.type} icon="🏃" />
                <WorkoutStat label="Distance" value={workout.distance} icon="📏" />
                <WorkoutStat label="Duration" value={workout.duration} icon="⏱️" />
                <WorkoutStat label="Intensity" value={workout.intensity} icon="🔥" />
                <WorkoutStat label="Calories" value={workout.calories} icon="⚡" />
                <WorkoutStat label="Date" value={workout.date} icon="📅" />
            </div>
        </div>
    );
}

function WorkoutStat({ label, value, icon }) {
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '4px' }}>{icon}</div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>{value}</div>
        </div>
    );
}

function RealRestaurantCard({ restaurant }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            transition: 'transform 0.2s, box-shadow 0.2s',
            cursor: 'pointer'
        }}
             onClick={() => setExpanded(!expanded)}
             onMouseEnter={(e) => {
                 e.currentTarget.style.transform = 'translateY(-4px)';
                 e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
             }}
             onMouseLeave={(e) => {
                 e.currentTarget.style.transform = 'translateY(0)';
                 e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
             }}>

            {/* Restaurant Header with Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                {restaurant.logo && (
                    <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '12px',
                        backgroundImage: `url(${restaurant.logo})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                    }} />
                )}
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 4px 0', color: '#333' }}>{restaurant.name}</h3>
                    <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
                        {restaurant.menuCount} menu items available
                    </p>
                </div>
                <span style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    REAL
                </span>
            </div>

            {/* Banner Image */}
            {restaurant.banner && (
                <div style={{
                    width: '100%',
                    height: '150px',
                    borderRadius: '8px',
                    backgroundImage: `url(${restaurant.banner})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    marginBottom: '12px'
                }} />
            )}

            {/* Menu Items Preview */}
            <div style={{ marginBottom: '12px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666', textTransform: 'uppercase' }}>
                    Sample Menu Items
                </h4>
                {restaurant.menu.slice(0, expanded ? restaurant.menu.length : 3).map((item, idx) => (
                    <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid #f3f4f6'
                    }}>
                        <span style={{ fontSize: '14px', color: '#333' }}>{item.name}</span>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#667eea' }}>
                            {item.price}
                        </span>
                    </div>
                ))}
            </div>

            {/* Expand/Collapse Button */}
            {restaurant.menu.length > 3 && (
                <button style={{
                    width: '100%',
                    padding: '8px',
                    background: '#f3f4f6',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    color: '#666',
                    fontWeight: '500'
                }}>
                    {expanded ? 'Show Less ▲' : `Show All ${restaurant.menu.length} Items ▼`}
                </button>
            )}

            {/* Order Button */}
            <a
                href={restaurant.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    display: 'block',
                    marginTop: '12px',
                    padding: '12px',
                    background: '#667eea',
                    color: 'white',
                    textAlign: 'center',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontWeight: 'bold'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                View on Korpa.mk →
            </a>
        </div>
    );
}

function RestaurantList({ restaurants, loading }) {
    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🍽️</div>
                <p style={{ color: '#666', fontSize: '18px' }}>Loading restaurants from Korpa.mk...</p>
                <p style={{ color: '#999', fontSize: '14px' }}>This may take up to 30 seconds on first load</p>
            </div>
        );
    }

    if (!restaurants || restaurants.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <p style={{ color: '#666' }}>No restaurants available. Make sure the backend is running!</p>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#333' }}>
                    Available Restaurants ({restaurants.length})
                </h2>
                <span style={{
                    background: '#10b981',
                    color: 'white',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    ✓ LIVE FROM KORPA.MK
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {restaurants.map(restaurant => (
                    <RealRestaurantCard key={restaurant.id} restaurant={restaurant} />
                ))}
            </div>
        </div>
    );
}

function Dashboard() {
    const [accessToken, setAccessToken] = useState(null);
    const [athleteName, setAthleteName] = useState(null);
    const [workout, setWorkout] = useState(mockWorkout);
    const [isRealData, setIsRealData] = useState(false);
    const [loading, setLoading] = useState(false);

    const [restaurants, setRestaurants] = useState([]);
    const [restaurantsLoading, setRestaurantsLoading] = useState(true);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code && !accessToken) {
            handleOAuthCallback(code);
        }
    }, [accessToken]);

    useEffect(() => {
        if (accessToken) {
            loadStravaActivities();
        }
    }, [accessToken]);

    useEffect(() => {
        loadRestaurants();
    }, []);

    async function handleOAuthCallback(code) {
        setLoading(true);
        try {
            const tokenData = await exchangeToken(code);
            setAccessToken(tokenData.access_token);
            setAthleteName(tokenData.athlete.firstname);
            window.history.replaceState({}, document.title, '/');
        } catch (error) {
            console.error('Failed to authenticate:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadStravaActivities() {
        setLoading(true);
        try {
            const activities = await fetchStravaActivities(accessToken);
            if (activities.length > 0) {
                setWorkout(formatActivity(activities[0]));
                setIsRealData(true);
            }
        } catch (error) {
            console.error('Failed to load activities:', error);
        } finally {
            setLoading(false);
        }
    }

    async function loadRestaurants() {
        setRestaurantsLoading(true);
        try {
            const data = await fetchKorpaRestaurants();
            setRestaurants(data);
        } catch (error) {
            console.error('Failed to load restaurants:', error);
        } finally {
            setRestaurantsLoading(false);
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
            <Header athleteName={athleteName} />

            <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px' }}>
                {!accessToken && (
                    <div style={{
                        background: 'white',
                        borderRadius: '16px',
                        padding: '32px',
                        textAlign: 'center',
                        marginBottom: '24px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        <h2 style={{ margin: '0 0 12px 0', color: '#333' }}>Connect Your Strava Account</h2>
                        <p style={{ margin: '0 0 24px 0', color: '#666' }}>
                            Get personalized meal recommendations based on your workouts
                        </p>
                        <button
                            onClick={handleStravaLogin}
                            disabled={STRAVA_CLIENT_ID === 'YOUR_CLIENT_ID_HERE'}
                            style={{
                                background: STRAVA_CLIENT_ID === 'YOUR_CLIENT_ID_HERE' ? '#94a3b8' : '#fc5200',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                cursor: STRAVA_CLIENT_ID === 'YOUR_CLIENT_ID_HERE' ? 'not-allowed' : 'pointer',
                                fontWeight: 'bold',
                                fontSize: '16px'
                            }}
                        >
                            {STRAVA_CLIENT_ID === 'YOUR_CLIENT_ID_HERE' ? 'Add API Key First' : 'Connect Strava'}
                        </button>
                    </div>
                )}

                {STRAVA_CLIENT_ID === 'YOUR_CLIENT_ID_HERE' && (
                    <div style={{
                        background: '#fee2e2',
                        border: '2px solid #ef4444',
                        borderRadius: '12px',
                        padding: '20px',
                        marginBottom: '24px'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#991b1b' }}>
                            ⚠️ Setup Required
                        </p>
                        <p style={{ margin: 0, color: '#991b1b', fontSize: '14px' }}>
                            Please add your Strava Client ID on line 6 of the code
                        </p>
                    </div>
                )}

                {loading && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        Loading your workout data...
                    </div>
                )}

                {!loading && <WorkoutCard workout={workout} isReal={isRealData} />}

                {/* NEW: Real restaurant list */}
                <RestaurantList restaurants={restaurants} loading={restaurantsLoading} />
            </main>
        </div>
    );
}

const navButtonStyle = {
    background: 'rgba(255,255,255,0.2)',
    border: 'none',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500'
};

function App() {
    return <Dashboard />;
}

export default App;
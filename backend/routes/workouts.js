const express = require('express');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ── Calorie estimation (used when a manual workout omits calories) ────────────
// Rough MET values; kcal = MET * 3.5 * kg / 200 * minutes.
const MET = {
    run: 9.8, ride: 7.5, cycling: 7.5, swim: 8.3, walk: 3.8, hike: 6.0,
    strength: 5.0, gym: 5.0, weights: 5.0, crossfit: 8.0, yoga: 3.0,
    hiit: 9.0, row: 7.0, elliptical: 5.0, football: 8.0, basketball: 6.5,
    tennis: 7.3, default: 6.0,
};
const INTENSITY_MULT = { low: 0.8, moderate: 1.0, high: 1.25, max: 1.4 };

function estimateCalories({ type, duration_min, intensity }, weightKg) {
    if (!duration_min) return null;
    const kg = weightKg || 75;
    const key = String(type || '').toLowerCase().split(/\s|-/)[0];
    const met = MET[key] || MET.default;
    const mult = INTENSITY_MULT[String(intensity || 'moderate').toLowerCase()] || 1;
    return Math.round((met * 3.5 * kg) / 200 * duration_min * mult);
}

function userWeight(userId) {
    const p = db.prepare('SELECT weight_kg FROM profiles WHERE user_id = ?').get(userId);
    return p ? p.weight_kg : null;
}

// Sum of calories from workouts whose start_time is "today" (server local date).
function workoutCaloriesToday(userId) {
    const row = db
        .prepare(
            `SELECT COALESCE(SUM(calories), 0) AS total
             FROM workouts
             WHERE user_id = ? AND date(start_time) = date('now', 'localtime')`
        )
        .get(userId);
    return row ? row.total : 0;
}

function listWorkouts(userId, { from, to, limit = 50 } = {}) {
    let sql = 'SELECT * FROM workouts WHERE user_id = ?';
    const args = [userId];
    if (from) { sql += ' AND start_time >= ?'; args.push(from); }
    if (to) { sql += ' AND start_time <= ?'; args.push(to); }
    sql += ' ORDER BY start_time DESC LIMIT ?';
    args.push(limit);
    return db.prepare(sql).all(...args);
}

router.use(requireAuth);

// ── CRUD ────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.json({ workouts: listWorkouts(req.userId, { limit: 100 }) });
});

router.post('/', (req, res) => {
    const b = req.body || {};
    const type = String(b.type || '').trim();
    const startTime = b.start_time || new Date().toISOString();
    if (!type) return res.status(400).json({ error: 'Workout type is required' });

    const workout = {
        type,
        duration_min: b.duration_min != null ? Number(b.duration_min) : null,
        distance_km: b.distance_km != null ? Number(b.distance_km) : null,
        intensity: b.intensity || 'moderate',
    };
    const calories =
        b.calories != null && b.calories !== ''
            ? Number(b.calories)
            : estimateCalories(workout, userWeight(req.userId));

    const info = db
        .prepare(
            `INSERT INTO workouts
               (user_id, source, type, start_time, duration_min, distance_km, intensity, calories, planned)
             VALUES (?, 'manual', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            req.userId,
            type,
            startTime,
            workout.duration_min,
            workout.distance_km,
            workout.intensity,
            calories,
            b.planned ? 1 : 0
        );
    res.json({ workout: db.prepare('SELECT * FROM workouts WHERE id = ?').get(info.lastInsertRowid) });
});

router.delete('/:id', (req, res) => {
    db.prepare('DELETE FROM workouts WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
    res.json({ ok: true });
});

// ── Google Calendar import ──────────────────────────────────────────────────
const WORKOUT_KEYWORDS = [
    'run', ' run', 'jog', 'ride', 'cycl', 'bike', 'swim', 'gym', 'workout', 'training',
    'train', 'wod', 'crossfit', 'yoga', 'pilates', 'lift', 'strength', 'hiit', 'cardio',
    'race', 'marathon', 'session', 'тренинг', 'трчање', 'фитнес',
];

async function freshGoogleToken(userId) {
    const conn = db
        .prepare("SELECT * FROM connections WHERE user_id = ? AND provider = 'google'")
        .get(userId);
    if (!conn) return null;

    const notExpired = conn.expires_at && conn.expires_at - Date.now() > 60_000;
    if (notExpired && conn.access_token) return conn.access_token;

    if (!conn.refresh_token || !process.env.GOOGLE_CLIENT_ID) return conn.access_token || null;
    try {
        const client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        client.setCredentials({ refresh_token: conn.refresh_token });
        const { credentials } = await client.refreshAccessToken();
        db.prepare(
            `UPDATE connections SET access_token = ?, expires_at = ?, updated_at = datetime('now')
             WHERE user_id = ? AND provider = 'google'`
        ).run(credentials.access_token, credentials.expiry_date || null, userId);
        return credentials.access_token;
    } catch (err) {
        console.error('[workouts] google token refresh failed:', err.message);
        return conn.access_token || null;
    }
}

router.get('/import/google', async (req, res) => {
    const conn = db
        .prepare("SELECT * FROM connections WHERE user_id = ? AND provider = 'google'")
        .get(req.userId);
    if (!conn) {
        return res
            .status(409)
            .json({ error: 'Google Calendar is not connected. Sign in with Google first.' });
    }
    if (conn.scope && !conn.scope.includes('calendar')) {
        return res.status(409).json({
            error:
                'FitFuel was not granted calendar access. Sign out, sign in with Google again, ' +
                'and keep the "See events on Google Calendar" box ticked on the consent screen.',
        });
    }

    const token = await freshGoogleToken(req.userId);
    if (!token) {
        return res
            .status(409)
            .json({ error: 'Google Calendar is not connected. Sign in with Google first.' });
    }

    try {
        const now = new Date();
        const timeMax = new Date(now.getTime() + 48 * 3.6e6);
        const { data } = await axios.get(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
                params: {
                    timeMin: now.toISOString(),
                    timeMax: timeMax.toISOString(),
                    singleEvents: true,
                    orderBy: 'startTime',
                    maxResults: 50,
                },
                headers: { Authorization: `Bearer ${token}` },
            }
        );

        const imported = [];
        const insert = db.prepare(
            `INSERT INTO workouts
               (user_id, source, type, start_time, duration_min, intensity, calories, planned, external_id)
             VALUES (?, 'google', ?, ?, ?, 'moderate', ?, 1, ?)
             ON CONFLICT(user_id, source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET
               type = excluded.type, start_time = excluded.start_time,
               duration_min = excluded.duration_min, calories = excluded.calories`
        );

        for (const ev of data.items || []) {
            const text = `${ev.summary || ''} ${ev.description || ''}`.toLowerCase();
            const isWorkout = WORKOUT_KEYWORDS.some((k) => text.includes(k));
            if (!isWorkout) continue;

            const start = ev.start?.dateTime || ev.start?.date;
            const end = ev.end?.dateTime || ev.end?.date;
            if (!start) continue;
            const durationMin =
                start && end ? Math.round((new Date(end) - new Date(start)) / 60000) : null;
            const type = (ev.summary || 'Workout').trim();
            const calories = estimateCalories(
                { type, duration_min: durationMin, intensity: 'moderate' },
                userWeight(req.userId)
            );
            insert.run(req.userId, type, start, durationMin, calories, ev.id);
            imported.push({ type, start_time: start, duration_min: durationMin, calories });
        }

        res.json({ imported: imported.length, workouts: listWorkouts(req.userId, { limit: 100 }) });
    } catch (err) {
        const g = err.response?.data?.error;
        const gMsg = typeof g === 'object' ? g.message : g || err.message;
        const status = err.response?.status;
        console.error('[workouts] google calendar fetch failed:', status, gMsg);

        let hint = 'Could not read Google Calendar.';
        if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(gMsg || '')) {
            hint =
                'The Google Calendar API is not enabled for this project. Enable it at ' +
                'console.cloud.google.com → APIs & Services → Library → "Google Calendar API", wait a minute, then retry.';
        } else if (status === 403 || status === 401 || /insufficient|scope|invalid_grant|invalid credentials|unauthenticated/i.test(gMsg || '')) {
            hint =
                'FitFuel does not have calendar permission. Go to Profile → Sign out, then "Continue with Google" again ' +
                'and keep the calendar checkbox ticked.';
        } else if (!err.response) {
            hint = `Could not reach Google (${err.code || 'network error'}). Check your internet / DNS and retry.`;
        }
        res.status(502).json({ error: hint, googleError: `${status || err.code || '?'}: ${gMsg || 'unknown'}` });
    }
});


module.exports = router;
module.exports.workoutCaloriesToday = workoutCaloriesToday;
module.exports.listWorkouts = listWorkouts;
module.exports.estimateCalories = estimateCalories;

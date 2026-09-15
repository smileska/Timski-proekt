const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { dailyTargets } = require('../lib/nutrition');
const { workoutCaloriesToday } = require('./workouts');

const router = express.Router();
router.use(requireAuth);

const SEXES = ['male', 'female', 'other'];
const ACTIVITY = ['sedentary', 'light', 'moderate', 'active', 'athlete'];
const GOALS = ['lose_fat', 'build_muscle', 'gain_weight', 'maintain', 'endurance'];
const SEVERITIES = ['mild', 'moderate', 'severe'];

function loadProfile(userId) {
    return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) || null;
}

function loadDietary(userId) {
    return db
        .prepare('SELECT restriction_id AS id, severity, label FROM dietary WHERE user_id = ?')
        .all(userId);
}

function serialize(userId) {
    const profile = loadProfile(userId);
    const dietary = loadDietary(userId);
    const targets = profile
        ? dailyTargets(profile, workoutCaloriesToday(userId))
        : null;
    return { profile, dietary, targets };
}

router.get('/', (req, res) => {
    res.json(serialize(req.userId));
});

router.put('/', (req, res) => {
    const b = req.body || {};
    const num = (v) => (v === '' || v == null ? null : Number(v));

    const sex = SEXES.includes(b.sex) ? b.sex : null;
    const age = num(b.age);
    const heightCm = num(b.height_cm);
    const weightKg = num(b.weight_kg);
    const activity = ACTIVITY.includes(b.activity_level) ? b.activity_level : 'moderate';
    const goal = GOALS.includes(b.goal) ? b.goal : 'maintain';
    const foodPreferences =
        typeof b.food_preferences === 'string' ? b.food_preferences.trim().slice(0, 500) || null : null;

    if (age != null && (age < 10 || age > 120)) {
        return res.status(400).json({ error: 'Age looks off' });
    }
    if (heightCm != null && (heightCm < 100 || heightCm > 250)) {
        return res.status(400).json({ error: 'Height (cm) looks off' });
    }
    if (weightKg != null && (weightKg < 30 || weightKg > 400)) {
        return res.status(400).json({ error: 'Weight (kg) looks off' });
    }

    db.prepare(
        `INSERT INTO profiles (user_id, sex, age, height_cm, weight_kg, activity_level, goal, food_preferences, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           sex = excluded.sex, age = excluded.age, height_cm = excluded.height_cm,
           weight_kg = excluded.weight_kg, activity_level = excluded.activity_level,
           goal = excluded.goal, food_preferences = excluded.food_preferences, updated_at = datetime('now')`
    ).run(req.userId, sex, age, heightCm, weightKg, activity, goal, foodPreferences);

    if (Array.isArray(b.dietary)) {
        db.prepare('DELETE FROM dietary WHERE user_id = ?').run(req.userId);
        const ins = db.prepare(
            'INSERT OR IGNORE INTO dietary (user_id, restriction_id, severity, label) VALUES (?, ?, ?, ?)'
        );
        for (const entry of b.dietary) {
            const obj = typeof entry === 'string' ? { id: entry } : entry || {};
            const id = String(obj.id || '').trim().slice(0, 40);
            if (!id) continue;
            const severity = SEVERITIES.includes(obj.severity) ? obj.severity : 'severe';
            const label = obj.label ? String(obj.label).trim().slice(0, 60) : null;
            ins.run(req.userId, id, severity, label);
        }
    }

    res.json(serialize(req.userId));
});

module.exports = router;
module.exports.loadProfile = loadProfile;
module.exports.loadDietary = loadDietary;

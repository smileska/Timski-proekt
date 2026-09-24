const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { dailyTargets, mealTiming } = require('../lib/nutrition');
const { classifyItem } = require('../lib/allergens');
const { generateJSON, aiStatus, AIError } = require('../lib/ai');
const { getNearby } = require('../lib/restaurants');
const { workoutCaloriesToday } = require('./workouts');

const router = express.Router();
router.use(requireAuth);

const GOAL_LABELS = {
    lose_fat: 'lose body fat',
    build_muscle: 'build muscle',
    gain_weight: 'gain weight',
    maintain: 'maintain weight',
    endurance: 'improve endurance',
};
const TIMING_LABELS = {
    pre_workout: 'pre-workout (needs easy-to-digest carbs + moderate protein, lower fat/fibre)',
    post_workout: 'post-workout recovery (needs high protein + carbs to refuel glycogen)',
    breakfast: 'breakfast',
    lunch: 'lunch',
    afternoon_snack: 'afternoon snack',
    dinner: 'dinner',
    late_meal: 'late meal (keep it lighter, protein-forward)',
};

function todayISO() {
    return new Date().toISOString().slice(0, 10);
}

function loadContext(userId) {
    const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
    const dietary = db
        .prepare('SELECT restriction_id AS id, severity, label FROM dietary WHERE user_id = ?')
        .all(userId);
    const bloodwork = db
        .prepare(
            `SELECT report_type, summary, nutrition_notes, analyzed_at FROM blood_work
             WHERE user_id = ? AND parsed = 1 ORDER BY analyzed_at DESC LIMIT 2`
        )
        .all(userId);

    const now = new Date();
    const workoutKcal = workoutCaloriesToday(userId);
    const targets = profile ? dailyTargets(profile, workoutKcal) : null;

    const recentWorkout = db
        .prepare(
            `SELECT * FROM workouts WHERE user_id = ? AND start_time <= ?
             ORDER BY start_time DESC LIMIT 1`
        )
        .get(userId, now.toISOString());
    const nextWorkout = db
        .prepare(
            `SELECT * FROM workouts WHERE user_id = ? AND start_time > ?
             ORDER BY start_time ASC LIMIT 1`
        )
        .get(userId, now.toISOString());

    const lastEnd = recentWorkout
        ? new Date(
              new Date(recentWorkout.start_time).getTime() +
                  (recentWorkout.duration_min || 0) * 60000
          )
        : null;
    const nextStart = nextWorkout ? new Date(nextWorkout.start_time) : null;
    const timing = mealTiming(now, nextStart, lastEnd);

    const eaten = db
        .prepare(
            `SELECT COALESCE(SUM(calories),0) c, COALESCE(SUM(protein_g),0) p,
                    COALESCE(SUM(carb_g),0) cb, COALESCE(SUM(fat_g),0) f
             FROM meal_log WHERE user_id = ? AND date = ?`
        )
        .get(userId, todayISO());
    const eatenMeals = db
        .prepare('SELECT name, restaurant FROM meal_log WHERE user_id = ? AND date = ?')
        .all(userId, todayISO());

    return { profile, dietary, targets, recentWorkout, nextWorkout, timing, eaten, eatenMeals, bloodwork };
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const mealKey = (name, restaurant) => `${norm(name)}|${norm(restaurant)}`;

const DEFAULT_MAX_DISTANCE_KM = 10;

async function buildCandidateMeals({ latitude, longitude }, restrictions, maxDistanceKm, eatenKeys) {
    // Keep the candidate list modest — local models get slow and sloppy with
    // very long prompts.
    const isLocal = aiStatus().provider === 'ollama';
    const { restaurants, noService, servedCities } = await getNearby(latitude, longitude, {
        withMenus: true,
        woltLimit: isLocal ? 5 : 8,
        menuLimit: isLocal ? 5 : 6,
    });

    // Hard radius cutoff — drop restaurants further than maxDistanceKm so the
    // AI can't pick something inconvenient just because it's a great macro fit.
    // Restaurants with unknown distance (e.g. Korpa entries with no coordinates)
    // are kept since we can't tell whether they violate the radius. If nothing
    // is left within radius, fall back to the full list rather than showing
    // "no restaurants" when options exist just outside an arbitrary line.
    let candidateRestaurants = restaurants;
    let radiusRelaxed = false;
    if (Number.isFinite(maxDistanceKm)) {
        const inRadius = restaurants.filter(
            (r) => r.distanceKm == null || r.distanceKm <= maxDistanceKm
        );
        if (inRadius.length > 0) {
            candidateRestaurants = inRadius;
        } else if (restaurants.length > 0) {
            radiusRelaxed = true;
        }
    }

    const perMenu = isLocal ? 12 : 18;

    const meals = [];
    for (const r of candidateRestaurants) {
        if (!r.menu || r.menu.length === 0) continue;
        const distLabel =
            r.distanceKm != null
                ? r.distanceKm < 1
                    ? `${Math.round(r.distanceKm * 1000)} m away`
                    : `${r.distanceKm.toFixed(1)} km away`
                : null;
        for (const item of r.menu.slice(0, perMenu)) {
            // Don't suggest something the user already ate today.
            if (eatenKeys.has(mealKey(item.name, r.name))) continue;
            const flag = classifyItem(item, restrictions);
            if (flag === 'blocked') continue;
            meals.push({
                name: item.name,
                description: item.description || '',
                price: item.price && item.price !== '0' ? item.price : null,
                restaurant: r.name,
                restaurantUrl: r.url,
                distance: distLabel,
                via: r.source,
                allergenFlag: flag || undefined,
            });
        }
    }
    return { meals, noService, servedCities, radiusRelaxed };
}

router.post('/', async (req, res) => {
    if (!aiStatus().ready) {
        return res.status(503).json({
            success: false,
            error: 'AI provider is not ready. Set ANTHROPIC_API_KEY, or run Ollama locally.',
        });
    }

    const { latitude, longitude, locationLabel, tempRestrictions = [], maxDistanceKm } = req.body || {};
    const effectiveMaxDistanceKm =
        Number.isFinite(Number(maxDistanceKm)) && Number(maxDistanceKm) > 0
            ? Number(maxDistanceKm)
            : DEFAULT_MAX_DISTANCE_KM;
    const ctx = loadContext(req.userId);

    if (!ctx.profile || !ctx.targets || !ctx.targets.calorieTarget) {
        return res
            .status(409)
            .json({ success: false, error: 'Complete your profile (height, weight, age, goal) first.' });
    }

    const restrictionMap = new Map();
    for (const raw of [...ctx.dietary, ...tempRestrictions]) {
        const r = typeof raw === 'string' ? { id: raw, severity: 'severe' } : raw;
        if (r && r.id) restrictionMap.set(r.id, r);
    }
    const restrictions = [...restrictionMap.values()];
    const { meals, noService, servedCities, radiusRelaxed } = await buildCandidateMeals(
        { latitude, longitude },
        restrictions,
        effectiveMaxDistanceKm,
        new Set(ctx.eatenMeals.map((m) => mealKey(m.name, m.restaurant)))
    );
    if (meals.length === 0) {
        return res.json({
            success: true,
            noService,
            dailySummary: noService
                ? `No delivery restaurants reach your location yet. Wolt and Korpa.mk currently cover ${servedCities.join(', ')}.`
                : 'No nearby menu items matched your dietary filters — try relaxing them.',
            recommendations: [],
        });
    }

    const remaining = {
        calories: Math.round(ctx.targets.calorieTarget - ctx.eaten.c),
        protein_g: Math.round(ctx.targets.protein_g - ctx.eaten.p),
        carb_g: Math.round(ctx.targets.carb_g - ctx.eaten.cb),
        fat_g: Math.round(ctx.targets.fat_g - ctx.eaten.f),
    };

    const userPayload = {
        athlete: {
            sex: ctx.profile.sex,
            age: ctx.profile.age,
            height_cm: ctx.profile.height_cm,
            weight_kg: ctx.profile.weight_kg,
            bmi: ctx.targets.bmi,
            bmi_category: ctx.targets.bmiCategory,
            activity_level: ctx.profile.activity_level,
            goal: GOAL_LABELS[ctx.profile.goal] || ctx.profile.goal,
            food_preferences: ctx.profile.food_preferences || null,
        },
        health_markers: ctx.bloodwork.map((b) => ({
            type: b.report_type,
            summary: b.summary,
            nutrition_notes: b.nutrition_notes,
        })),
        daily_targets: {
            calories: ctx.targets.calorieTarget,
            protein_g: ctx.targets.protein_g,
            carb_g: ctx.targets.carb_g,
            fat_g: ctx.targets.fat_g,
            workout_calories_today: ctx.targets.workoutCaloriesToday,
        },
        already_eaten_today: {
            calories: Math.round(ctx.eaten.c),
            protein_g: Math.round(ctx.eaten.p),
            carb_g: Math.round(ctx.eaten.cb),
            fat_g: Math.round(ctx.eaten.f),
        },
        meals_eaten_today: ctx.eatenMeals.map((m) =>
            m.restaurant ? `${m.name} (${m.restaurant})` : m.name
        ),
        remaining_today: remaining,
        meal_timing: TIMING_LABELS[ctx.timing] || ctx.timing,
        recent_workout: ctx.recentWorkout
            ? {
                  type: ctx.recentWorkout.type,
                  when: ctx.recentWorkout.start_time,
                  duration_min: ctx.recentWorkout.duration_min,
                  intensity: ctx.recentWorkout.intensity,
                  calories: ctx.recentWorkout.calories,
              }
            : null,
        next_workout: ctx.nextWorkout
            ? {
                  type: ctx.nextWorkout.type,
                  when: ctx.nextWorkout.start_time,
                  duration_min: ctx.nextWorkout.duration_min,
              }
            : null,
        dietary_restrictions: restrictions,
        location: locationLabel || null,
    };

    const prompt = `You are a sports-nutrition assistant helping an athlete order a single meal from a nearby restaurant.

ATHLETE + NUTRITION CONTEXT (JSON):
${JSON.stringify(userPayload, null, 2)}

AVAILABLE MENU ITEMS FROM NEARBY RESTAURANTS (JSON array):
${JSON.stringify(meals, null, 2)}

TASK:
- Pick the 3 best menu items for THIS meal, ranked best-first.
- Optimise for the athlete's goal, the meal timing, and the macros they still have left today.
- The list is already restricted to restaurants within ${effectiveMaxDistanceKm} km (items with no
  "distance" value have unknown coordinates but are still within the delivery area) — you don't need
  to exclude anything further for distance, just prefer closer options when the nutritional fit is similar.
- Pick from at least 2 different restaurants unless one clearly dominates.
- Add variety: avoid dishes very similar to anything in meals_eaten_today (same kind of dish or main
  ingredient), and prefer restaurants they haven't already ordered from today when the fit is similar.
- Copy the "meal" and "restaurant" strings EXACTLY as they appear in the list above.
- Items are already filtered for hard allergen/dietary blocks. Items tagged allergenFlag "deprioritized"
  clash with a moderate restriction — avoid them unless clearly the best option available. Items tagged
  "flagged" clash with only a mild preference — fine to pick, but mention it briefly in "why".
- If athlete.food_preferences is set, weigh it as a soft signal — prefer a good match when options are
  otherwise similar, but never hard-exclude on it.
- If health_markers are present, let them softly influence food choice (e.g. lower sodium if flagged high,
  more iron-rich options if flagged low) without diagnosing anything or overriding the goal/dietary_restrictions.
- Estimate macros from the item name/description; be realistic, mark them approximate.

Reply with ONLY valid JSON, no prose, in exactly this shape:
{
  "dailySummary": "1-2 sentences on how they're tracking vs targets and what this meal should do",
  "recommendations": [
    {
      "meal": "exact item name from the list",
      "restaurant": "exact restaurant name from the list",
      "why": "1-2 sentences tying it to their goal + timing + remaining macros",
      "macros": { "calories": 0, "protein_g": 0, "carb_g": 0, "fat_g": 0 },
      "timingFit": "pre-workout | post-workout | anytime"
    }
  ]
}`;

    try {
        const parsed = await generateJSON({
            system: 'You are a precise sports-nutrition assistant. You only ever reply with a single valid JSON object.',
            prompt,
        });

        const recommendations = (parsed.recommendations || [])
            .map((rec) => {
                const m = norm(rec.meal);
                const r = norm(rec.restaurant);
                // Match on meal + restaurant so we never attach the wrong order link.
                const match =
                    meals.find((x) => norm(x.name) === m && norm(x.restaurant) === r) ||
                    meals.find((x) => norm(x.name) === m) ||
                    meals.find((x) => m && norm(x.name).includes(m) && (!r || norm(x.restaurant) === r)) ||
                    meals.find((x) => m && norm(x.name).includes(m));
                if (!match) return null; // drop hallucinated items
                return {
                    meal: match.name,
                    restaurant: match.restaurant,
                    restaurantUrl: match.restaurantUrl || null,
                    price: match.price || null,
                    distance: match.distance || null,
                    via: match.via || null,
                    why: rec.why || '',
                    macros: rec.macros || null,
                    timingFit: rec.timingFit || null,
                };
            })
            .filter(Boolean);

        res.json({
            success: true,
            dailySummary: parsed.dailySummary || '',
            recommendations,
            meta: {
                ...aiStatus(),
                candidates: meals.length,
                timing: ctx.timing,
                maxDistanceKm: effectiveMaxDistanceKm,
                radiusRelaxed,
            },
            // Echoes exactly what was sent to the AI, so the UI can show the user
            // their inputs really were used — not just trust that they were.
            personalization: {
                goal: userPayload.athlete.goal,
                foodPreferences: userPayload.athlete.food_preferences,
                dietaryRestrictions: restrictions.map((r) => ({ id: r.id, severity: r.severity, label: r.label || null })),
                healthMarkers: userPayload.health_markers,
            },
        });
    } catch (err) {
        console.error('[recommend] AI call failed:', err.message);
        const msg =
            err instanceof AIError
                ? err.userMessage
                : 'AI recommendation failed. Try again in a moment.';
        res.status(502).json({ success: false, error: msg });
    }
});

// Log a meal the user actually ate (feeds "remaining today" + future recs).
router.post('/log-meal', (req, res) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'name is required' });
    const info = db
        .prepare(
            `INSERT INTO meal_log (user_id, date, name, restaurant, calories, protein_g, carb_g, fat_g)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            req.userId,
            todayISO(),
            String(b.name),
            b.restaurant || null,
            b.calories != null ? Number(b.calories) : null,
            b.protein_g != null ? Number(b.protein_g) : null,
            b.carb_g != null ? Number(b.carb_g) : null,
            b.fat_g != null ? Number(b.fat_g) : null
        );
    res.json({ id: info.lastInsertRowid });
});

router.get('/meal-log', (req, res) => {
    const { from, to, date } = req.query;
    let sql = 'SELECT * FROM meal_log WHERE user_id = ?';
    const args = [req.userId];

    if (date) {
        sql += ' AND date = ?';
        args.push(date);
    } else if (from || to) {
        if (from) { sql += ' AND date >= ?'; args.push(from); }
        if (to) { sql += ' AND date <= ?'; args.push(to); }
    } else {
        sql += ' AND date = ?';
        args.push(todayISO());
    }
    sql += ' ORDER BY date DESC, created_at DESC';

    res.json({ meals: db.prepare(sql).all(...args) });
});

module.exports = router;

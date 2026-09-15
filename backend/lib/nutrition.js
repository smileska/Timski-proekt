// Authoritative nutrition math. The frontend keeps a copy of these formulas in
// src/lib/nutrition.js purely for live previews while the user types — the
// numbers the app trusts are always the ones this module returns.

const ACTIVITY_FACTORS = {
    sedentary: 1.2,      // little/no exercise
    light: 1.375,        // 1-3 workouts/week
    moderate: 1.55,      // 3-5 workouts/week
    active: 1.725,       // 6-7 workouts/week
    athlete: 1.9,        // 2x/day or physical job
};

// Goal → { calorieDelta as fraction of TDEE, protein g per kg bodyweight }
const GOAL_TUNING = {
    lose_fat:     { delta: -0.20, protein: 2.2 },
    build_muscle: { delta: +0.12, protein: 2.0 },
    gain_weight:  { delta: +0.20, protein: 1.6 },
    maintain:     { delta:  0.00, protein: 1.8 },
    endurance:    { delta: +0.10, protein: 1.6 },
};

function bmi(heightCm, weightKg) {
    if (!heightCm || !weightKg) return null;
    const m = heightCm / 100;
    return round(weightKg / (m * m), 1);
}

function bmiCategory(value) {
    if (value == null) return null;
    if (value < 18.5) return 'underweight';
    if (value < 25) return 'normal';
    if (value < 30) return 'overweight';
    return 'obese';
}

// Mifflin–St Jeor
function bmr({ sex, age, heightCm, weightKg }) {
    if (!age || !heightCm || !weightKg) return null;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return round(sex === 'female' ? base - 161 : base + 5, 0);
}

/**
 * Full daily target set.
 * @param profile { sex, age, height_cm, weight_kg, activity_level, goal }
 * @param workoutCaloriesToday extra kcal burned in logged/planned workouts today
 */
function dailyTargets(profile, workoutCaloriesToday = 0) {
    const p = {
        sex: profile.sex,
        age: profile.age,
        heightCm: profile.height_cm,
        weightKg: profile.weight_kg,
    };
    const bmrVal = bmr(p);
    const factor = ACTIVITY_FACTORS[profile.activity_level] || ACTIVITY_FACTORS.moderate;
    const tuning = GOAL_TUNING[profile.goal] || GOAL_TUNING.maintain;

    if (bmrVal == null) {
        return {
            bmi: bmi(profile.height_cm, profile.weight_kg),
            bmiCategory: bmiCategory(bmi(profile.height_cm, profile.weight_kg)),
            bmr: null, tdee: null, calorieTarget: null,
            protein_g: null, carb_g: null, fat_g: null,
            workoutCaloriesToday,
        };
    }

    const tdee = bmrVal * factor;
    const calorieTarget = round(tdee * (1 + tuning.delta) + workoutCaloriesToday, 0);

    const protein_g = round(tuning.protein * (profile.weight_kg || 0), 0);
    const fat_g = round((calorieTarget * 0.27) / 9, 0);
    const carbKcal = Math.max(0, calorieTarget - protein_g * 4 - fat_g * 9);
    const carb_g = round(carbKcal / 4, 0);

    const bmiVal = bmi(profile.height_cm, profile.weight_kg);
    return {
        bmi: bmiVal,
        bmiCategory: bmiCategory(bmiVal),
        bmr: bmrVal,
        tdee: round(tdee, 0),
        calorieTarget,
        protein_g,
        carb_g,
        fat_g,
        workoutCaloriesToday: round(workoutCaloriesToday, 0),
    };
}

// Which meal the app should optimise for, given the clock and the next workout.
function mealTiming(now, nextWorkoutStart, lastWorkoutEnd) {
    const hour = now.getHours();
    if (nextWorkoutStart) {
        const hoursUntil = (nextWorkoutStart - now) / 3.6e6;
        if (hoursUntil > 0 && hoursUntil <= 3) return 'pre_workout';
    }
    if (lastWorkoutEnd) {
        const hoursSince = (now - lastWorkoutEnd) / 3.6e6;
        if (hoursSince >= 0 && hoursSince <= 2) return 'post_workout';
    }
    if (hour < 10) return 'breakfast';
    if (hour < 14) return 'lunch';
    if (hour < 17) return 'afternoon_snack';
    if (hour < 21) return 'dinner';
    return 'late_meal';
}

function round(n, digits) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
}

module.exports = {
    ACTIVITY_FACTORS,
    GOAL_TUNING,
    bmi,
    bmiCategory,
    bmr,
    dailyTargets,
    mealTiming,
};

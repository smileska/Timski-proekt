// Client-side copy of backend/lib/nutrition.js — used only for live previews
// while the user edits their profile. The server value is always authoritative.

export const ACTIVITY_FACTORS = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9,
};

export const GOAL_TUNING = {
    lose_fat: { delta: -0.2, protein: 2.2 },
    build_muscle: { delta: 0.12, protein: 2.0 },
    maintain: { delta: 0, protein: 1.8 },
    endurance: { delta: 0.1, protein: 1.6 },
};

export function bmi(heightCm, weightKg) {
    if (!heightCm || !weightKg) return null;
    const m = heightCm / 100;
    return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(value) {
    if (value == null) return null;
    if (value < 18.5) return 'underweight';
    if (value < 25) return 'normal';
    if (value < 30) return 'overweight';
    return 'obese';
}

export function bmr({ sex, age, heightCm, weightKg }) {
    if (!age || !heightCm || !weightKg) return null;
    const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    return Math.round(sex === 'female' ? base - 161 : base + 5);
}

export function previewTargets(profile, workoutCaloriesToday = 0) {
    const p = {
        sex: profile.sex,
        age: Number(profile.age) || null,
        heightCm: Number(profile.height_cm) || null,
        weightKg: Number(profile.weight_kg) || null,
    };
    const value = bmi(p.heightCm, p.weightKg);
    const bmrVal = bmr(p);
    const factor = ACTIVITY_FACTORS[profile.activity_level] || ACTIVITY_FACTORS.moderate;
    const tuning = GOAL_TUNING[profile.goal] || GOAL_TUNING.maintain;

    if (bmrVal == null) {
        return { bmi: value, bmiCategory: bmiCategory(value), calorieTarget: null };
    }
    const tdee = bmrVal * factor;
    const calorieTarget = Math.round(tdee * (1 + tuning.delta) + workoutCaloriesToday);
    const protein_g = Math.round(tuning.protein * (p.weightKg || 0));
    const fat_g = Math.round((calorieTarget * 0.27) / 9);
    const carb_g = Math.round(Math.max(0, calorieTarget - protein_g * 4 - fat_g * 9) / 4);
    return {
        bmi: value,
        bmiCategory: bmiCategory(value),
        bmr: bmrVal,
        tdee: Math.round(tdee),
        calorieTarget,
        protein_g,
        carb_g,
        fat_g,
    };
}

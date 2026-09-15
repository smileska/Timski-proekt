// Shared reference data for the UI. Keyword matching mirrors backend/lib/allergens.js.

export const GOALS = [
    { id: 'lose_fat', icon: '🔥', title: 'Lose body fat', desc: 'Calorie deficit, high protein to keep muscle' },
    { id: 'build_muscle', icon: '💪', title: 'Build muscle', desc: 'Protein-forward surplus focused on lifting, not just the scale' },
    { id: 'gain_weight', icon: '📈', title: 'Gain weight', desc: 'Bigger calorie surplus to add weight overall' },
    { id: 'maintain', icon: '⚖️', title: 'Maintain', desc: 'Balanced intake around your energy needs' },
    { id: 'endurance', icon: '🏃', title: 'Endurance', desc: 'Higher carbs to support long training sessions' },
];

export const ACTIVITY_LEVELS = [
    { id: 'sedentary', title: 'Sedentary', desc: 'Desk job, little exercise' },
    { id: 'light', title: 'Light', desc: '1–3 workouts / week' },
    { id: 'moderate', title: 'Moderate', desc: '3–5 workouts / week' },
    { id: 'active', title: 'Active', desc: '6–7 workouts / week' },
    { id: 'athlete', title: 'Athlete', desc: 'Twice-a-day or physical job' },
];

export const SEXES = [
    { id: 'male', title: 'Male' },
    { id: 'female', title: 'Female' },
    { id: 'other', title: 'Other' },
];

export const ALLERGEN_OPTIONS = [
    { id: 'vegetarian', name: 'Vegetarian', icon: '🥗' },
    { id: 'vegan', name: 'Vegan', icon: '🌱' },
    { id: 'gluten', name: 'Gluten', icon: '🌾' },
    { id: 'dairy', name: 'Dairy', icon: '🥛' },
    { id: 'eggs', name: 'Eggs', icon: '🥚' },
    { id: 'nuts', name: 'Nuts', icon: '🥜' },
    { id: 'soy', name: 'Soy', icon: '🫘' },
    { id: 'fish', name: 'Fish', icon: '🐟' },
    { id: 'shellfish', name: 'Shellfish', icon: '🦐' },
    { id: 'sesame', name: 'Sesame', icon: '🌰' },
    { id: 'pork', name: 'Pork', icon: '🐷' },
    { id: 'beef', name: 'Beef', icon: '🐄' },
    { id: 'chicken', name: 'Chicken', icon: '🐔' },
];

export const ALLERGEN_KEYWORDS = {
    gluten: ['gluten', 'wheat', 'bread', 'pasta', 'flour', 'пшеница', 'леб', 'тестенини', 'пица', 'бурек', 'нудлси'],
    dairy: ['dairy', 'milk', 'cheese', 'cream', 'butter', 'млеко', 'сирење', 'павлака', 'путер', 'кашкавал', 'пармезан'],
    eggs: ['egg', 'јајце', 'јајца', 'омлет'],
    nuts: ['nut', 'almond', 'cashew', 'walnut', 'ореви', 'бадем', 'индиски ореви'],
    soy: ['soy', 'соја', 'тофу'],
    fish: ['fish', 'salmon', 'tuna', 'риба', 'лосос', 'туна', 'лаврак'],
    shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'ракчиња', 'ракови', 'јастог', 'лигњи'],
    sesame: ['sesame', 'сусам'],
    pork: ['pork', 'bacon', 'ham', 'свинско', 'шунка', 'сланина', 'пршут'],
    beef: ['beef', 'говедско', 'телешко'],
    chicken: ['chicken', 'пилешко', 'пиле'],
    vegetarian: ['pork', 'beef', 'chicken', 'fish', 'ham', 'bacon', 'свинско', 'говедско', 'пилешко', 'риба', 'шунка'],
    vegan: ['pork', 'beef', 'chicken', 'fish', 'egg', 'milk', 'cheese', 'cream', 'butter', 'honey',
        'свинско', 'говедско', 'пилешко', 'риба', 'јајце', 'млеко', 'сирење', 'путер', 'мед'],
};

const STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'i', 'no', 'not', 'any', 'all']);

// Normalize a restriction to { id, severity, label } — accepts legacy bare strings too.
function normalizeRestriction(r) {
    if (typeof r === 'string') return { id: r, severity: 'severe', label: null };
    return { id: r.id, severity: r.severity || 'severe', label: r.label || null };
}

function keywordsFor(restriction) {
    if (ALLERGEN_KEYWORDS[restriction.id]) return ALLERGEN_KEYWORDS[restriction.id];
    if (restriction.label) {
        const words = restriction.label
            .toLowerCase()
            .split(/[\s,]+/)
            .filter((w) => w.length > 2 && !STOPWORDS.has(w));
        return words.length ? words : [restriction.label.toLowerCase()];
    }
    return [restriction.id];
}

export function itemMatchesRestriction(item, restriction) {
    const r = normalizeRestriction(restriction);
    const keywords = keywordsFor(r);
    const text = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    return keywords.some((kw) => text.includes(String(kw).toLowerCase()));
}

// Returns 'blocked' | 'deprioritized' | 'flagged' | null.
export function classifyItem(item, restrictions) {
    let worst = null;
    for (const raw of restrictions || []) {
        const r = normalizeRestriction(raw);
        if (!itemMatchesRestriction(item, r)) continue;
        if (r.severity === 'severe') return 'blocked';
        if (r.severity === 'moderate' && worst !== 'blocked') worst = 'deprioritized';
        if (r.severity === 'mild' && !worst) worst = 'flagged';
    }
    return worst;
}

export function itemIsBlocked(item, restrictions) {
    return classifyItem(item, restrictions) === 'blocked';
}

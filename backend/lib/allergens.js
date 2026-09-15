// Keyword matching for dietary restrictions against free-text menu items
// (English + Macedonian). Shared shape with src/data/constants.js on the frontend.
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

function itemMatchesRestriction(item, restriction) {
    const r = normalizeRestriction(restriction);
    const keywords = keywordsFor(r);
    const text = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    return keywords.some((kw) => text.includes(String(kw).toLowerCase()));
}

// Returns 'blocked' | 'deprioritized' | 'flagged' | null based on the worst
// matching restriction's severity ('severe' hard-blocks, 'moderate' deprioritizes,
// 'mild' just flags).
function classifyItem(item, restrictions) {
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

function itemIsBlocked(item, restrictions) {
    return classifyItem(item, restrictions) === 'blocked';
}

module.exports = { ALLERGEN_KEYWORDS, itemMatchesRestriction, classifyItem, itemIsBlocked };

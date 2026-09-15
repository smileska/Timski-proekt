import { useState } from 'react';
import { ALLERGEN_OPTIONS } from '../data/constants';

const SEVERITY_CYCLE = [null, 'severe', 'moderate', 'mild'];
const SEVERITY_META = {
    severe: { label: 'Avoid completely', color: 'var(--accent-red)', bg: '#fde8e8' },
    moderate: { label: 'Prefer to avoid', color: 'var(--accent-amber)', bg: '#fef3c7' },
    mild: { label: 'Slight preference', color: 'var(--ink-500)', bg: 'var(--surface-2)' },
};

function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 30);
}

// `selected` is an array of { id, severity, label? }. Tapping a fixed tile cycles
// its severity (off → severe → moderate → mild → off). A free-text field below
// lets people add allergens/restrictions beyond the fixed list.
export default function DietaryPicker({ selected, onChange }) {
    const [customText, setCustomText] = useState('');

    const find = (id) => selected.find((s) => s.id === id);

    function cycle(id) {
        const current = find(id);
        const idx = SEVERITY_CYCLE.indexOf(current?.severity || null);
        const next = SEVERITY_CYCLE[(idx + 1) % SEVERITY_CYCLE.length];
        const rest = selected.filter((s) => s.id !== id);
        onChange(next ? [...rest, { id, severity: next }] : rest);
    }

    function addCustom() {
        const text = customText.trim();
        if (!text) return;
        const id = `custom:${slugify(text)}`;
        if (!id || find(id)) {
            setCustomText('');
            return;
        }
        onChange([...selected, { id, severity: 'severe', label: text }]);
        setCustomText('');
    }

    function removeCustom(id) {
        onChange(selected.filter((s) => s.id !== id));
    }

    const customEntries = selected.filter((s) => s.id.startsWith('custom:'));

    return (
        <div className="stack">
            <div className="choice-grid">
                {ALLERGEN_OPTIONS.map((a) => {
                    const current = find(a.id);
                    const meta = current ? SEVERITY_META[current.severity] : null;
                    return (
                        <button
                            key={a.id}
                            type="button"
                            className={`choice${current ? ' selected' : ''}`}
                            onClick={() => cycle(a.id)}
                            style={current ? { borderColor: meta.color, background: meta.bg } : undefined}
                        >
                            <div className="c-icon">{a.icon}</div>
                            <div className="c-title">{a.name}</div>
                            {current ? (
                                <div className="c-desc" style={{ color: meta.color }}>{meta.label}</div>
                            ) : (
                                <div className="c-desc">tap to set</div>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="field">
                <label>Other allergen or restriction</label>
                <div className="row">
                    <input
                        className="grow"
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder="e.g. shellfish stock, MSG…"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                addCustom();
                            }
                        }}
                    />
                    <button type="button" className="btn sm subtle" onClick={addCustom}>Add</button>
                </div>
            </div>

            {customEntries.length > 0 && (
                <div className="row wrap">
                    {customEntries.map((c) => (
                        <span key={c.id} className="chip red">
                            {c.label || c.id}
                            <button
                                type="button"
                                onClick={() => removeCustom(c.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 900, padding: 0, marginLeft: 2 }}
                                aria-label={`Remove ${c.label || c.id}`}
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

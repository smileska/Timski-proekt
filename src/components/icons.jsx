const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function HomeIcon() {
    return (
        <svg viewBox="0 0 24 24" {...base}>
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
        </svg>
    );
}
export function MealIcon() {
    return (
        <svg viewBox="0 0 24 24" {...base}>
            <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18" />
            <path d="M17 3c-1.5 1-2.5 3-2.5 6s1 4 2.5 4v8" />
        </svg>
    );
}
export function WorkoutIcon() {
    return (
        <svg viewBox="0 0 24 24" {...base}>
            <path d="M6.5 6.5 17.5 17.5" />
            <rect x="2" y="8" width="4" height="8" rx="1" />
            <rect x="18" y="8" width="4" height="8" rx="1" />
            <path d="M6 12h12" />
        </svg>
    );
}
export function ProfileIcon() {
    return (
        <svg viewBox="0 0 24 24" {...base}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
    );
}
export function PinIcon() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" {...base}>
            <path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
            <circle cx="12" cy="9" r="2.5" />
        </svg>
    );
}

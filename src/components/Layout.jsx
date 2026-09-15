import { NavLink, Outlet } from 'react-router-dom';
import { useLocation as useGeo } from '../context/LocationContext';
import { HomeIcon, MealIcon, WorkoutIcon, ProfileIcon, PinIcon } from './icons';

function LocationPill() {
    const { label, accuracy, status, refine, refining } = useGeo();

    let text = 'Locating…';
    if (status === 'denied') text = 'Location off';
    else if (status === 'unavailable') text = 'No location';
    else if (status === 'ready') text = label || `${accuracy ?? '?'} m accuracy`;

    return (
        <button className="loc" onClick={refine} title="Tap to improve accuracy">
            <PinIcon />
            <span>{text}</span>
            {status === 'ready' && accuracy != null && (
                <strong style={{ opacity: 0.85 }}>· ±{accuracy}m{refining ? ' …' : ''}</strong>
            )}
        </button>
    );
}

const tabs = [
    { to: '/dashboard', label: 'Home', Icon: HomeIcon },
    { to: '/restaurants', label: 'Meals', Icon: MealIcon },
    { to: '/workouts', label: 'Workouts', Icon: WorkoutIcon },
    { to: '/profile', label: 'Profile', Icon: ProfileIcon },
];

export default function Layout() {
    return (
        <div className="app-shell">
            <header className="appbar">
                <div className="brand">🥑 FitFuel</div>
                <LocationPill />
            </header>

            <Outlet />

            <nav className="bottomnav">
                {tabs.map(({ to, label, Icon }) => (
                    <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
                        <Icon />
                        {label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}

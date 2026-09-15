import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';

const LocationContext = createContext(null);

const GEO_OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

export function LocationProvider({ children }) {
    const [coords, setCoords] = useState(null); // { lat, lon }
    const [accuracy, setAccuracy] = useState(null); // metres
    const [label, setLabel] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | locating | ready | denied | unavailable
    const [refining, setRefining] = useState(false);
    const watchRef = useRef(null);

    const reverseGeocode = useCallback(async (lat, lon) => {
        try {
            const res = await api.get(`/api/geo/reverse?lat=${lat}&lon=${lon}`);
            if (res && res.label) setLabel(res.label);
        } catch {
            /* keep coords, drop label */
        }
    }, []);

    const locate = useCallback(() => {
        if (!('geolocation' in navigator)) {
            setStatus('unavailable');
            return;
        }
        setStatus('locating');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                setCoords({ lat, lon });
                setAccuracy(Math.round(pos.coords.accuracy));
                setStatus('ready');
                reverseGeocode(lat, lon);
            },
            (err) => {
                setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
            },
            GEO_OPTS
        );
    }, [reverseGeocode]);

    // Watch briefly and keep the most accurate fix.
    const refine = useCallback(() => {
        if (!('geolocation' in navigator) || refining) return;
        setRefining(true);
        let best = accuracy || Infinity;
        watchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                if (pos.coords.accuracy < best) {
                    best = pos.coords.accuracy;
                    setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
                    setAccuracy(Math.round(pos.coords.accuracy));
                    reverseGeocode(pos.coords.latitude, pos.coords.longitude);
                }
            },
            () => {},
            GEO_OPTS
        );
        setTimeout(() => {
            if (watchRef.current != null) {
                navigator.geolocation.clearWatch(watchRef.current);
                watchRef.current = null;
            }
            setRefining(false);
        }, 15000);
    }, [accuracy, refining, reverseGeocode]);

    useEffect(() => {
        locate();
        return () => {
            if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
        };
    }, [locate]);

    const value = { coords, accuracy, label, status, refining, locate, refine };
    return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation() {
    const ctx = useContext(LocationContext);
    if (!ctx) throw new Error('useLocation must be used within LocationProvider');
    return ctx;
}

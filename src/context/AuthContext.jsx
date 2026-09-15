import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [hasProfile, setHasProfile] = useState(false);
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        setHasProfile(false);
        setConnections([]);
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(logout);
    }, [logout]);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            setLoading(false);
            return;
        }
        try {
            const me = await api.get('/api/auth/me');
            setUser(me.user);
            setHasProfile(me.hasProfile);
            setConnections(me.connections || []);
        } catch {
            logout();
        } finally {
            setLoading(false);
        }
    }, [logout]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    function applyAuth(res) {
        setToken(res.token);
        setUser(res.user);
        setHasProfile(Boolean(res.hasProfile));
        refresh();
        return res;
    }

    const value = {
        user,
        hasProfile,
        connections,
        loading,
        setHasProfile,
        refresh,
        logout,
        login: async (email, password) => applyAuth(await api.post('/api/auth/login', { email, password })),
        register: async (payload) => applyAuth(await api.post('/api/auth/register', payload)),
        googleExchange: async (code) => applyAuth(await api.post('/api/auth/google', { code })),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

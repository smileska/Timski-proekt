import { useState } from 'react';

// Kicks off Google's OAuth code flow. The backend builds the consent URL
// (so the client id / secret stay server-side); Google redirects back to
// /oauth/google which finishes the exchange.
export default function GoogleButton({ label = 'Continue with Google', onError, api }) {
    const [busy, setBusy] = useState(false);

    async function start() {
        setBusy(true);
        try {
            const { url } = await api.get('/api/auth/google/url');
            window.location.href = url;
        } catch (err) {
            setBusy(false);
            onError?.(
                err.status === 503
                    ? 'Google sign-in is not set up on the server yet. Use email + password.'
                    : err.message
            );
        }
    }

    return (
        <button type="button" className="btn btn-google block" onClick={start} disabled={busy}>
            <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5Z" />
                <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16Z" />
                <path fill="#FBBC05" d="M10.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.7l7.9-6.2Z" />
                <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.3-4.5 2.1-8.2 2.1-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48Z" />
            </svg>
            {busy ? 'Redirecting…' : label}
        </button>
    );
}

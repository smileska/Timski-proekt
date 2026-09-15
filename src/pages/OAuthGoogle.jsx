import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function OAuthGoogle() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { googleExchange } = useAuth();
    const [error, setError] = useState(null);
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;

        const code = params.get('code');
        if (params.get('error') || !code) {
            setError('Google sign-in was cancelled.');
            return;
        }
        googleExchange(code)
            .then((res) => navigate(res?.hasProfile ? '/dashboard' : '/onboarding', { replace: true }))
            .catch((err) => setError(err.message || 'Google sign-in failed.'));
    }, [params, googleExchange, navigate]);

    return (
        <div className="auth-wrap">
            <div className="auth-card card pad-lg center">
                {error ? (
                    <>
                        <div className="banner red" style={{ marginBottom: 14 }}>{error}</div>
                        <button className="btn ghost" onClick={() => navigate('/login', { replace: true })}>
                            Back to sign in
                        </button>
                    </>
                ) : (
                    <>
                        <div className="spin" />
                        <p className="muted" style={{ marginTop: 14 }}>Finishing Google sign-in…</p>
                    </>
                )}
            </div>
        </div>
    );
}

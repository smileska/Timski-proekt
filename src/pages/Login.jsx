import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import GoogleButton from '../components/GoogleButton';

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-wrap">
            <div className="auth-card card pad-lg">
                <div className="auth-logo">🥑 FitFuel</div>
                <div className="auth-tag">Fuel your training with the right meal, from nearby.</div>

                <form className="stack" onSubmit={submit}>
                    <div className="field">
                        <label>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                    </div>
                    <div className="field">
                        <label>Password</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                    </div>
                    {error && <div className="field-error">{error}</div>}
                    <button className="btn gradient block lg" disabled={busy}>
                        {busy ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <div className="divider">or</div>
                <GoogleButton label="Continue with Google" onError={setError} api={api} />

                <p className="center muted" style={{ marginTop: 18, fontSize: 13 }}>
                    New here? <Link to="/register">Create an account</Link>
                </p>
            </div>
        </div>
    );
}

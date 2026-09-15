import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import GoogleButton from '../components/GoogleButton';

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await register(form);
            navigate('/onboarding');
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
                <div className="auth-tag">Create your account — takes a minute.</div>

                <form className="stack" onSubmit={submit}>
                    <div className="field">
                        <label>Name</label>
                        <input value={form.name} onChange={set('name')} autoComplete="name" />
                    </div>
                    <div className="field">
                        <label>Email</label>
                        <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
                    </div>
                    <div className="field">
                        <label>Password</label>
                        <input type="password" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
                        <span className="hint">At least 8 characters.</span>
                    </div>
                    {error && <div className="field-error">{error}</div>}
                    <button className="btn gradient block lg" disabled={busy}>
                        {busy ? 'Creating…' : 'Create account'}
                    </button>
                </form>

                <div className="divider">or</div>
                <GoogleButton label="Sign up with Google" onError={setError} api={api} />

                <p className="center muted" style={{ marginTop: 18, fontSize: 13 }}>
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
}

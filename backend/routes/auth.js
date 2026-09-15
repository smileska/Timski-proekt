const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const { signToken, requireAuth } = require('../lib/auth');

const router = express.Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/google';
const GOOGLE_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/calendar.events.readonly',
];

function googleConfigured() {
    return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function publicUser(row) {
    return { id: row.id, email: row.email, name: row.name || null };
}

function hasProfile(userId) {
    const p = db
        .prepare('SELECT weight_kg, height_cm, goal FROM profiles WHERE user_id = ?')
        .get(userId);
    return Boolean(p && p.weight_kg && p.height_cm && p.goal);
}

// ── Email + password ─────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim() || null;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
        return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = db
        .prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
        .run(email, hash, name);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

    res.json({ token: signToken(user), user: publicUser(user), hasProfile: false });
});

router.post('/login', (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
        token: signToken(user),
        user: publicUser(user),
        hasProfile: hasProfile(user.id),
    });
});

// ── Sign in with Google (authorization-code flow) ────────────────────────────
// The same consent also grants Calendar read access, stored in `connections`.
router.get('/google/url', (req, res) => {
    if (!googleConfigured()) {
        return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }
    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: GOOGLE_SCOPES,
    });
    res.json({ url });
});

router.post('/google', async (req, res) => {
    if (!googleConfigured()) {
        return res.status(503).json({ error: 'Google sign-in is not configured on this server' });
    }
    const code = String(req.body.code || '');
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    try {
        const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
        const { tokens } = await client.getToken(code);
        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const googleSub = payload.sub;
        const email = String(payload.email || '').toLowerCase();
        const name = payload.name || null;

        let user =
            db.prepare('SELECT * FROM users WHERE google_sub = ?').get(googleSub) ||
            db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            const info = db
                .prepare('INSERT INTO users (email, google_sub, name) VALUES (?, ?, ?)')
                .run(email, googleSub, name);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        } else if (!user.google_sub) {
            db.prepare('UPDATE users SET google_sub = ?, name = COALESCE(name, ?) WHERE id = ?')
                .run(googleSub, name, user.id);
        }

        // Persist Calendar tokens.
        if (tokens.access_token) {
            db.prepare(
                `INSERT INTO connections (user_id, provider, access_token, refresh_token, expires_at, scope, updated_at)
                 VALUES (?, 'google', ?, ?, ?, ?, datetime('now'))
                 ON CONFLICT(user_id, provider) DO UPDATE SET
                   access_token = excluded.access_token,
                   refresh_token = COALESCE(excluded.refresh_token, connections.refresh_token),
                   expires_at = excluded.expires_at,
                   scope = excluded.scope,
                   updated_at = datetime('now')`
            ).run(
                user.id,
                tokens.access_token,
                tokens.refresh_token || null,
                tokens.expiry_date || null,
                (tokens.scope || '')
            );
        }

        res.json({
            token: signToken(user),
            user: publicUser(user),
            hasProfile: hasProfile(user.id),
        });
    } catch (err) {
        console.error('[auth] Google exchange failed:', err.message);
        res.status(401).json({ error: 'Google sign-in failed' });
    }
});

// ── Current user ─────────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const connections = db
        .prepare('SELECT provider FROM connections WHERE user_id = ?')
        .all(req.userId)
        .map((r) => r.provider);
    res.json({ user: publicUser(user), hasProfile: hasProfile(user.id), connections });
});

module.exports = router;
module.exports.googleConfigured = googleConfigured;

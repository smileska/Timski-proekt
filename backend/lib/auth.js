const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const TTL = '30d';

function signToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: TTL });
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET);
    } catch {
        return null;
    }
}

// Express middleware — requires a valid Bearer token, sets req.userId.
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const payload = token && verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
}

module.exports = { signToken, verifyToken, requireAuth };

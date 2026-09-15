require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db'); // boots SQLite + creates tables

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/bloodwork', require('./routes/bloodwork'));
app.use('/api/geo', require('./routes/geo'));
app.use('/api/korpa', require('./routes/korpa'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/recommend-meals', require('./routes/recommend'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[server] FitFuel backend on :${PORT}`));

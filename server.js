// ─────────────────────────────────────────────────────────────────
// server.js  —  Express entry point
// ─────────────────────────────────────────────────────────────────
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/products', require('./routes/products'));
app.use('/api/sales',    require('./routes/sales'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Init DB first, then start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🟢 POS Backend running at http://localhost:${PORT}`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/products`);
    console.log(`   POST /api/sales\n`);
  });
}).catch(err => {
  console.error('❌ Failed to init DB:', err);
  process.exit(1);
});

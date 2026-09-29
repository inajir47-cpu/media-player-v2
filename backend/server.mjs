// Media Player V2 backend — streaming services API + static frontend host.

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import streamRouter from './routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3101', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/stream', streamRouter);

// Frontend static: the media-player-v2 project root (index.html, js/, css/).
const frontendDir = path.join(__dirname, '..');
if (fs.existsSync(path.join(frontendDir, 'index.html'))) {
  app.use(express.static(frontendDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('API error:', err?.message || err);
  res.status(err?.status || 500).json({ error: err?.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Media Player V2 backend listening on :${PORT}`);
});

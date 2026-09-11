/**
 * "Gdzie Niemiec" - serwer aplikacji śledzącej tramwaje NGT6 R1.1 z Bonn
 * kursujące po Poznaniu.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { Tracker } from './tracker.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(tracker) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/vehicles', async (_req, res) => {
    try {
      const state = await tracker.getState();
      res.set('Cache-Control', 'no-store');
      res.json(state);
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mode: config.demo ? 'demo' : 'live',
      lastError: tracker.lastError,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // Leaflet serwujemy lokalnie z node_modules - aplikacja działa bez CDN.
  app.use('/vendor/leaflet', express.static(path.join(rootDir, 'node_modules/leaflet/dist')));
  app.use(express.static(path.join(rootDir, 'public')));

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const tracker = new Tracker(config);
  const app = createApp(tracker);

  app.listen(config.port, config.host, () => {
    const mode = config.demo ? 'DEMO (dane symulowane)' : 'NA ŻYWO (feed GTFS-RT ZTM Poznań)';
    console.log(`Gdzie Niemiec - tryb: ${mode}`);
    console.log(`Mapa: http://localhost:${config.port}`);
    if (!config.demo) console.log(`Feed:  ${config.feedUrl}`);
  });
}

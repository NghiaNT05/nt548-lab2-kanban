// frontend: phuc vu giao dien Kanban va proxy request /api sang cac service phia sau.
const express = require('express');
const path = require('node:path');

const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL || 'http://localhost:5001';
const STATS_SERVICE_URL = process.env.STATS_SERVICE_URL || 'http://localhost:5002';
const PORT = process.env.PORT || 3000;

// Ghep URL service voi DUONG DAN da chuan hoa cua request.
// Chi lay pathname + query tu URL goc de tranh SSRF (khong cho ghi de host).
function buildTargetUrl(baseUrl, originalUrl) {
  const base = new URL(baseUrl);
  const requested = new URL(originalUrl, base);
  const target = new URL(requested.pathname + requested.search, base);
  return target.toString();
}

// Chuyen tiep request sang service dich va tra nguyen ven ket qua.
async function proxyTo(baseUrl, req, res) {
  try {
    const init = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(buildTargetUrl(baseUrl, req.originalUrl), init);
    const body = await upstream.text();
    res.status(upstream.status).type('application/json').send(body);
  } catch (err) {
    res.status(502).json({ error: 'upstream unavailable', detail: err.message });
  }
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'frontend' });
  });

  app.use('/api/tasks', (req, res) => proxyTo(TASK_SERVICE_URL, req, res));
  app.use('/api/stats', (req, res) => proxyTo(STATS_SERVICE_URL, req, res));

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`frontend listening on port ${PORT}`);
  });
}

module.exports = { createApp, buildTargetUrl };

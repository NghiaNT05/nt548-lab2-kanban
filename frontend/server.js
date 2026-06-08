// frontend: phuc vu giao dien Kanban va proxy request /api sang cac service phia sau.
const express = require('express');
const path = require('node:path');

const TASK_SERVICE_URL = process.env.TASK_SERVICE_URL || 'http://localhost:5001';
const STATS_SERVICE_URL = process.env.STATS_SERVICE_URL || 'http://localhost:5002';
const PORT = process.env.PORT || 3000;

// Chi cho phep task id dang hex 32 ky tu (uuid4 hex) de tranh chen duong dan.
const TASK_ID_PATTERN = /^[a-f0-9]{32}$/;

// Goi service phia sau voi duong dan CO DINH do server tu dung (khong tu URL nguoi dung).
async function callService(baseUrl, fixedPath, req, res) {
  try {
    const init = {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(`${baseUrl}${fixedPath}`, init);
    const text = await upstream.text();
    // Parse roi tra ve bang res.json (du lieu co cau truc) thay vi phan chieu chuoi tho.
    const payload = text ? JSON.parse(text) : {};
    res.status(upstream.status).set('X-Content-Type-Options', 'nosniff').json(payload);
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

  // Cac route khai bao tuong minh, duong dan toi service la hang so co dinh.
  app.get('/api/tasks', (req, res) => callService(TASK_SERVICE_URL, '/api/tasks', req, res));
  app.post('/api/tasks', (req, res) => callService(TASK_SERVICE_URL, '/api/tasks', req, res));

  app.all('/api/tasks/:id', (req, res) => {
    if (!TASK_ID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'invalid task id' });
    }
    return callService(TASK_SERVICE_URL, `/api/tasks/${req.params.id}`, req, res);
  });

  app.get('/api/stats', (req, res) => callService(STATS_SERVICE_URL, '/api/stats', req, res));

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => {
    console.log(`frontend listening on port ${PORT}`);
  });
}

module.exports = { createApp, TASK_ID_PATTERN };

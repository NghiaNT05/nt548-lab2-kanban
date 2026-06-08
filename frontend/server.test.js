// Unit test cho frontend, dung test runner co san cua Node (node --test).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { createApp, TASK_ID_PATTERN } = require('./server');

// ── Fake upstream: gia lap task-service / stats-service de test proxy ──────────
let upstream;
let upstreamUrl;
const lastRequest = {};

before(async () => {
  upstream = http.createServer((req, res) => {
    lastRequest.method = req.method;
    lastRequest.url = req.url;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/stats') {
      res.end(JSON.stringify({ total: 0, columns: { todo: 0, doing: 0, done: 0 } }));
    } else {
      res.end(JSON.stringify({ ok: true, path: req.url }));
    }
  });
  await new Promise((resolve) => upstream.listen(0, resolve));
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
});

after(() => upstream.close());

function appWithUpstream() {
  return createApp({ taskServiceUrl: upstreamUrl, statsServiceUrl: upstreamUrl });
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test('TASK_ID_PATTERN chap nhan hex 32 ky tu, tu choi gia tri khac', () => {
  assert.ok(TASK_ID_PATTERN.test('3e23ad7675af4fccb6fb1fb88d0acf7e'));
  assert.ok(!TASK_ID_PATTERN.test('../etc/passwd'));
  assert.ok(!TASK_ID_PATTERN.test('123'));
});

test('GET /health tra ve status ok', async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.service, 'frontend');
  });
});

test('GET /api/tasks proxy toi task-service', async () => {
  await withServer(appWithUpstream(), async (base) => {
    const res = await fetch(`${base}/api/tasks`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
    assert.strictEqual(lastRequest.url, '/api/tasks');
  });
});

test('POST /api/tasks chuyen tiep body', async () => {
  await withServer(appWithUpstream(), async (base) => {
    const res = await fetch(`${base}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', column: 'todo' }),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.method, 'POST');
  });
});

test('PUT /api/tasks/:id voi id hop le thi proxy', async () => {
  await withServer(appWithUpstream(), async (base) => {
    const id = '3e23ad7675af4fccb6fb1fb88d0acf7e';
    const res = await fetch(`${base}/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(lastRequest.url, `/api/tasks/${id}`);
  });
});

test('PUT /api/tasks/:id tu choi id khong hop le', async () => {
  await withServer(appWithUpstream(), async (base) => {
    const res = await fetch(`${base}/api/tasks/not-valid`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    });
    assert.strictEqual(res.status, 400);
  });
});

test('GET /api/stats proxy toi stats-service', async () => {
  await withServer(appWithUpstream(), async (base) => {
    const res = await fetch(`${base}/api/stats`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.total, 0);
  });
});

test('proxy tra ve 502 khi service phia sau khong chay', async () => {
  const app = createApp({ taskServiceUrl: 'http://127.0.0.1:1', statsServiceUrl: 'http://127.0.0.1:1' });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/tasks`);
    assert.strictEqual(res.status, 502);
  });
});

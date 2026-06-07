// Unit test cho frontend, dung test runner co san cua Node (node --test).
const { test } = require('node:test');
const assert = require('node:assert');

const { createApp, buildTargetUrl } = require('./server');

test('buildTargetUrl ghep base URL voi duong dan goc', () => {
  assert.strictEqual(
    buildTargetUrl('http://task-service:5000', '/api/tasks'),
    'http://task-service:5000/api/tasks'
  );
  assert.strictEqual(
    buildTargetUrl('http://stats-service:5000', '/api/stats'),
    'http://stats-service:5000/api/stats'
  );
});

test('GET /health tra ve status ok', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.service, 'frontend');
  } finally {
    server.close();
  }
});

test('proxy tra ve 502 khi service phia sau khong chay', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tasks`);
    assert.strictEqual(res.status, 502);
  } finally {
    server.close();
  }
});

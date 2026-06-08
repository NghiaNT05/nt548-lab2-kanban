// Unit test cho frontend, dung test runner co san cua Node (node --test).
const { test } = require('node:test');
const assert = require('node:assert');

const { createApp, TASK_ID_PATTERN } = require('./server');

test('TASK_ID_PATTERN chap nhan hex 32 ky tu, tu choi gia tri khac', () => {
  assert.ok(TASK_ID_PATTERN.test('3e23ad7675af4fccb6fb1fb88d0acf7e'));
  assert.ok(!TASK_ID_PATTERN.test('../etc/passwd'));
  assert.ok(!TASK_ID_PATTERN.test('123'));
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

test('PUT /api/tasks/:id tu choi task id khong hop le', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tasks/not-a-valid-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column: 'done' }),
    });
    assert.strictEqual(res.status, 400);
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

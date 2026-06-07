"""Unit test cho task-service, dung fakeredis thay cho Redis that."""

import fakeredis
import pytest

from app import create_app


@pytest.fixture()
def client():
    app = create_app(redis_client=fakeredis.FakeRedis(decode_responses=True))
    return app.test_client()


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json()["status"] == "ok"


def test_create_and_list_task(client):
    res = client.post("/api/tasks", json={"title": "Viet bao cao", "column": "todo"})
    assert res.status_code == 201
    task = res.get_json()
    assert task["title"] == "Viet bao cao"
    assert task["column"] == "todo"

    res = client.get("/api/tasks")
    tasks = res.get_json()
    assert len(tasks) == 1
    assert tasks[0]["id"] == task["id"]


def test_create_task_requires_title(client):
    res = client.post("/api/tasks", json={"title": "   "})
    assert res.status_code == 400


def test_create_task_rejects_invalid_column(client):
    res = client.post("/api/tasks", json={"title": "x", "column": "blocked"})
    assert res.status_code == 400


def test_move_task_between_columns(client):
    task = client.post("/api/tasks", json={"title": "Lam lab"}).get_json()

    res = client.put(f"/api/tasks/{task['id']}", json={"column": "doing"})
    assert res.status_code == 200
    assert res.get_json()["column"] == "doing"

    res = client.put(f"/api/tasks/{task['id']}", json={"column": "invalid"})
    assert res.status_code == 400


def test_update_missing_task_returns_404(client):
    res = client.put("/api/tasks/khong-ton-tai", json={"column": "done"})
    assert res.status_code == 404


def test_delete_task(client):
    task = client.post("/api/tasks", json={"title": "Xoa toi di"}).get_json()

    res = client.delete(f"/api/tasks/{task['id']}")
    assert res.status_code == 200
    assert client.get("/api/tasks").get_json() == []

    res = client.delete(f"/api/tasks/{task['id']}")
    assert res.status_code == 404

"""Unit test cho stats-service, dung fakeredis thay cho Redis that."""

import json

import fakeredis
import pytest

from app import count_by_column, create_app


@pytest.fixture()
def redis_client():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture()
def client(redis_client):
    app = create_app(redis_client=redis_client)
    return app.test_client()


def seed_task(redis_client, task_id, column):
    task = {"id": task_id, "title": task_id, "column": column, "created_at": 0}
    redis_client.hset("tasks", task_id, json.dumps(task))


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.get_json()["service"] == "stats-service"


def test_stats_empty_board(client):
    res = client.get("/api/stats")
    body = res.get_json()
    assert body["total"] == 0
    assert body["columns"] == {"todo": 0, "doing": 0, "done": 0}


def test_stats_counts_tasks_per_column(client, redis_client):
    seed_task(redis_client, "a", "todo")
    seed_task(redis_client, "b", "todo")
    seed_task(redis_client, "c", "doing")
    seed_task(redis_client, "d", "done")

    body = client.get("/api/stats").get_json()
    assert body["total"] == 4
    assert body["columns"] == {"todo": 2, "doing": 1, "done": 1}


def test_count_by_column_ignores_unknown_columns():
    tasks = [{"column": "todo"}, {"column": "archived"}, {"column": None}]
    assert count_by_column(tasks) == {"todo": 1, "doing": 0, "done": 0}

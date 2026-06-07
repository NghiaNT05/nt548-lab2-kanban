"""stats-service: API thong ke so luong task theo tung cot Kanban."""

import json
import os

import redis
from flask import Flask, jsonify

COLUMNS = ("todo", "doing", "done")
TASKS_KEY = "tasks"


def get_redis():
    """Tao ket noi Redis tu bien moi truong."""
    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "localhost"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        decode_responses=True,
    )


def count_by_column(tasks):
    """Dem so task trong moi cot; cot khong co task van tra ve 0."""
    counts = {column: 0 for column in COLUMNS}
    for task in tasks:
        column = task.get("column")
        if column in counts:
            counts[column] += 1
    return counts


def create_app(redis_client=None):
    """App factory: cho phep truyen fakeredis khi test."""
    app = Flask(__name__)
    app.config["redis"] = redis_client if redis_client is not None else get_redis()

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="stats-service")

    @app.get("/api/stats")
    def stats():
        client = app.config["redis"]
        tasks = [json.loads(raw) for raw in client.hvals(TASKS_KEY)]
        counts = count_by_column(tasks)
        return jsonify(total=len(tasks), columns=counts)

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000)

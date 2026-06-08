"""task-service: REST API quan ly task cua bang Kanban, luu tru trong Redis."""

import json
import os
import time
import uuid

import redis
from flask import Flask, jsonify, request

VALID_COLUMNS = ("todo", "doing", "done")
TASKS_KEY = "tasks"


def get_redis():
    """Tao ket noi Redis tu bien moi truong."""
    return redis.Redis(
        host=os.environ.get("REDIS_HOST", "localhost"),
        port=int(os.environ.get("REDIS_PORT", "6379")),
        decode_responses=True,
    )


def apply_updates(task, data):
    """Ap cac thay doi hop le len task. Tra ve (task, error_message)."""
    if "column" in data:
        if data["column"] not in VALID_COLUMNS:
            return None, f"column must be one of {VALID_COLUMNS}"
        task["column"] = data["column"]
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title:
            return None, "title is required"
        task["title"] = title
    return task, None


def create_app(redis_client=None):
    """App factory: cho phep truyen fakeredis khi test."""
    app = Flask(__name__)
    app.config["redis"] = redis_client if redis_client is not None else get_redis()

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="task-service")

    @app.get("/api/tasks")
    def list_tasks():
        client = app.config["redis"]
        tasks = [json.loads(raw) for raw in client.hvals(TASKS_KEY)]
        tasks.sort(key=lambda task: task["created_at"])
        return jsonify(tasks)

    @app.post("/api/tasks")
    def create_task():
        data = request.get_json(silent=True) or {}
        title = (data.get("title") or "").strip()
        column = data.get("column", "todo")
        if not title:
            return jsonify(error="title is required"), 400
        if column not in VALID_COLUMNS:
            return jsonify(error=f"column must be one of {VALID_COLUMNS}"), 400

        task = {
            "id": uuid.uuid4().hex,
            "title": title,
            "column": column,
            "created_at": time.time(),
        }
        app.config["redis"].hset(TASKS_KEY, task["id"], json.dumps(task))
        return jsonify(task), 201

    @app.put("/api/tasks/<task_id>")
    def update_task(task_id):
        client = app.config["redis"]
        raw = client.hget(TASKS_KEY, task_id)
        if raw is None:
            return jsonify(error="task not found"), 404

        data = request.get_json(silent=True) or {}
        task, error = apply_updates(json.loads(raw), data)
        if error:
            return jsonify(error=error), 400

        client.hset(TASKS_KEY, task_id, json.dumps(task))
        return jsonify(task)

    @app.delete("/api/tasks/<task_id>")
    def delete_task(task_id):
        deleted = app.config["redis"].hdel(TASKS_KEY, task_id)
        if not deleted:
            return jsonify(error="task not found"), 404
        return jsonify(deleted=task_id)

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=5000)

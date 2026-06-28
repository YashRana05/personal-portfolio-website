"""Simple Flask backend (no Node/npm) for the portfolio.

Run:
  python -m venv .venv
  .venv\Scripts\activate
  pip install flask flask-cors sqlalchemy
  python run_server.py

Then open:
  http://localhost:3000

This serves the same API routes as the Node version:
  GET  /api/meta
  GET  /api/projects
  GET  /api/skills
  POST /api/contact
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from sqlalchemy import create_engine, text

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "portfolio.db"
SEED_PATH = BASE_DIR / "server" / "data" / "seed.json"

app = Flask(__name__, static_folder=str(BASE_DIR))
CORS(app)

PORT = int(os.environ.get("PORT", "3000"))

engine = create_engine(f"sqlite:///{DB_PATH}", future=True)


def init_db():
    # sqlite only allows one statement per execute() call (via sqlalchemy)
    with engine.begin() as conn:
        conn.execute(text("PRAGMA journal_mode = WAL"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    name TEXT NOT NULL,
                    tagline TEXT NOT NULL,
                    bio TEXT NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    tech TEXT NOT NULL,
                    repo_url TEXT,
                    live_url TEXT,
                    sort_order INTEGER NOT NULL DEFAULT 0
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS skills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
        )




def seed_if_empty():
    with engine.begin() as conn:
        meta = conn.execute(text("SELECT name, tagline, bio FROM meta WHERE id=1"))
        meta_row = meta.mappings().first()

        projects_count = conn.execute(text("SELECT COUNT(*) AS c FROM projects"))
        skills_count = conn.execute(text("SELECT COUNT(*) AS c FROM skills"))
        projects_c = projects_count.mappings().first()["c"]
        skills_c = skills_count.mappings().first()["c"]

        if meta_row and projects_c > 0 and skills_c > 0:
            return

        seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))

        # meta
        conn.execute(
            text(
                "INSERT OR REPLACE INTO meta (id, name, tagline, bio) VALUES (1, :name, :tagline, :bio)"
            ),
            {"name": seed["meta"]["name"], "tagline": seed["meta"]["tagline"], "bio": seed["meta"]["bio"]},
        )

        conn.execute(text("DELETE FROM projects"))
        conn.execute(text("DELETE FROM skills"))

        # projects
        for p in seed.get("projects", []):
            conn.execute(
                text(
                    "INSERT INTO projects (title, description, tech, repo_url, live_url, sort_order) "
                    "VALUES (:title, :description, :tech, :repo_url, :live_url, :sort_order)"
                ),
                {
                    "title": p["title"],
                    "description": p["description"],
                    "tech": json.dumps(p.get("tech", [])),
                    "repo_url": p.get("repo_url") or None,
                    "live_url": p.get("live_url") or None,
                    "sort_order": p.get("sort_order", 0),
                },
            )

        # skills
        for idx, s in enumerate(seed.get("skills", [])):
            conn.execute(
                text(
                    "INSERT INTO skills (name, sort_order) VALUES (:name, :sort_order)"
                ),
                {"name": s, "sort_order": idx},
            )


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/meta")
def meta():
    with engine.begin() as conn:
        row = conn.execute(text("SELECT name, tagline, bio FROM meta WHERE id=1")).mappings().first()
        return jsonify(row or {"name": "Your Name", "tagline": "", "bio": ""})


@app.get("/api/projects")
def projects():
    with engine.begin() as conn:
        rows = conn.execute(
            text("""
            SELECT id, title, description, tech, repo_url, live_url
            FROM projects
            ORDER BY sort_order ASC, id DESC
            """)
        ).mappings().all()

        out = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "title": r["title"],
                    "description": r["description"],
                    "tech": json.loads(r["tech"] or "[]"),
                    "repo_url": r["repo_url"],
                    "live_url": r["live_url"],
                }
            )
        return jsonify(out)


@app.get("/api/skills")
def skills():
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT name FROM skills ORDER BY sort_order ASC, id DESC")).mappings().all()
        return jsonify([r["name"] for r in rows])


@app.post("/api/contact")
def contact():
    data = request.get_json(silent=True) or {}
    name = data.get("name")
    email = data.get("email")
    message = data.get("message")

    if not name or not email or not message:
        return "Missing fields", 400

    created_at = datetime.utcnow().isoformat() + "Z"

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO contacts (name, email, message, created_at) "
                "VALUES (:name, :email, :message, :created_at)"
            ),
            {"name": name, "email": email, "message": message, "created_at": created_at},
        )

    return jsonify({"ok": True})


# Serve frontend assets so you can open http://localhost:3000 directly
@app.get("/")
def index():
    return send_from_directory(str(BASE_DIR), "index.html")


@app.get("/styles.css")
def styles():
    return send_from_directory(str(BASE_DIR), "styles.css")


@app.get("/app.js")
def script():
    return send_from_directory(str(BASE_DIR), "app.js")


if __name__ == "__main__":
    init_db()
    seed_if_empty()
    app.run(host="0.0.0.0", port=PORT, debug=True)


# API

FastAPI, SQLModel, SQLite, and WebSocket signaling backend for the Zoom Workplace clone. The API owns users, meetings, participants, chat history, preferences, app JWTs, Google ID-token verification, and signaling authorization.

Use the repository root [`README.md`](../README.md) for local setup and [`deployment.md`](../deployment.md) for Fly.io deployment.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
cp .env.example .env
python -m app.seed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Validation commands:

```bash
.venv/bin/pytest
.venv/bin/ruff check app tests
```

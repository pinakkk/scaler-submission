# Python 3.12 matches the blueprint/runtime floor and has wheels for every
# pinned dependency. Keep the production image aligned with requires-python.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependency layer first so app edits don't invalidate the pip cache.
COPY pyproject.toml README.md ./
COPY app ./app
RUN pip install --no-cache-dir .

# SQLite lives on the Fly volume mounted at /data (§12.2).
ENV DATABASE_URL=sqlite:////data/zoom.db \
    ENVIRONMENT=production \
    PORT=8080

EXPOSE 8080

# --workers 1 is REQUIRED, not a tuning choice: RoomRegistry is in-process
# state (§9), so a second worker would split the signaling rooms in half.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]

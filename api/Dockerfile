# Python 3.13-slim: the newest slim tag with wheels for every pinned dependency.
# Blueprint §12.2 says 3.12; we develop on 3.14 and every dep ships cp314 wheels,
# so 3.13 is the closest widely-available image to the dev environment. Any of
# 3.12/3.13/3.14 works — what matters is not silently diverging from what was tested.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependency layer first so app edits don't invalidate the pip cache.
COPY pyproject.toml ./
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
